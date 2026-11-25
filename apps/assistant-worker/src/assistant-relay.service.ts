import {
  AI_CHAT_QUEUE,
  aiChatJobId,
  aiChatPublishRetryDelay,
} from '@best/ai-chat';
import { parseTeacherAiEnvironment } from '@best/config';
import {
  AiChatRunStatus,
  OutboxEventType,
  TeacherAiStore,
} from '@best/database';
import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import { AssistantDatabaseService } from './assistant-database.service';

@Injectable()
export class AssistantRelayService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AssistantRelayService.name);
  private readonly store: TeacherAiStore;
  private timer: NodeJS.Timeout | undefined;
  private polling = false;
  constructor(
    private readonly db: AssistantDatabaseService,
    @InjectQueue(AI_CHAT_QUEUE) private readonly queue: Queue,
  ) {
    this.store = new TeacherAiStore(db, () =>
      parseTeacherAiEnvironment(process.env),
    );
  }
  onApplicationBootstrap(): void {
    void this.poll();
    this.timer = setInterval(() => {
      void this.poll();
    }, 2000);
    this.timer.unref();
  }
  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      await this.store.maintain();
      if (!parseTeacherAiEnvironment(process.env).enabled) return;
      const events = await this.db.outboxEvent.findMany({
        where: {
          eventType: OutboxEventType.TEACHER_AI_CHAT_REQUESTED_V1,
          publishedAt: null,
          nextAttemptAt: { lte: new Date() },
          publishAttempts: { lt: 5 },
        },
        orderBy: { occurredAt: 'asc' },
        take: 20,
      });
      for (const event of events) {
        try {
          const data = { version: 1 as const, runId: event.aggregateId };
          await this.queue.add('teacher-chat-v1', data, {
            jobId: aiChatJobId(data),
            attempts: 1,
            removeOnComplete: true,
            removeOnFail: { count: 1000 },
          });
          await this.db.outboxEvent.update({
            where: { id: event.id },
            data: {
              publishedAt: new Date(),
              lastError: null,
              publishAttempts: { increment: 1 },
            },
          });
        } catch {
          const attempts = event.publishAttempts + 1;
          const delay = aiChatPublishRetryDelay(attempts);
          await this.db.outboxEvent.update({
            where: { id: event.id },
            data: {
              publishAttempts: { increment: 1 },
              nextAttemptAt: new Date(Date.now() + (delay ?? 60_000)),
              lastError: 'QUEUE_UNAVAILABLE',
            },
          });
          if (delay === null)
            await this.db.aiChatRun.updateMany({
              where: { id: event.aggregateId, status: AiChatRunStatus.QUEUED },
              data: {
                status: AiChatRunStatus.FAILED,
                completedAt: new Date(),
                safeErrorCode: 'SERVICE_UNAVAILABLE',
                retryable: true,
              },
            });
        }
      }
      // Redis loss and jobs deferred by a cross-process concurrency slot recover
      // from the durable run, never by repeating an external provider call.
      const waiting = await this.db.aiChatRun.findMany({
        where: {
          status: AiChatRunStatus.QUEUED,
          createdAt: { lt: new Date(Date.now() - 10_000) },
        },
        select: { id: true },
        take: 20,
      });
      for (const run of waiting) {
        const event = await this.db.outboxEvent.findUnique({
          where: {
            eventType_aggregateId: {
              eventType: OutboxEventType.TEACHER_AI_CHAT_REQUESTED_V1,
              aggregateId: run.id,
            },
          },
        });
        if (!event?.publishedAt) continue;
        const data = { version: 1 as const, runId: run.id };
        const existing = await this.queue.getJob(aiChatJobId(data));
        if (existing) {
          const state = await existing.getState();
          if (state !== 'failed' && state !== 'completed') continue;
          await existing.remove();
        }
        await this.queue.add('teacher-chat-v1', data, {
          jobId: aiChatJobId(data),
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: { count: 1000 },
        });
      }
    } catch {
      this.logger.warn({ event: 'ai_chat_relay_unavailable' });
    } finally {
      this.polling = false;
    }
  }
}

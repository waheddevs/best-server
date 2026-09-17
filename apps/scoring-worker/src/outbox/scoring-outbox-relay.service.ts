import { OutboxEventType, Prisma } from '@best/database';
import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Queue } from 'bullmq';

import { ScoringDatabaseService } from '../database/scoring-database.service';
import {
  SCORE_ATTEMPT_JOB,
  SCORING_JOB_PAYLOAD_VERSION,
  TEST_SCORING_QUEUE,
} from '../scoring/scoring.constants';

const POLL_INTERVAL_MILLISECONDS = 1_000;
const DELIVERY_BATCH_SIZE = 20;
const MAXIMUM_RETRY_DELAY_MILLISECONDS = 60_000;

@Injectable()
export class ScoringOutboxRelayService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ScoringOutboxRelayService.name);
  private interval: NodeJS.Timeout | undefined;
  private polling = false;

  constructor(
    private readonly database: ScoringDatabaseService,
    @InjectQueue(TEST_SCORING_QUEUE)
    private readonly queue: Queue,
  ) {}

  onApplicationBootstrap(): void {
    void this.poll();
    this.interval = setInterval(
      () => void this.poll(),
      POLL_INTERVAL_MILLISECONDS,
    );
    this.interval.unref();
  }

  onApplicationShutdown(): void {
    if (this.interval !== undefined) {
      clearInterval(this.interval);
    }
  }

  private async poll(): Promise<void> {
    if (this.polling) {
      return;
    }

    this.polling = true;

    try {
      const events = await this.database.outboxEvent.findMany({
        where: {
          eventType: OutboxEventType.ATTEMPT_SUBMITTED,
          nextAttemptAt: { lte: new Date() },
          publishedAt: null,
        },
        orderBy: { occurredAt: 'asc' },
        take: DELIVERY_BATCH_SIZE,
      });

      for (const event of events) {
        try {
          await this.queue.add(
            SCORE_ATTEMPT_JOB,
            {
              attemptId: event.aggregateId,
              ...(event.correlationId === null
                ? {}
                : { correlationId: event.correlationId }),
              version: SCORING_JOB_PAYLOAD_VERSION,
            },
            {
              attempts: 5,
              backoff: { delay: 1_000, type: 'exponential' },
              jobId: event.id,
              removeOnComplete: { count: 1_000 },
              removeOnFail: { count: 5_000 },
            },
          );
          await this.database.outboxEvent.update({
            where: { id: event.id },
            data: {
              lastError: null,
              publishAttempts: { increment: 1 },
              publishedAt: new Date(),
            },
          });
        } catch (error: unknown) {
          const nextAttemptNumber = event.publishAttempts + 1;
          const retryDelay = Math.min(
            2 ** Math.min(nextAttemptNumber, 10) * 1_000,
            MAXIMUM_RETRY_DELAY_MILLISECONDS,
          );
          await this.database.outboxEvent.update({
            where: { id: event.id },
            data: {
              lastError: getSafeErrorName(error),
              nextAttemptAt: new Date(Date.now() + retryDelay),
              publishAttempts: { increment: 1 },
            },
          });
          this.logger.warn({
            event: 'scoring_outbox_publish_failed',
            eventId: event.id,
            exceptionName: getSafeErrorName(error),
            prismaCode: getPrismaErrorCode(error),
            nextAttemptNumber,
          });
        }
      }
    } catch (error: unknown) {
      this.logger.error({
        event: 'scoring_outbox_poll_failed',
        exceptionName: getSafeErrorName(error),
        prismaCode: getPrismaErrorCode(error),
      });
    } finally {
      this.polling = false;
    }
  }
}

function getSafeErrorName(error: unknown): string {
  return error instanceof Error ? error.name.slice(0, 500) : 'UnknownError';
}

function getPrismaErrorCode(error: unknown): string | undefined {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code
    : undefined;
}

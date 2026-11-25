import { AI_CHAT_QUEUE, parseAiChatJob } from '@best/ai-chat';
import { parseTeacherAiEnvironment } from '@best/config';
import { TeacherAiStore } from '@best/database';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { AssistantDatabaseService } from './assistant-database.service';
import {
  AiGatewayError,
  OpenRouterChatGateway,
} from './openrouter-chat.gateway';

@Processor(AI_CHAT_QUEUE, { concurrency: 1 })
export class AssistantProcessor extends WorkerHost {
  private readonly store: TeacherAiStore;
  constructor(
    database: AssistantDatabaseService,
    private readonly gateway: OpenRouterChatGateway,
  ) {
    super();
    this.store = new TeacherAiStore(database, () =>
      parseTeacherAiEnvironment(process.env),
    );
  }
  async process(job: Job<unknown>): Promise<void> {
    const { runId } = parseAiChatJob(job.data);
    const claim = await this.store.claim(runId);
    if (!claim) return;
    const signal = AbortSignal.timeout(claim.config.timeoutMilliseconds);
    let dispatched = false;
    try {
      await this.gateway.inspect(claim.config, signal);
      if (signal.aborted)
        throw new AiGatewayError('SERVICE_UNAVAILABLE', false, true);
      dispatched = await this.store.beginDispatch(runId, claim.leaseToken);
      if (!dispatched) return;
      const result = await this.gateway.complete(
        claim.config,
        claim.messages,
        signal,
      );
      await this.store.complete(runId, claim.leaseToken, result);
    } catch (error) {
      const classified =
        error instanceof AiGatewayError
          ? error
          : new AiGatewayError(
              dispatched ? 'AMBIGUOUS' : 'SERVICE_UNAVAILABLE',
              dispatched,
              !dispatched,
            );
      await this.store.fail(
        runId,
        claim.leaseToken,
        classified.code,
        classified.ambiguous,
        classified.retryable,
      );
    }
  }
}

import {
  AttemptStatus,
  AttemptSubmissionReason,
  OutboxEventType,
  Prisma,
} from '@best/database';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import { ScoringDatabaseService } from '../database/scoring-database.service';

const POLL_INTERVAL_MILLISECONDS = 5_000;
const EXPIRY_BATCH_SIZE = 50;

@Injectable()
export class ExpiredAttemptSubmitterService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ExpiredAttemptSubmitterService.name);
  private interval: NodeJS.Timeout | undefined;
  private polling = false;

  constructor(private readonly database: ScoringDatabaseService) {}

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
      const now = new Date();
      const attempts = await this.database.attempt.findMany({
        where: {
          expiresAt: { lte: now },
          status: AttemptStatus.IN_PROGRESS,
        },
        orderBy: { expiresAt: 'asc' },
        select: {
          id: true,
          testVersion: { select: { availabilityEndsAt: true } },
        },
        take: EXPIRY_BATCH_SIZE,
      });

      for (const attempt of attempts) {
        await this.database.$transaction(async (transaction) => {
          const update = await transaction.attempt.updateMany({
            where: { id: attempt.id, status: AttemptStatus.IN_PROGRESS },
            data: {
              status: AttemptStatus.SUBMITTED,
              submissionReason:
                attempt.testVersion.availabilityEndsAt !== null &&
                attempt.testVersion.availabilityEndsAt <= now
                  ? AttemptSubmissionReason.AVAILABILITY_ENDED
                  : AttemptSubmissionReason.DURATION_EXPIRED,
              submittedAt: now,
            },
          });

          if (update.count === 0) {
            return;
          }

          await transaction.outboxEvent.create({
            data: {
              aggregateId: attempt.id,
              eventType: OutboxEventType.ATTEMPT_SUBMITTED,
              payload: { attemptId: attempt.id },
              payloadVersion: 1,
            },
          });
        });

        this.logger.log({
          attemptId: attempt.id,
          event: 'expired_attempt_submitted',
        });
      }
    } catch (error: unknown) {
      this.logger.error({
        event: 'expired_attempt_poll_failed',
        exceptionName: getSafeErrorName(error),
        prismaCode: getPrismaErrorCode(error),
      });
    } finally {
      this.polling = false;
    }
  }
}

function getSafeErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

function getPrismaErrorCode(error: unknown): string | undefined {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code
    : undefined;
}

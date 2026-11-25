import type { AttemptSubmissionReason, Prisma } from '@best/database';
import { AttemptStatus, OutboxEventType } from '@best/database';

export async function submitAttemptTransactionally(
  transaction: Prisma.TransactionClient,
  attemptId: string,
  reason: AttemptSubmissionReason,
  submittedAt: Date,
  correlationId: string | undefined,
): Promise<void> {
  const updated = await transaction.attempt.updateMany({
    where: { id: attemptId, status: AttemptStatus.IN_PROGRESS },
    data: {
      status: AttemptStatus.SUBMITTED,
      submittedAt,
      submissionReason: reason,
    },
  });

  if (updated.count === 0) {
    return;
  }

  await transaction.outboxEvent.create({
    data: {
      aggregateId: attemptId,
      correlationId: correlationId ?? null,
      eventType: OutboxEventType.ATTEMPT_SUBMITTED,
      payload: { attemptId },
      payloadVersion: 1,
    },
  });
}

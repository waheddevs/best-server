import type { Prisma } from '@best/database';

export async function writeAudit(
  tx: Prisma.TransactionClient,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  correlationId?: string,
  newValues?: Prisma.InputJsonValue,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      action,
      actorId,
      correlationId: correlationId ?? null,
      ...(newValues === undefined ? {} : { newValues }),
      targetId,
      targetType,
    },
  });
}

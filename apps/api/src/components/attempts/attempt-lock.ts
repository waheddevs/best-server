import type { Prisma } from '@best/database';

// All answer/note writers take this lock before checking status or deadlines.
// Submission (including the expiry worker's UPDATE) and discard lock the same row.
export async function lockOwnedAttempt(
  transaction: Prisma.TransactionClient,
  attemptId: string,
  studentId: string,
): Promise<void> {
  await transaction.$queryRaw`
    SELECT "id" FROM "attempts"
    WHERE "id" = ${attemptId}::uuid AND "student_id" = ${studentId}::uuid
    FOR UPDATE
  `;
}

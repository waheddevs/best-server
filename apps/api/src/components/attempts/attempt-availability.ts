import { TestVersionStatus } from '@best/database';

export function availableVersionWhere(now: Date) {
  return {
    AND: [
      {
        OR: [
          { availabilityStartsAt: null },
          { availabilityStartsAt: { lte: now } },
        ],
      },
      {
        OR: [{ availabilityEndsAt: null }, { availabilityEndsAt: { gt: now } }],
      },
    ],
    status: TestVersionStatus.PUBLISHED,
  };
}

export function calculateExpiresAt(
  startedAt: Date,
  durationMinutes: number | null,
  availabilityEndsAt: Date | null,
): Date | null {
  const durationEnd =
    durationMinutes === null
      ? null
      : new Date(startedAt.getTime() + durationMinutes * 60_000);

  if (durationEnd === null) {
    return availabilityEndsAt;
  }

  if (availabilityEndsAt === null) {
    return durationEnd;
  }

  return durationEnd < availabilityEndsAt ? durationEnd : availabilityEndsAt;
}

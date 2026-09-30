import { AttemptStatus } from '@best/database';
import type { Prisma } from '@best/database';

export interface ProgressAttempt {
  readonly assignmentKey: string;
  readonly passed: boolean | null;
  readonly percentage: Prisma.Decimal | null;
  readonly status: AttemptStatus;
  readonly updatedAt: Date;
}

export interface ProgressMetrics {
  readonly assignedCount: number;
  readonly averagePercentage: number | null;
  readonly awaitingScoreCount: number;
  readonly completedCount: number;
  readonly completionPercentage: number;
  readonly failedCount: number;
  readonly highestPercentage: number | null;
  readonly latestActivityAt: Date | null;
  readonly lowestPercentage: number | null;
  readonly passedCount: number;
  readonly remainingCount: number;
  readonly scoredCount: number;
}

export function calculateProgress(
  assignedCount: number,
  attempts: readonly ProgressAttempt[],
): ProgressMetrics {
  const completedKeys = new Set<string>();
  const awaitingScoreKeys = new Set<string>();
  const bestScoreByKey = new Map<
    string,
    { passed: boolean; percentage: number }
  >();
  let latestActivityAt: Date | null = null;

  for (const attempt of attempts) {
    if (latestActivityAt === null || attempt.updatedAt > latestActivityAt) {
      latestActivityAt = attempt.updatedAt;
    }

    if (
      attempt.status === AttemptStatus.SUBMITTED ||
      attempt.status === AttemptStatus.REVIEW_REQUIRED ||
      attempt.status === AttemptStatus.SCORED
    ) {
      completedKeys.add(attempt.assignmentKey);
    }

    if (
      attempt.status === AttemptStatus.SUBMITTED ||
      attempt.status === AttemptStatus.REVIEW_REQUIRED
    ) {
      awaitingScoreKeys.add(attempt.assignmentKey);
    }

    if (
      attempt.status !== AttemptStatus.SCORED ||
      attempt.passed === null ||
      attempt.percentage === null
    ) {
      continue;
    }

    const score = {
      passed: attempt.passed,
      percentage: attempt.percentage.toNumber(),
    };
    const previous = bestScoreByKey.get(attempt.assignmentKey);

    if (
      previous === undefined ||
      score.percentage > previous.percentage ||
      (score.percentage === previous.percentage && score.passed)
    ) {
      bestScoreByKey.set(attempt.assignmentKey, score);
    }
  }

  const bestScores = [...bestScoreByKey.values()];
  const percentages = bestScores.map(({ percentage }) => percentage);
  const completedCount = completedKeys.size;

  return {
    assignedCount,
    averagePercentage:
      percentages.length === 0
        ? null
        : roundPercentage(
            percentages.reduce((total, percentage) => total + percentage, 0) /
              percentages.length,
          ),
    awaitingScoreCount: awaitingScoreKeys.size,
    completedCount,
    completionPercentage:
      assignedCount === 0
        ? 0
        : roundPercentage((completedCount / assignedCount) * 100),
    failedCount: bestScores.filter(({ passed }) => !passed).length,
    highestPercentage:
      percentages.length === 0 ? null : Math.max(...percentages),
    latestActivityAt,
    lowestPercentage:
      percentages.length === 0 ? null : Math.min(...percentages),
    passedCount: bestScores.filter(({ passed }) => passed).length,
    remainingCount: assignedCount - completedCount,
    scoredCount: bestScores.length,
  };
}

function roundPercentage(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

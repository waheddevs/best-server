export interface ProgressMetrics {
  readonly assignedCount: number;
  readonly attemptCount: number;
  readonly averagePercentage: number | null;
  readonly awaitingScoreCount: number;
  readonly completedCount: number;
  readonly completionPercentage: number;
  readonly failedCount: number;
  readonly hasInProgressAttempt: boolean;
  readonly highestPercentage: number | null;
  readonly latestActivityAt: Date | null;
  readonly lowestPercentage: number | null;
  readonly passedCount: number;
  readonly remainingCount: number;
  readonly scoredCount: number;
}

export function emptyProgress(assignedCount: number): ProgressMetrics {
  return {
    assignedCount,
    attemptCount: 0,
    averagePercentage: null,
    awaitingScoreCount: 0,
    completedCount: 0,
    completionPercentage: 0,
    failedCount: 0,
    hasInProgressAttempt: false,
    highestPercentage: null,
    latestActivityAt: null,
    lowestPercentage: null,
    passedCount: 0,
    remainingCount: assignedCount,
    scoredCount: 0,
  };
}

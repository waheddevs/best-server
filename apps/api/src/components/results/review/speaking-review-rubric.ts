import { ErrorCode } from '../../../libs/enums/error-code.enum';
import { ApplicationError } from '../../../libs/errors/application.error';

export function isIeltsBand(value: number): boolean {
  return (
    Number.isFinite(value) && value >= 0 && value <= 9 && (value * 2) % 1 === 0
  );
}

export function mapSpeakingReview(
  review: {
    feedback: string | null;
    practiceBand: { toNumber(): number };
    releasedAt: Date | null;
    reviewedAt: Date;
    updatedAt: Date;
    rubricScores: unknown;
  } | null,
) {
  if (review === null) {
    return null;
  }
  const scores = review.rubricScores;
  if (!isRecord(scores)) {
    throw new ApplicationError(
      ErrorCode.INTERNAL_SERVER_ERROR,
      'The Speaking review rubric is invalid',
      500,
    );
  }
  return {
    feedback: review.feedback,
    fluencyCoherence: requireRubricScore(scores, 'fluencyCoherence'),
    grammaticalRangeAccuracy: requireRubricScore(
      scores,
      'grammaticalRangeAccuracy',
    ),
    lexicalResource: requireRubricScore(scores, 'lexicalResource'),
    practiceBand: review.practiceBand.toNumber(),
    pronunciation: requireRubricScore(scores, 'pronunciation'),
    releasedAt: review.releasedAt,
    reviewedAt: review.reviewedAt,
    updatedAt: review.updatedAt,
  };
}

export function requireRubricScore(
  scores: Record<string, unknown>,
  key: string,
): number {
  const value = scores[key];
  if (typeof value !== 'number' || !isIeltsBand(value)) {
    throw new ApplicationError(
      ErrorCode.INTERNAL_SERVER_ERROR,
      'The Speaking review rubric is invalid',
      500,
    );
  }
  return value;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

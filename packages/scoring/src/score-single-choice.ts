export interface SingleChoiceQuestionScoreInput {
  readonly correctOptionId: string;
  readonly questionId: string;
  readonly selectedOptionId?: string;
}

export interface SingleChoiceScoreInput {
  readonly passingPercentage: number;
  readonly questions: readonly SingleChoiceQuestionScoreInput[];
}

export interface SingleChoiceScore {
  readonly correctAnswerCount: number;
  readonly passed: boolean;
  readonly percentage: number;
  readonly scoringRuleVersion: 'single-choice-v1';
  readonly totalQuestionCount: number;
}

const SCORING_RULE_VERSION = 'single-choice-v1';

export function scoreSingleChoice({
  passingPercentage,
  questions,
}: SingleChoiceScoreInput): SingleChoiceScore {
  if (
    !Number.isInteger(passingPercentage) ||
    passingPercentage < 0 ||
    passingPercentage > 100
  ) {
    throw new Error('passingPercentage must be an integer between 0 and 100');
  }

  if (questions.length === 0) {
    throw new Error('at least one question is required for scoring');
  }

  const seenQuestionIds = new Set<string>();
  let correctAnswerCount = 0;

  for (const question of questions) {
    if (
      question.questionId.length === 0 ||
      question.correctOptionId.length === 0
    ) {
      throw new Error('question and correct option identifiers are required');
    }

    if (seenQuestionIds.has(question.questionId)) {
      throw new Error('question identifiers must be unique');
    }

    seenQuestionIds.add(question.questionId);

    if (question.selectedOptionId === question.correctOptionId) {
      correctAnswerCount += 1;
    }
  }

  const totalQuestionCount = questions.length;
  const percentageBasisPoints = Math.round(
    (correctAnswerCount * 10_000) / totalQuestionCount,
  );

  return {
    correctAnswerCount,
    passed: percentageBasisPoints >= passingPercentage * 100,
    percentage: percentageBasisPoints / 100,
    scoringRuleVersion: SCORING_RULE_VERSION,
    totalQuestionCount,
  };
}

export type ObjectiveQuestionKind =
  | 'MATCHING'
  | 'MULTIPLE_CHOICE'
  | 'SHORT_TEXT'
  | 'SINGLE_CHOICE'
  | 'TRUE_FALSE_NOT_GIVEN'
  | 'YES_NO_NOT_GIVEN';

export interface ObjectiveQuestionScoreInput {
  readonly acceptedTextValues?: readonly string[];
  readonly correctOptionIds?: readonly string[];
  readonly kind: ObjectiveQuestionKind;
  readonly questionId: string;
  readonly selectedOptionIds?: readonly string[];
  readonly textValue?: string;
}

export interface ObjectiveQuestionScore {
  readonly correct: boolean;
  readonly questionId: string;
}

export interface ObjectiveScoreInput {
  readonly passingPercentage: number;
  readonly questions: readonly ObjectiveQuestionScoreInput[];
}

export interface ObjectiveScore {
  readonly correctAnswerCount: number;
  readonly passed: boolean;
  readonly percentage: number;
  readonly questions: readonly ObjectiveQuestionScore[];
  readonly scoringRuleVersion: 'objective-v2';
  readonly totalQuestionCount: number;
}

const OPTION_KINDS = new Set<ObjectiveQuestionKind>([
  'MATCHING',
  'MULTIPLE_CHOICE',
  'SINGLE_CHOICE',
  'TRUE_FALSE_NOT_GIVEN',
  'YES_NO_NOT_GIVEN',
]);

export function normalizeObjectiveText(value: string): string {
  return value.trim().toLocaleLowerCase('en').replace(/\s+/gu, ' ');
}

export function scoreObjective({
  passingPercentage,
  questions,
}: ObjectiveScoreInput): ObjectiveScore {
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
  const questionScores = questions.map((question) => {
    if (question.questionId.length === 0) {
      throw new Error('question identifiers are required');
    }
    if (seenQuestionIds.has(question.questionId)) {
      throw new Error('question identifiers must be unique');
    }
    seenQuestionIds.add(question.questionId);

    const correct = OPTION_KINDS.has(question.kind)
      ? equalSets(
          requireNonEmpty(question.correctOptionIds, 'correct option'),
          question.selectedOptionIds ?? [],
        )
      : requireNonEmpty(
          question.acceptedTextValues,
          'accepted text answer',
        )
          .map(normalizeObjectiveText)
          .includes(normalizeObjectiveText(question.textValue ?? ''));

    return { correct, questionId: question.questionId };
  });

  const correctAnswerCount = questionScores.filter(({ correct }) => correct).length;
  const totalQuestionCount = questionScores.length;
  const percentageBasisPoints = Math.round(
    (correctAnswerCount * 10_000) / totalQuestionCount,
  );

  return {
    correctAnswerCount,
    passed: percentageBasisPoints >= passingPercentage * 100,
    percentage: percentageBasisPoints / 100,
    questions: questionScores,
    scoringRuleVersion: 'objective-v2',
    totalQuestionCount,
  };
}

function requireNonEmpty(
  values: readonly string[] | undefined,
  label: string,
): readonly string[] {
  if (values === undefined || values.length === 0 || values.some((value) => value.length === 0)) {
    throw new Error(`${label} data is required`);
  }
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} data must be unique`);
  }
  return values;
}

function equalSets(left: readonly string[], right: readonly string[]): boolean {
  if (new Set(right).size !== right.length || left.length !== right.length) {
    return false;
  }
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

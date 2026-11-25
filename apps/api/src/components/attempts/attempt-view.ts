import type { Prisma } from '@best/database';
import { AttemptStatus } from '@best/database';
import { ErrorCode } from '../../libs/enums/error-code.enum';
import { ApplicationError } from '../../libs/errors/application.error';

export function mapStudentTablePayload(value: Prisma.JsonValue | null): {
  headerRows: string[][];
  rows: string[][];
} {
  if (value === null || Array.isArray(value) || typeof value !== 'object')
    return { headerRows: [], rows: [] };
  return {
    headerRows: parseStudentTableRows(value.headerRows),
    rows: parseStudentTableRows(value.rows),
  };
}

export function parseStudentTableRows(
  value: Prisma.JsonValue | undefined,
): string[][] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is string[] =>
      Array.isArray(row) && row.every((cell) => typeof cell === 'string'),
  );
}

export interface ResultFields {
  readonly correctAnswerCount: number | null;
  readonly passed: boolean | null;
  readonly percentage: Prisma.Decimal | null;
  readonly status: AttemptStatus;
  readonly totalQuestionCount: number | null;
}

export function mapResult(attempt: ResultFields) {
  if (attempt.status !== AttemptStatus.SCORED) {
    return null;
  }

  if (
    attempt.correctAnswerCount === null ||
    attempt.totalQuestionCount === null ||
    attempt.percentage === null ||
    attempt.passed === null
  ) {
    throw new ApplicationError(
      ErrorCode.INTERNAL_SERVER_ERROR,
      'The scored attempt is incomplete',
      500,
    );
  }

  return {
    correctAnswerCount: attempt.correctAnswerCount,
    passed: attempt.passed,
    percentage: attempt.percentage.toNumber(),
    totalQuestionCount: attempt.totalQuestionCount,
  };
}

export interface TranslatedVersionFields {
  readonly questions: readonly {
    readonly options: readonly {
      readonly translations: readonly { readonly id: string }[];
    }[];
    readonly translations: readonly { readonly id: string }[];
  }[];
  readonly translations: readonly { readonly id: string }[];
}

export function hasCompleteTranslation(
  version: TranslatedVersionFields,
): boolean {
  return (
    version.translations.length === 1 &&
    version.questions.every(
      (question) =>
        question.translations.length === 1 &&
        question.options.every((option) => option.translations.length === 1),
    )
  );
}

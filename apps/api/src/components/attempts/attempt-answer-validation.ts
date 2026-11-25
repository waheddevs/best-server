import type { Prisma } from '@best/database';
import { ErrorCode } from '../../libs/enums/error-code.enum';
import { ApplicationError } from '../../libs/errors/application.error';

export async function ensureOptionsBelongToQuestion(
  transaction: Prisma.TransactionClient,
  questionId: string,
  optionIds: readonly string[],
): Promise<void> {
  const count = await transaction.answerOption.count({
    where: { id: { in: [...optionIds] }, questionId },
  });
  if (count !== optionIds.length) {
    throw new ApplicationError(
      ErrorCode.BAD_USER_INPUT,
      'One or more selected options do not belong to this question',
      400,
    );
  }
}

export function invalidResponseShapeError(): ApplicationError {
  return new ApplicationError(
    ErrorCode.BAD_USER_INPUT,
    'The saved response does not match this question type',
    400,
  );
}

export function countWords(value: string): number {
  return value.split(/\s+/u).filter(Boolean).length;
}

export function sameStringSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

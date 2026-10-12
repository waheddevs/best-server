import { ErrorCode } from '../enums/error-code.enum';
import { ApplicationError } from '../errors/application.error';
import { parseUuid } from './cursor-pagination';
import type { AdminDirectoryInput } from '../../schemas/groups/admin-directory.input';
export function directoryInput(input: AdminDirectoryInput) {
  if (
    !Number.isInteger(input.page) ||
    input.page < 1 ||
    !Number.isInteger(input.pageSize) ||
    input.pageSize < 1 ||
    input.pageSize > 100
  )
    throw directoryError('Invalid page');
  if ((input.search?.length ?? 0) > 160)
    throw directoryError('Search is too long');
  for (const key of ['teacherId', 'groupId', 'studentId'] as const)
    if (input[key]) parseUuid(input[key], key);
  if (input.month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month))
    throw directoryError('Invalid month');
  if (input.search) input.search = input.search.trim();
  return input;
}
export function directoryPage<T>(rows: T[], input: AdminDirectoryInput) {
  return {
    nodes: rows.slice(
      (input.page - 1) * input.pageSize,
      input.page * input.pageSize,
    ),
    totalCount: rows.length,
    page: input.page,
    pageCount: Math.max(1, Math.ceil(rows.length / input.pageSize)),
  };
}
export function directoryError(message: string, conflict = false) {
  return new ApplicationError(
    conflict ? ErrorCode.CONFLICT : ErrorCode.BAD_USER_INPUT,
    message,
    conflict ? 409 : 400,
  );
}
export function wholeUzs(value: string) {
  if (!/^\d{1,13}$/.test(value))
    throw directoryError('Invalid whole UZS amount');
  return BigInt(value);
}
export function directoryEnum<T extends string>(
  value: string | undefined,
  values: readonly T[],
): T | undefined {
  if (!value) return undefined;
  const found = values.find((item) => item === value);
  if (!found) throw directoryError('Invalid status or category');
  return found;
}

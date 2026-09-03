import { ApplicationError } from '../errors/application.error';
import { ErrorCode } from '../enums/error-code.enum';

const DEFAULT_PAGE_SIZE = 20;
const MAXIMUM_PAGE_SIZE = 100;

export function parsePageSize(first: number | undefined): number {
  const pageSize = first ?? DEFAULT_PAGE_SIZE;

  if (
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > MAXIMUM_PAGE_SIZE
  ) {
    throw new ApplicationError(
      ErrorCode.BAD_USER_INPUT,
      `first must be an integer between 1 and ${String(MAXIMUM_PAGE_SIZE)}`,
      400,
    );
  }

  return pageSize;
}

export function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined): string | undefined {
  if (cursor === undefined) {
    return undefined;
  }

  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');

    if (!isUuid(decoded)) {
      throw new Error('invalid cursor value');
    }

    return decoded;
  } catch {
    throw new ApplicationError(
      ErrorCode.BAD_USER_INPUT,
      'after must be a valid opaque cursor',
      400,
    );
  }
}

export function parseUuid(value: string, fieldName: string): string {
  if (!isUuid(value)) {
    throw new ApplicationError(
      ErrorCode.BAD_USER_INPUT,
      `${fieldName} must be a valid ID`,
      400,
    );
  }

  return value;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

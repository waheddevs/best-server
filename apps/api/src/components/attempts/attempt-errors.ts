import { ErrorCode } from '../../libs/enums/error-code.enum';
import { ApplicationError } from '../../libs/errors/application.error';

export function unavailableTestError(): ApplicationError {
  return new ApplicationError(
    ErrorCode.TEST_NOT_AVAILABLE,
    'The requested test is not available',
    409,
  );
}

export function inaccessibleAttemptError(): ApplicationError {
  return new ApplicationError(
    ErrorCode.NOT_FOUND,
    'The requested attempt was not found',
    404,
  );
}

export function unavailableTranslationError(): ApplicationError {
  return new ApplicationError(
    ErrorCode.TRANSLATION_NOT_AVAILABLE,
    'The requested test translation is not available',
    400,
  );
}

export function getPrismaErrorCode(error: unknown): string | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  const code = error.code;
  return typeof code === 'string' ? code : undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

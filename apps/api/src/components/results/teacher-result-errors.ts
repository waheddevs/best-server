import { ErrorCode } from '../../libs/enums/error-code.enum';
import { ApplicationError } from '../../libs/errors/application.error';

export function notFound(resourceName: string): ApplicationError {
  return new ApplicationError(
    ErrorCode.NOT_FOUND,
    `${resourceName} was not found`,
    404,
  );
}

export function translationNotAvailable(): ApplicationError {
  return new ApplicationError(
    ErrorCode.TRANSLATION_NOT_AVAILABLE,
    'The requested result translation is not available',
    400,
  );
}

export function reviewConflict(): ApplicationError {
  return new ApplicationError(
    ErrorCode.CONFLICT,
    'The Writing review changed in another session. Reload before saving.',
    409,
  );
}

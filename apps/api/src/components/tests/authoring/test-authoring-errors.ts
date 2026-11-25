import { Prisma } from '@best/database';
import { ErrorCode } from '../../../libs/enums/error-code.enum';
import { ApplicationError } from '../../../libs/errors/application.error';

export function validationError(message: string): ApplicationError {
  return new ApplicationError(ErrorCode.BAD_USER_INPUT, message, 400);
}

export function notFound(): ApplicationError {
  return new ApplicationError(
    ErrorCode.NOT_FOUND,
    'The requested test resource was not found',
    404,
  );
}

export function uniqueError(error: unknown, message: string): ApplicationError {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  )
    return new ApplicationError(ErrorCode.CONFLICT, message, 409);
  throw error;
}

import { UserRole } from '@best/database';
import { ErrorCode } from '../../../libs/enums/error-code.enum';
import { ApplicationError } from '../../../libs/errors/application.error';
const GENERIC_LOGIN_MESSAGE = 'The supplied login details are invalid';

export function isCredentialRole(role: UserRole): boolean {
  return CREDENTIAL_ROLES.has(role);
}

const CREDENTIAL_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.STUDENT,
  UserRole.TEACHER,
  UserRole.ADMIN,
]);

export function genericLoginError(): ApplicationError {
  return new ApplicationError(
    ErrorCode.UNAUTHENTICATED,
    GENERIC_LOGIN_MESSAGE,
    401,
  );
}

export function loginFieldError(
  field: 'email' | 'firstName' | 'lastName' | 'name' | 'password',
): ApplicationError {
  const code = {
    email: ErrorCode.LOGIN_EMAIL_INVALID,
    firstName: ErrorCode.LOGIN_FIRST_NAME_INVALID,
    lastName: ErrorCode.LOGIN_LAST_NAME_INVALID,
    name: ErrorCode.LOGIN_NAME_INVALID,
    password: ErrorCode.LOGIN_PASSWORD_INVALID,
  }[field];
  return new ApplicationError(code, GENERIC_LOGIN_MESSAGE, 401);
}

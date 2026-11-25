import { createHmac } from 'node:crypto';
import type { AuthEnvironment } from '@best/config';
import { UserRole, UserStatus } from '@best/database';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import type { BeginCredentialLoginInput } from '../../../schemas/auth/credential-login.input';
import type { CredentialLoginPayloadObject } from '../../../schemas/auth/credential-login.object';
import { AUTH_ENVIRONMENT } from '../auth.constants';
import { CredentialPasswordService } from './credential-password.service';
import { isValidLoginEmail } from './login-email';
import { CredentialSessionService } from './credential-session.service';
import {
  genericLoginError,
  isCredentialRole,
  loginFieldError,
} from './credential-policy';

const LOGIN_LOCK_MILLISECONDS = 15 * 60 * 1000;
const MAXIMUM_LOGIN_FAILURES = 5;
const MAXIMUM_NAME_LENGTH = 160;
const MAXIMUM_PASSWORD_LENGTH = 128;

@Injectable()
export class CredentialLoginService {
  constructor(
    private readonly database: DatabaseService,
    private readonly sessions: CredentialSessionService,
    private readonly passwordService: CredentialPasswordService,
    @Inject(AUTH_ENVIRONMENT) private readonly environment: AuthEnvironment,
  ) {}
  async login(
    input: BeginCredentialLoginInput,
    correlationId?: string,
  ): Promise<CredentialLoginPayloadObject> {
    const user = await this.validateCredentials(input);
    return { session: await this.sessions.createSession(user, correlationId) };
  }
  private async validateCredentials(input: BeginCredentialLoginInput) {
    const email = normalizeEmail(
      input.email,
      this.environment.allowReservedLoginEmails,
    );
    const name = normalizeName(input.name);
    const separateName =
      input.firstName === undefined && input.lastName === undefined
        ? undefined
        : {
            firstName: normalizeNamePart(input.firstName ?? '', 'firstName'),
            lastName: normalizeNamePart(input.lastName ?? '', 'lastName'),
          };
    if (
      separateName !== undefined &&
      `${separateName.firstName} ${separateName.lastName}` !== name
    ) {
      throw genericLoginError();
    }
    const password = normalizeLoginPassword(input.password);
    const throttleKey = this.hashValue(`login:${email}`);
    const now = new Date();
    const throttle = await this.database.credentialLoginThrottle.findUnique({
      where: { keyHash: throttleKey },
    });

    if (throttle?.lockedUntil !== null && throttle?.lockedUntil !== undefined) {
      if (throttle.lockedUntil > now) {
        throw genericLoginError();
      }
    }

    const user = await this.database.user.findUnique({
      where: { email },
      select: {
        credentialPasswordHash: true,
        displayName: true,
        email: true,
        id: true,
        role: true,
        status: true,
      },
    });
    const passwordMatches = await this.passwordService.verifyPassword(
      password,
      user?.credentialPasswordHash,
    );
    if (user?.email === undefined || user.email === null) {
      await this.registerLoginFailure(throttleKey, now);
      throw loginFieldError('email');
    }
    if (
      user.status !== UserStatus.ACTIVE ||
      !isCredentialRole(user.role) ||
      user.role !== input.expectedRole
    ) {
      await this.registerLoginFailure(throttleKey, now);
      throw genericLoginError();
    }
    if (!passwordMatches) {
      await this.registerLoginFailure(throttleKey, now);
      throw loginFieldError('password');
    }
    const nameError =
      separateName === undefined
        ? profileNameMatches(user.displayName, name, user.role)
          ? undefined
          : 'name'
        : profileNameFieldError(
            user.displayName,
            separateName.firstName,
            separateName.lastName,
            user.role,
          );
    if (nameError !== undefined) {
      await this.registerLoginFailure(throttleKey, now);
      throw loginFieldError(nameError);
    }

    await this.database.credentialLoginThrottle.deleteMany({
      where: { keyHash: throttleKey },
    });

    return { ...user, email: user.email };
  }

  private hashValue(value: string): string {
    return createHmac('sha256', this.environment.loginHashSecret)
      .update(value)
      .digest('hex');
  }

  private async registerLoginFailure(
    keyHash: string,
    now: Date,
  ): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const current = await transaction.credentialLoginThrottle.findUnique({
        where: { keyHash },
      });
      const lockExpired =
        current?.lockedUntil !== null &&
        current?.lockedUntil !== undefined &&
        current.lockedUntil <= now;
      const nextFailures =
        current === null || lockExpired
          ? 1
          : Math.min(current.failures + 1, MAXIMUM_LOGIN_FAILURES);
      const lockedUntil =
        nextFailures >= MAXIMUM_LOGIN_FAILURES
          ? new Date(now.getTime() + LOGIN_LOCK_MILLISECONDS)
          : null;

      await transaction.credentialLoginThrottle.upsert({
        where: { keyHash },
        create: { failures: nextFailures, keyHash, lockedUntil },
        update: { failures: nextFailures, lockedUntil },
      });
    });
  }
}
function normalizeEmail(value: string, allowReservedDomains: boolean): string {
  const email = value.trim().toLowerCase();

  if (!isValidLoginEmail(email, allowReservedDomains)) {
    throw loginFieldError('email');
  }

  return email;
}

function normalizeName(value: string): string {
  const name = value.normalize('NFKC').trim().replace(/\s+/g, ' ');

  if (name.length < 1 || name.length > MAXIMUM_NAME_LENGTH) {
    throw loginFieldError('name');
  }

  return name.toLocaleLowerCase('en-US');
}

function normalizeNamePart(
  value: string,
  field: 'firstName' | 'lastName',
): string {
  const name = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > MAXIMUM_NAME_LENGTH) {
    throw loginFieldError(field);
  }
  return name.toLocaleLowerCase('en-US');
}

function profileNameFieldError(
  displayName: string,
  firstName: string,
  lastName: string,
  role: UserRole,
): 'firstName' | 'lastName' | undefined {
  const storedName = normalizeName(displayName);
  if (storedName === `${firstName} ${lastName}`) return undefined;

  // A legacy Teacher profile can have only a given name until Settings saves the surname.
  if (role === UserRole.TEACHER && storedName === firstName) return undefined;

  if (storedName.startsWith(`${firstName} `)) return 'lastName';
  return 'firstName';
}

function profileNameMatches(
  displayName: string,
  presentedName: string,
  role: UserRole,
): boolean {
  const storedName = normalizeName(displayName);
  if (storedName === presentedName) return true;

  // Legacy Teacher accounts can have only a given name until the surname is saved in Settings.
  return (
    role === UserRole.TEACHER &&
    !storedName.includes(' ') &&
    presentedName.startsWith(`${storedName} `)
  );
}

function normalizeLoginPassword(value: string): string {
  if (value.length < 1 || value.length > MAXIMUM_PASSWORD_LENGTH) {
    throw loginFieldError('password');
  }

  return value;
}

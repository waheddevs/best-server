import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

import type { AuthEnvironment } from '@best/config';
import { UserRole, UserStatus } from '@best/database';
import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import { ErrorCode } from '../../libs/enums/error-code.enum';
import { ApplicationError } from '../../libs/errors/application.error';
import type {
  BeginCredentialLoginInput,
  RefreshCredentialSessionInput,
  ResendCredentialLoginCodeInput,
  RevokeCredentialSessionInput,
  VerifyCredentialLoginInput,
} from '../../schemas/auth/credential-login.input';
import type {
  CredentialLoginChallengePayloadObject,
  CredentialLoginSuccessPayloadObject,
} from '../../schemas/auth/credential-login.object';
import { AUTH_ENVIRONMENT, CREDENTIAL_EMAIL_SENDER } from './auth.constants';
import { AuthService } from './auth.service';
import type { CredentialEmailSender } from './credential-email-sender.type';
import { CredentialPasswordService } from './credential-password.service';

const CHALLENGE_TTL_MILLISECONDS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MILLISECONDS = 60 * 1000;
const LOGIN_LOCK_MILLISECONDS = 15 * 60 * 1000;
const MAXIMUM_LOGIN_FAILURES = 5;
const MAXIMUM_CODE_ATTEMPTS = 5;
const MAXIMUM_EMAIL_LENGTH = 320;
const MAXIMUM_NAME_LENGTH = 160;
const MAXIMUM_PASSWORD_LENGTH = 128;
const GENERIC_LOGIN_MESSAGE = 'The supplied login details are invalid';
const REFRESH_SESSION_ABSOLUTE_TTL_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_SESSION_IDLE_TTL_MILLISECONDS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_SECRET_BYTES = 32;

interface RefreshTokenMaterial {
  readonly hash: string;
  readonly id: string;
  readonly token: string;
}

type RefreshTransactionResult =
  | { readonly kind: 'invalid' }
  | { readonly kind: 'reused' }
  | {
      readonly kind: 'success';
      readonly refreshExpiresAt: Date;
      readonly refreshToken: string;
      readonly user: {
        readonly displayName: string;
        readonly id: string;
        readonly role: UserRole;
      };
    };

@Injectable()
export class CredentialAuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authService: AuthService,
    private readonly passwordService: CredentialPasswordService,
    @Inject(CREDENTIAL_EMAIL_SENDER)
    private readonly emailSender: CredentialEmailSender,
    @Inject(AUTH_ENVIRONMENT)
    private readonly environment: AuthEnvironment,
  ) {}

  async beginLogin(
    input: BeginCredentialLoginInput,
  ): Promise<CredentialLoginChallengePayloadObject> {
    const email = normalizeEmail(input.email);
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
        preferredLanguage: true,
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

    const challengeId = randomUUID();
    const code = generateSixDigitCode();
    const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MILLISECONDS);
    const resendAvailableAt = new Date(
      now.getTime() + RESEND_COOLDOWN_MILLISECONDS,
    );

    await this.database.$transaction(async (transaction) => {
      await transaction.credentialLoginChallenge.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      });
      await transaction.credentialLoginChallenge.create({
        data: {
          codeHash: this.hashCode(challengeId, code),
          expiresAt,
          id: challengeId,
          resendAvailableAt,
          userId: user.id,
        },
      });
    });

    try {
      await this.emailSender.sendLoginCode({
        code,
        displayName: user.displayName,
        language: user.preferredLanguage,
        to: user.email,
      });
    } catch (error: unknown) {
      await this.database.credentialLoginChallenge.deleteMany({
        where: { id: challengeId },
      });
      throw error;
    }

    return {
      challengeId,
      expiresAt,
      maskedEmail: maskEmail(user.email),
      resendAvailableAt,
    };
  }

  async resendCode(
    input: ResendCredentialLoginCodeInput,
  ): Promise<CredentialLoginChallengePayloadObject> {
    const challengeId = parseChallengeId(input.challengeId);
    const now = new Date();
    const challenge = await this.database.credentialLoginChallenge.findUnique({
      where: { id: challengeId },
      include: {
        user: {
          select: {
            credentialPasswordHash: true,
            displayName: true,
            email: true,
            preferredLanguage: true,
            role: true,
            status: true,
          },
        },
      },
    });

    if (
      challenge?.usedAt === undefined ||
      challenge.usedAt !== null ||
      challenge.expiresAt <= now ||
      challenge.attempts >= MAXIMUM_CODE_ATTEMPTS ||
      challenge.user.email === null ||
      challenge.user.credentialPasswordHash === null ||
      challenge.user.status !== UserStatus.ACTIVE ||
      !isCredentialRole(challenge.user.role)
    ) {
      throw genericLoginError();
    }

    if (challenge.resendAvailableAt > now) {
      throw resendRateLimitError();
    }

    const code = generateSixDigitCode();
    const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MILLISECONDS);
    const resendAvailableAt = new Date(
      now.getTime() + RESEND_COOLDOWN_MILLISECONDS,
    );
    const update = await this.database.credentialLoginChallenge.updateMany({
      where: {
        attempts: { lt: MAXIMUM_CODE_ATTEMPTS },
        expiresAt: { gt: now },
        id: challengeId,
        resendAvailableAt: { lte: now },
        usedAt: null,
      },
      data: {
        attempts: 0,
        codeHash: this.hashCode(challengeId, code),
        expiresAt,
        resendAvailableAt,
      },
    });

    if (update.count !== 1) {
      throw resendRateLimitError();
    }

    try {
      await this.emailSender.sendLoginCode({
        code,
        displayName: challenge.user.displayName,
        language: challenge.user.preferredLanguage,
        to: challenge.user.email,
      });
    } catch (error: unknown) {
      await this.database.credentialLoginChallenge.deleteMany({
        where: { id: challengeId },
      });
      throw error;
    }

    return {
      challengeId,
      expiresAt,
      maskedEmail: maskEmail(challenge.user.email),
      resendAvailableAt,
    };
  }

  async verifyLogin(
    input: VerifyCredentialLoginInput,
    correlationId?: string,
  ): Promise<CredentialLoginSuccessPayloadObject> {
    const challengeId = parseChallengeId(input.challengeId);
    const code = parseCode(input.code);
    const now = new Date();
    const challenge = await this.database.credentialLoginChallenge.findUnique({
      where: { id: challengeId },
      include: {
        user: {
          select: {
            credentialPasswordHash: true,
            displayName: true,
            emailVerifiedAt: true,
            id: true,
            role: true,
            status: true,
          },
        },
      },
    });

    if (
      challenge?.usedAt === undefined ||
      challenge.usedAt !== null ||
      challenge.expiresAt <= now ||
      challenge.attempts >= MAXIMUM_CODE_ATTEMPTS
    ) {
      throw loginFieldError('code');
    }
    if (
      challenge.user.credentialPasswordHash === null ||
      challenge.user.status !== UserStatus.ACTIVE ||
      !isCredentialRole(challenge.user.role)
    ) {
      throw genericLoginError();
    }

    const expectedHash = this.hashCode(challengeId, code);

    if (!hashesMatch(challenge.codeHash, expectedHash)) {
      await this.database.$transaction(async (transaction) => {
        await transaction.credentialLoginChallenge.updateMany({
          where: {
            attempts: { lt: MAXIMUM_CODE_ATTEMPTS },
            expiresAt: { gt: now },
            id: challengeId,
            usedAt: null,
          },
          data: { attempts: { increment: 1 } },
        });
        await transaction.credentialLoginChallenge.updateMany({
          where: {
            attempts: { gte: MAXIMUM_CODE_ATTEMPTS },
            id: challengeId,
            usedAt: null,
          },
          data: { usedAt: now },
        });
      });
      throw loginFieldError('code');
    }

    const refreshToken = createRefreshTokenMaterial();
    const refreshExpiresAt = new Date(
      now.getTime() + REFRESH_SESSION_ABSOLUTE_TTL_MILLISECONDS,
    );
    const idleExpiresAt = new Date(
      now.getTime() + REFRESH_SESSION_IDLE_TTL_MILLISECONDS,
    );
    const user = await this.database.$transaction(async (transaction) => {
      const consumed = await transaction.credentialLoginChallenge.updateMany({
        where: {
          attempts: { lt: MAXIMUM_CODE_ATTEMPTS },
          codeHash: expectedHash,
          expiresAt: { gt: now },
          id: challengeId,
          usedAt: null,
        },
        data: { usedAt: now },
      });

      if (consumed.count !== 1) {
        throw loginFieldError('code');
      }

      const activeUser = await transaction.user.findFirst({
        where: {
          credentialPasswordHash: { not: null },
          id: challenge.user.id,
          status: UserStatus.ACTIVE,
        },
        select: { displayName: true, id: true, role: true },
      });

      if (activeUser === null || !isCredentialRole(activeUser.role)) {
        throw genericLoginError();
      }

      if (challenge.user.emailVerifiedAt === null) {
        await transaction.user.update({
          where: { id: activeUser.id },
          data: { emailVerifiedAt: now },
        });
      }

      const session = await transaction.credentialSession.create({
        data: {
          createdAt: now,
          expiresAt: refreshExpiresAt,
          idleExpiresAt,
          lastUsedAt: now,
          userId: activeUser.id,
        },
        select: { id: true },
      });
      await transaction.credentialRefreshToken.create({
        data: {
          createdAt: now,
          id: refreshToken.id,
          sessionId: session.id,
          tokenHash: refreshToken.hash,
        },
      });

      await transaction.auditLog.create({
        data: {
          action: 'AUTH_CREDENTIAL_LOGIN_VERIFIED',
          actorId: activeUser.id,
          correlationId: correlationId ?? null,
          targetId: activeUser.id,
          targetType: 'USER',
        },
      });

      return activeUser;
    });

    return {
      accessToken: await this.authService.issueAccessToken(user),
      expiresInSeconds: this.environment.accessTokenTtlSeconds,
      refreshExpiresAt,
      refreshToken: refreshToken.token,
      user,
    };
  }

  async refreshSession(
    input: RefreshCredentialSessionInput,
    correlationId?: string,
  ): Promise<CredentialLoginSuccessPayloadObject> {
    const presentedToken = parseRefreshToken(input.refreshToken);
    if (presentedToken === undefined) throw genericLoginError();

    const now = new Date();
    const replacementToken = createRefreshTokenMaterial();
    const result = await this.database.$transaction<RefreshTransactionResult>(
      async (transaction) => {
        const token = await transaction.credentialRefreshToken.findUnique({
          where: { id: presentedToken.id },
          include: {
            session: {
              include: {
                user: {
                  select: {
                    credentialPasswordHash: true,
                    displayName: true,
                    id: true,
                    role: true,
                    status: true,
                  },
                },
              },
            },
          },
        });

        if (
          token === null ||
          !hashesMatch(token.tokenHash, presentedToken.hash)
        ) {
          return { kind: 'invalid' };
        }

        const { session } = token;
        if (token.consumedAt !== null) {
          if (session.revokedAt === null) {
            await transaction.credentialSession.update({
              where: { id: session.id },
              data: { revokeReason: 'TOKEN_REUSE', revokedAt: now },
            });
            await transaction.auditLog.create({
              data: {
                action: 'AUTH_REFRESH_TOKEN_REUSED',
                actorId: session.userId,
                correlationId: correlationId ?? null,
                targetId: session.id,
                targetType: 'CREDENTIAL_SESSION',
              },
            });
          }
          return { kind: 'reused' };
        }

        let revokeReason: string | undefined;
        if (session.revokedAt !== null)
          revokeReason = session.revokeReason ?? 'REVOKED';
        else if (session.expiresAt <= now) revokeReason = 'ABSOLUTE_EXPIRED';
        else if (session.idleExpiresAt <= now) revokeReason = 'IDLE_EXPIRED';
        else if (
          session.user.credentialPasswordHash === null ||
          session.user.status !== UserStatus.ACTIVE ||
          !isCredentialRole(session.user.role)
        ) {
          revokeReason = 'ACCOUNT_UNAVAILABLE';
        }

        if (revokeReason !== undefined) {
          if (session.revokedAt === null) {
            await transaction.credentialSession.update({
              where: { id: session.id },
              data: { revokeReason, revokedAt: now },
            });
            await transaction.auditLog.create({
              data: {
                action: 'AUTH_CREDENTIAL_SESSION_REVOKED',
                actorId: session.userId,
                correlationId: correlationId ?? null,
                reason: revokeReason,
                targetId: session.id,
                targetType: 'CREDENTIAL_SESSION',
              },
            });
          }
          return { kind: 'invalid' };
        }

        const consumed = await transaction.credentialRefreshToken.updateMany({
          where: { consumedAt: null, id: token.id },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1) {
          await transaction.credentialSession.updateMany({
            where: { id: session.id, revokedAt: null },
            data: { revokeReason: 'TOKEN_REUSE', revokedAt: now },
          });
          await transaction.auditLog.create({
            data: {
              action: 'AUTH_REFRESH_TOKEN_REUSED',
              actorId: session.userId,
              correlationId: correlationId ?? null,
              targetId: session.id,
              targetType: 'CREDENTIAL_SESSION',
            },
          });
          return { kind: 'reused' };
        }

        const nextIdleExpiry = new Date(
          Math.min(
            session.expiresAt.getTime(),
            now.getTime() + REFRESH_SESSION_IDLE_TTL_MILLISECONDS,
          ),
        );
        await transaction.credentialSession.update({
          where: { id: session.id },
          data: { idleExpiresAt: nextIdleExpiry, lastUsedAt: now },
        });
        await transaction.credentialRefreshToken.create({
          data: {
            createdAt: now,
            id: replacementToken.id,
            sessionId: session.id,
            tokenHash: replacementToken.hash,
          },
        });

        return {
          kind: 'success',
          refreshExpiresAt: session.expiresAt,
          refreshToken: replacementToken.token,
          user: {
            displayName: session.user.displayName,
            id: session.user.id,
            role: session.user.role,
          },
        };
      },
    );

    if (result.kind !== 'success') throw genericLoginError();

    return {
      accessToken: await this.authService.issueAccessToken(result.user),
      expiresInSeconds: this.environment.accessTokenTtlSeconds,
      refreshExpiresAt: result.refreshExpiresAt,
      refreshToken: result.refreshToken,
      user: result.user,
    };
  }

  async revokeSession(
    input: RevokeCredentialSessionInput,
    correlationId?: string,
  ): Promise<boolean> {
    const presentedToken = parseRefreshToken(input.refreshToken);
    if (presentedToken === undefined) return true;

    const now = new Date();
    await this.database.$transaction(async (transaction) => {
      const token = await transaction.credentialRefreshToken.findUnique({
        where: { id: presentedToken.id },
        include: { session: { select: { id: true, userId: true } } },
      });
      if (
        token === null ||
        !hashesMatch(token.tokenHash, presentedToken.hash)
      ) {
        return;
      }

      const revoked = await transaction.credentialSession.updateMany({
        where: { id: token.session.id, revokedAt: null },
        data: { revokeReason: 'LOGOUT', revokedAt: now },
      });
      if (revoked.count === 1) {
        await transaction.auditLog.create({
          data: {
            action: 'AUTH_CREDENTIAL_SESSION_REVOKED',
            actorId: token.session.userId,
            correlationId: correlationId ?? null,
            reason: 'LOGOUT',
            targetId: token.session.id,
            targetType: 'CREDENTIAL_SESSION',
          },
        });
      }
    });

    return true;
  }

  private hashCode(challengeId: string, code: string): string {
    return this.hashValue(`otp:${challengeId}:${code}`);
  }

  private hashValue(value: string): string {
    return createHmac('sha256', this.environment.otpHashSecret)
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

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();

  if (
    email.length < 3 ||
    email.length > MAXIMUM_EMAIL_LENGTH ||
    !/^[^\s@]+@[^\s@]+$/.test(email)
  ) {
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

function parseChallengeId(value: string): string {
  const challengeId = value.trim().toLowerCase();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      challengeId,
    )
  ) {
    throw loginFieldError('code');
  }

  return challengeId;
}

function parseCode(value: string): string {
  const code = value.trim();

  if (!/^\d{6}$/.test(code)) {
    throw loginFieldError('code');
  }

  return code;
}

function isCredentialRole(role: UserRole): boolean {
  return CREDENTIAL_ROLES.has(role);
}

const CREDENTIAL_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.STUDENT,
  UserRole.TEACHER,
  UserRole.ADMIN,
]);

function generateSixDigitCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function createRefreshTokenMaterial(): RefreshTokenMaterial {
  const id = randomUUID();
  const secret = randomBytes(REFRESH_SECRET_BYTES).toString('base64url');
  return {
    hash: hashRefreshSecret(secret),
    id,
    token: `${id}.${secret}`,
  };
}

function parseRefreshToken(
  value: string,
): { readonly hash: string; readonly id: string } | undefined {
  const token = value.trim();
  const separator = token.indexOf('.');
  if (separator <= 0 || separator !== token.lastIndexOf('.')) return undefined;

  const id = token.slice(0, separator).toLowerCase();
  const secret = token.slice(separator + 1);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      id,
    ) ||
    !/^[A-Za-z0-9_-]{43}$/.test(secret)
  ) {
    return undefined;
  }

  return { hash: hashRefreshSecret(secret), id };
}

function hashRefreshSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function hashesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function maskEmail(email: string): string {
  const separator = email.lastIndexOf('@');
  const local = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  const visible = local.slice(0, Math.min(2, local.length));

  return `${visible}${'*'.repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

function genericLoginError(): ApplicationError {
  return new ApplicationError(
    ErrorCode.UNAUTHENTICATED,
    GENERIC_LOGIN_MESSAGE,
    401,
  );
}

function loginFieldError(
  field: 'code' | 'email' | 'firstName' | 'lastName' | 'name' | 'password',
): ApplicationError {
  const code = {
    code: ErrorCode.LOGIN_CODE_INVALID,
    email: ErrorCode.LOGIN_EMAIL_INVALID,
    firstName: ErrorCode.LOGIN_FIRST_NAME_INVALID,
    lastName: ErrorCode.LOGIN_LAST_NAME_INVALID,
    name: ErrorCode.LOGIN_NAME_INVALID,
    password: ErrorCode.LOGIN_PASSWORD_INVALID,
  }[field];
  return new ApplicationError(code, GENERIC_LOGIN_MESSAGE, 401);
}

function resendRateLimitError(): ApplicationError {
  return new ApplicationError(
    ErrorCode.RATE_LIMITED,
    'A new code can be requested after the cooldown',
    429,
  );
}

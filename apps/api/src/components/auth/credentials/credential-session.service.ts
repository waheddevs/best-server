import type { AuthEnvironment } from '@best/config';
import { UserRole, UserStatus } from '@best/database';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import type {
  RefreshCredentialSessionInput,
  RevokeCredentialSessionInput,
} from '../../../schemas/auth/credential-login.input';
import type { CredentialLoginSuccessPayloadObject } from '../../../schemas/auth/credential-login.object';
import { AUTH_ENVIRONMENT } from '../auth.constants';
import { AuthService } from '../tokens/auth.service';
import {
  createRefreshTokenMaterial,
  parseRefreshToken,
  hashesMatch,
} from '../tokens/credential-refresh-token';
import { genericLoginError, isCredentialRole } from './credential-policy';

const REFRESH_SESSION_ABSOLUTE_TTL_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_SESSION_IDLE_TTL_MILLISECONDS = 7 * 24 * 60 * 60 * 1000;

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
export class CredentialSessionService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authService: AuthService,
    @Inject(AUTH_ENVIRONMENT) private readonly environment: AuthEnvironment,
  ) {}
  async createSession(
    identity: {
      id: string;
      role: UserRole;
      credentialPasswordHash: string | null;
    },
    correlationId?: string,
  ): Promise<CredentialLoginSuccessPayloadObject> {
    if (identity.credentialPasswordHash === null) throw genericLoginError();
    const now = new Date();
    const refreshToken = createRefreshTokenMaterial();
    const refreshExpiresAt = new Date(
      now.getTime() + REFRESH_SESSION_ABSOLUTE_TTL_MILLISECONDS,
    );
    const idleExpiresAt = new Date(
      now.getTime() + REFRESH_SESSION_IDLE_TTL_MILLISECONDS,
    );
    const user = await this.database.$transaction(async (transaction) => {
      const activeUser = await transaction.user.findFirst({
        where: {
          credentialPasswordHash: identity.credentialPasswordHash,
          id: identity.id,
          role: identity.role,
          status: UserStatus.ACTIVE,
        },
        select: { displayName: true, id: true, role: true },
      });

      if (activeUser === null || !isCredentialRole(activeUser.role)) {
        throw genericLoginError();
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
          action: 'AUTH_CREDENTIAL_LOGIN_SUCCEEDED',
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
}

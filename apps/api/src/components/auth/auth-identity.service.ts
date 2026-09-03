import { UserRole, UserStatus } from '@best/database';
import { Injectable, UnauthorizedException } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import { ErrorCode } from '../../libs/enums/error-code.enum';
import { ApplicationError } from '../../libs/errors/application.error';
import type { AuthIdentityReader } from '../../libs/types/auth-identity-reader.type';
import type { AuthenticatedMember } from '../../libs/types/authenticated-member.type';
import type {
  AuthIdentityProvisioner,
  SocialIdentity,
} from './auth-identity.type';

@Injectable()
export class AuthIdentityService
  implements AuthIdentityReader, AuthIdentityProvisioner
{
  constructor(private readonly database: DatabaseService) {}

  async findActiveMember(
    userId: string,
  ): Promise<AuthenticatedMember | undefined> {
    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });

    return user?.status === UserStatus.ACTIVE
      ? { id: user.id, role: user.role }
      : undefined;
  }

  async resolveOrProvisionSocialIdentity(
    identity: SocialIdentity,
  ): Promise<AuthenticatedMember> {
    return this.database.$transaction(async (transaction) => {
      const existingAccount = await transaction.authAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: identity.provider,
            providerAccountId: identity.providerAccountId,
          },
        },
        select: {
          id: true,
          user: {
            select: { id: true, role: true, status: true },
          },
        },
      });

      if (existingAccount !== null) {
        if (existingAccount.user.status !== UserStatus.ACTIVE) {
          throw new UnauthorizedException('Authenticated user is unavailable');
        }

        await transaction.authAccount.update({
          where: { id: existingAccount.id },
          data: { lastAuthenticatedAt: new Date() },
        });

        return {
          id: existingAccount.user.id,
          role: existingAccount.user.role,
        };
      }

      const verifiedEmail = identity.emailVerified ? identity.email : undefined;

      if (verifiedEmail !== undefined) {
        const existingEmailOwner = await transaction.user.findUnique({
          where: { email: verifiedEmail },
          select: { id: true },
        });

        if (existingEmailOwner !== null) {
          throw new ApplicationError(
            ErrorCode.AUTH_ACCOUNT_LINK_REQUIRED,
            'Account linking is required',
            409,
          );
        }
      }

      const observedAt = new Date();
      const user = await transaction.user.create({
        data: {
          displayName: identity.displayName,
          ...(verifiedEmail === undefined
            ? {}
            : { email: verifiedEmail, emailVerifiedAt: observedAt }),
          role: UserRole.STUDENT,
          authAccounts: {
            create: {
              lastAuthenticatedAt: observedAt,
              provider: identity.provider,
              providerAccountId: identity.providerAccountId,
              ...(identity.email === undefined
                ? {}
                : { providerEmail: identity.email }),
              ...(identity.emailVerified && identity.email !== undefined
                ? { providerEmailVerifiedAt: observedAt }
                : {}),
            },
          },
        },
        select: { id: true, role: true },
      });

      await transaction.auditLog.create({
        data: {
          action: 'AUTH_USER_PROVISIONED',
          correlationId: identity.assertionId,
          newValues: {
            provider: identity.provider,
            role: user.role,
          },
          targetId: user.id,
          targetType: 'User',
        },
      });

      return user;
    });
  }
}

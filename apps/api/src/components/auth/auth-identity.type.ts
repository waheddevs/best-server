import type { AuthProvider } from '@best/database';

import type { AuthenticatedMember } from '../../libs/types/authenticated-member.type';

export interface SocialIdentity {
  readonly assertionId: string;
  readonly displayName: string;
  readonly email?: string;
  readonly emailVerified: boolean;
  readonly provider: AuthProvider;
  readonly providerAccountId: string;
}

export interface AuthIdentityProvisioner {
  resolveOrProvisionSocialIdentity(
    identity: SocialIdentity,
  ): Promise<AuthenticatedMember>;
}

export interface AuthExchangeResult {
  readonly accessToken: string;
  readonly expiresInSeconds: number;
}

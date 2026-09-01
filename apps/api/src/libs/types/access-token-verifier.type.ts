import type { AuthenticatedMember } from './authenticated-member.type';

export interface AccessTokenVerifier {
  verifyAccessToken(token: string): Promise<AuthenticatedMember>;
}

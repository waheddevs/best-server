import type { AuthenticatedMember } from './authenticated-member.type';

export interface AuthIdentityReader {
  findActiveMember(userId: string): Promise<AuthenticatedMember | undefined>;
}

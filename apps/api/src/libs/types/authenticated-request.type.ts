import type { AuthenticatedMember } from './authenticated-member.type';

export interface AuthenticatedRequest {
  authMember?: AuthenticatedMember;
  headers?: {
    authorization?: string | string[];
  };
  requestId?: string;
}

export interface ApiGraphqlContext {
  readonly req: AuthenticatedRequest;
}

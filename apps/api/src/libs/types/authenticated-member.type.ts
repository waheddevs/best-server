import type { UserRole } from '@best/database';

export interface AuthenticatedMember {
  readonly id: string;
  readonly role: UserRole;
}

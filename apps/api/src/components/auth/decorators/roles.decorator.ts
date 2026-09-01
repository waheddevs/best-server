import type { UserRole } from '@best/database';
import { SetMetadata } from '@nestjs/common';

export const AUTH_ROLES_METADATA = 'best.auth.roles';

export const Roles = (...roles: readonly UserRole[]) =>
  SetMetadata(AUTH_ROLES_METADATA, roles);

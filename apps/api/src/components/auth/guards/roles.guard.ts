import type { UserRole } from '@best/database';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { getAuthenticatedRequest } from '../auth-context';
import { AUTH_ROLES_METADATA } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<
      readonly UserRole[] | undefined
    >(AUTH_ROLES_METADATA, [context.getHandler(), context.getClass()]);

    if (requiredRoles === undefined || requiredRoles.length === 0) {
      return true;
    }

    const member = getAuthenticatedRequest(context).authMember;

    if (member === undefined) {
      throw new UnauthorizedException('Authentication is required');
    }

    if (!requiredRoles.includes(member.role)) {
      throw new ForbiddenException('The authenticated role is not allowed');
    }

    return true;
  }
}

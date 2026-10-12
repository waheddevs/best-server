import { UserRole } from '@best/database';
import { UseGuards } from '@nestjs/common';
import { Query, Resolver } from '@nestjs/graphql';

import { AdminOperationalOverviewObject } from '../../schemas/audit/admin-operations.object';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuditService } from './audit.service';

@Resolver()
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AuditResolver {
  constructor(private readonly service: AuditService) {}

  @Query(() => AdminOperationalOverviewObject, {
    name: 'adminOperationalOverview',
  })
  overview(@AuthMember('id') actor: string) {
    return this.service.overview(actor);
  }
}

import { UserRole, Language } from '@best/database';
import { UseGuards } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { AdminOverviewObject } from '../../schemas/audit/admin-overview.object';
import { AdminOverviewService } from './admin-overview.service';
@Resolver()
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminOverviewResolver {
  constructor(private readonly service: AdminOverviewService) {}
  @Query(() => AdminOverviewObject) adminOverview(
    @AuthMember('id') actor: string,
    @Args('language', { type: () => Language }) language: Language,
  ) {
    return this.service.overview(actor, language);
  }
}

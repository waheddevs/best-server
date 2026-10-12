import { UserRole } from '@best/database';
import { UseGuards } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { AdminDirectoryInput } from '../../schemas/groups/admin-directory.input';
import { AdminNoticeDirectoryObject } from '../../schemas/notifications/admin-notice.object';
import { AdminNoticesService } from './admin-notices.service';
@Resolver()
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminNoticesResolver {
  constructor(private readonly service: AdminNoticesService) {}
  @Query(() => AdminNoticeDirectoryObject) adminNoticeDirectory(
    @AuthMember('id') actor: string,
    @Args('input') input: AdminDirectoryInput,
  ) {
    return this.service.directory(actor, input);
  }
}

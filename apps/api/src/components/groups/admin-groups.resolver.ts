import { UserRole } from '@best/database';
import { UseGuards } from '@nestjs/common';
import { Args, Context, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { ApiGraphqlContext } from '../../libs/types/authenticated-request.type';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminDirectoryInput } from '../../schemas/groups/admin-directory.input';

import {
  AdminGroupDirectory,
  AdminDirectoryOptions,
} from '../../schemas/groups/admin-group.object';
import { AdminSaveGroupInput } from '../../schemas/groups/admin-group.input';
import { GroupObject } from '../../schemas/groups/group.object';
import { AdminGroupsService } from './admin-groups.service';
@Resolver()
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminGroupsResolver {
  constructor(private readonly service: AdminGroupsService) {}
  @Query(() => AdminGroupDirectory) adminGroupDirectory(
    @Args('input') input: AdminDirectoryInput,
  ) {
    return this.service.directory(input);
  }
  @Query(() => AdminDirectoryOptions) adminDirectoryOptions() {
    return this.service.options();
  }
  @Mutation(() => GroupObject) adminSaveGroup(
    @AuthMember('id') id: string,
    @Args('input') input: AdminSaveGroupInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return this.service.save(id, input, ctx.req.requestId);
  }
  @Mutation(() => GroupObject) adminSetGroupStatus(
    @AuthMember('id') actor: string,
    @Args('groupId', { type: () => ID }) id: string,
    @Args('status') status: string,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return this.service.setStatus(actor, id, status, ctx.req.requestId);
  }
}

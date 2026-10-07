import { UserRole, UserStatus } from '@best/database';
import { UseGuards } from '@nestjs/common';
import {
  Args,
  Context,
  ID,
  Int,
  Mutation,
  Query,
  Resolver,
} from '@nestjs/graphql';

import type { ApiGraphqlContext } from '../../libs/types/authenticated-request.type';
import {
  AdminProvisionUserInput,
  AdminSetUserRoleInput,
  AdminSetUserStatusInput,
} from '../../schemas/users/admin-user.input';
import { AdminUserObject } from '../../schemas/users/admin-user.object';
import { AdminUserConnectionObject } from '../../schemas/users/user-connection.object';
import {
  AdminUserMutationPayloadObject,
  ChangeMyPasswordPayloadObject,
  DeleteMyAccountPayloadObject,
  UpdateMyProfilePayloadObject,
} from '../../schemas/users/user-mutation-payload.object';
import {
  ChangeMyPasswordInput,
  UpdateMyProfileInput,
} from '../../schemas/users/user-profile.input';
import { UserProfileObject } from '../../schemas/users/user-profile.object';
import { ViewerObject } from '../../schemas/users/viewer.object';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

import { UsersService } from './users.service';

@Resolver()
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @Mutation(() => AdminUserMutationPayloadObject, {
    name: 'adminProvisionUser',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async provisionUser(
    @AuthMember('id') adminId: string,
    @Args('input') input: AdminProvisionUserInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<AdminUserMutationPayloadObject> {
    return {
      user: await this.usersService.provisionUser(
        adminId,
        input,
        context.req.requestId,
      ),
    };
  }

  @Query(() => ViewerObject, { name: 'viewer' })
  @UseGuards(AuthGuard)
  getViewer(@AuthMember('id') userId: string): Promise<ViewerObject> {
    return this.usersService.getViewer(userId);
  }

  @Query(() => UserProfileObject, { name: 'myProfile' })
  @UseGuards(AuthGuard)
  getMyProfile(@AuthMember('id') userId: string): Promise<UserProfileObject> {
    return this.usersService.getMyProfile(userId);
  }

  @Mutation(() => UpdateMyProfilePayloadObject, { name: 'updateMyProfile' })
  @UseGuards(AuthGuard)
  async updateMyProfile(
    @AuthMember('id') userId: string,
    @Args('input') input: UpdateMyProfileInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<UpdateMyProfilePayloadObject> {
    return {
      profile: await this.usersService.updateMyProfile(
        userId,
        input,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => ChangeMyPasswordPayloadObject, { name: 'changeMyPassword' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER, UserRole.STUDENT)
  async changeMyPassword(
    @AuthMember('id') userId: string,
    @Args('input') input: ChangeMyPasswordInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<ChangeMyPasswordPayloadObject> {
    await this.usersService.changeMyPassword(
      userId,
      input,
      context.req.requestId,
    );
    return { changed: true };
  }

  @Mutation(() => DeleteMyAccountPayloadObject, { name: 'deleteMyAccount' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async deleteMyAccount(
    @AuthMember('id') userId: string,
    @Context() context: ApiGraphqlContext,
  ): Promise<DeleteMyAccountPayloadObject> {
    await this.usersService.deleteMyTeacherAccount(
      userId,
      context.req.requestId,
    );
    return { deleted: true };
  }

  @Query(() => AdminUserConnectionObject, { name: 'adminUsers' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getAdminUsers(
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true, type: () => String }) after?: string,
    @Args('role', { nullable: true, type: () => UserRole }) role?: UserRole,
    @Args('status', { nullable: true, type: () => UserStatus })
    status?: UserStatus,
    @Args('search', { nullable: true, type: () => String }) search?: string,
  ): Promise<AdminUserConnectionObject> {
    return this.usersService.getAdminUsers(first, after, role, status, search);
  }

  @Query(() => AdminUserObject, { name: 'adminUser' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getAdminUser(
    @Args('userId', { type: () => ID }) userId: string,
  ): Promise<AdminUserObject> {
    return this.usersService.getAdminUser(userId);
  }

  @Mutation(() => AdminUserMutationPayloadObject, {
    name: 'adminSetUserStatus',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async setAdminUserStatus(
    @AuthMember('id') adminId: string,
    @Args('input') input: AdminSetUserStatusInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<AdminUserMutationPayloadObject> {
    return {
      user: await this.usersService.setAdminUserStatus(
        adminId,
        input.userId,
        input.status,
        input.reason,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => AdminUserMutationPayloadObject, {
    name: 'adminSetUserRole',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async setAdminUserRole(
    @AuthMember('id') adminId: string,
    @Args('input') input: AdminSetUserRoleInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<AdminUserMutationPayloadObject> {
    return {
      user: await this.usersService.setAdminUserRole(
        adminId,
        input,
        context.req.requestId,
      ),
    };
  }
}

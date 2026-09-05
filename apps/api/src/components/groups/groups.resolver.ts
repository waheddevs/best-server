import { ContentStatus, UserRole } from '@best/database';
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
import { GroupConnectionObject } from '../../schemas/groups/group-connection.object';
import {
  CreateTeacherGroupInput,
  SetTeacherGroupArchivedInput,
  UpdateTeacherGroupInput,
} from '../../schemas/groups/group.input';
import { GroupMutationPayloadObject } from '../../schemas/groups/group-mutation-payload.object';
import {
  GroupObject,
  StudentCurrentGroupObject,
} from '../../schemas/groups/group.object';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

import { GroupsService } from './groups.service';

@Resolver()
export class GroupsResolver {
  constructor(private readonly groupsService: GroupsService) {}

  @Query(() => GroupConnectionObject, { name: 'teacherGroups' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  getTeacherGroups(
    @AuthMember('id') teacherId: string,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true }) after?: string,
    @Args('status', { nullable: true, type: () => ContentStatus })
    status?: ContentStatus,
    @Args('search', { nullable: true }) search?: string,
  ): Promise<GroupConnectionObject> {
    return this.groupsService.getTeacherGroups(
      teacherId,
      first,
      after,
      status,
      search,
    );
  }

  @Query(() => GroupObject, { name: 'teacherGroup' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  getTeacherGroup(
    @AuthMember('id') teacherId: string,
    @Args('groupId', { type: () => ID }) groupId: string,
  ): Promise<GroupObject> {
    return this.groupsService.getTeacherGroup(teacherId, groupId);
  }

  @Query(() => StudentCurrentGroupObject, {
    name: 'studentCurrentGroup',
    nullable: true,
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  getStudentCurrentGroup(
    @AuthMember('id') studentId: string,
  ): Promise<StudentCurrentGroupObject | null> {
    return this.groupsService.getStudentCurrentGroup(studentId);
  }

  @Query(() => GroupConnectionObject, { name: 'adminGroups' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getAdminGroups(
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true }) after?: string,
    @Args('status', { nullable: true, type: () => ContentStatus })
    status?: ContentStatus,
    @Args('teacherId', { nullable: true, type: () => ID }) teacherId?: string,
    @Args('search', { nullable: true }) search?: string,
  ): Promise<GroupConnectionObject> {
    return this.groupsService.getAdminGroups(
      first,
      after,
      status,
      teacherId,
      search,
    );
  }

  @Query(() => GroupObject, { name: 'adminGroup' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getAdminGroup(
    @Args('groupId', { type: () => ID }) groupId: string,
  ): Promise<GroupObject> {
    return this.groupsService.getAdminGroup(groupId);
  }

  @Mutation(() => GroupMutationPayloadObject, { name: 'createTeacherGroup' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async createTeacherGroup(
    @AuthMember('id') teacherId: string,
    @Args('input') input: CreateTeacherGroupInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<GroupMutationPayloadObject> {
    return {
      group: await this.groupsService.createTeacherGroup(
        teacherId,
        input,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => GroupMutationPayloadObject, { name: 'updateTeacherGroup' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async updateTeacherGroup(
    @AuthMember('id') teacherId: string,
    @Args('input') input: UpdateTeacherGroupInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<GroupMutationPayloadObject> {
    return {
      group: await this.groupsService.updateTeacherGroup(
        teacherId,
        input,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => GroupMutationPayloadObject, {
    name: 'setTeacherGroupArchived',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async setTeacherGroupArchived(
    @AuthMember('id') teacherId: string,
    @Args('input') input: SetTeacherGroupArchivedInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<GroupMutationPayloadObject> {
    return {
      group: await this.groupsService.setTeacherGroupArchived(
        teacherId,
        input.groupId,
        input.archived,
        input.reason,
        context.req.requestId,
      ),
    };
  }
}

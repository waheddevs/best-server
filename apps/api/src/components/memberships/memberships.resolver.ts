import { UserRole } from '@best/database';
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
import { GroupRosterConnectionObject } from '../../schemas/groups/group-connection.object';
import { MembershipMutationPayloadObject } from '../../schemas/groups/group-mutation-payload.object';
import {
  AddStudentToGroupInput,
  EndGroupMembershipInput,
  SetGroupMembershipParticipationStatusInput,
  TeacherCreateStudentInGroupInput,
  TeacherDeleteStudentInput,
} from '../../schemas/groups/membership.input';
import { TeacherGroupRosterSummaryObject } from '../../schemas/groups/group.object';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

import { MembershipsService } from './memberships.service';

@Resolver()
export class MembershipsResolver {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Query(() => GroupRosterConnectionObject, { name: 'teacherGroupRoster' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  getTeacherGroupRoster(
    @AuthMember('id') teacherId: string,
    @Args('groupId', { type: () => ID }) groupId: string,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true }) after?: string,
    @Args('includeEnded', { defaultValue: false, nullable: true })
    includeEnded?: boolean,
    @Args('search', { nullable: true }) search?: string,
  ): Promise<GroupRosterConnectionObject> {
    return this.membershipsService.getTeacherRoster(
      teacherId,
      groupId,
      first,
      after,
      includeEnded,
      search,
    );
  }

  @Query(() => TeacherGroupRosterSummaryObject, {
    name: 'teacherGroupRosterSummary',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  getTeacherGroupRosterSummary(
    @AuthMember('id') teacherId: string,
    @Args('groupId', { type: () => ID }) groupId: string,
  ): Promise<TeacherGroupRosterSummaryObject> {
    return this.membershipsService.getTeacherRosterSummary(teacherId, groupId);
  }

  @Mutation(() => MembershipMutationPayloadObject, {
    name: 'addStudentToGroup',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async addStudentToGroup(
    @AuthMember('id') teacherId: string,
    @Args('input') input: AddStudentToGroupInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<MembershipMutationPayloadObject> {
    return {
      membership: await this.membershipsService.addStudentToGroup(
        teacherId,
        input.groupId,
        input.studentId,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => MembershipMutationPayloadObject, {
    name: 'teacherCreateStudentInGroup',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async teacherCreateStudentInGroup(
    @AuthMember('id') teacherId: string,
    @Args('input') input: TeacherCreateStudentInGroupInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<MembershipMutationPayloadObject> {
    return {
      membership: await this.membershipsService.createStudentInGroup(
        teacherId,
        input,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => MembershipMutationPayloadObject, {
    name: 'teacherDeleteStudent',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async teacherDeleteStudent(
    @AuthMember('id') teacherId: string,
    @Args('input') input: TeacherDeleteStudentInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<MembershipMutationPayloadObject> {
    return {
      membership: await this.membershipsService.deleteTeacherStudent(
        teacherId,
        input.membershipId,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => MembershipMutationPayloadObject, {
    name: 'endGroupMembership',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async endGroupMembership(
    @AuthMember('id') teacherId: string,
    @Args('input') input: EndGroupMembershipInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<MembershipMutationPayloadObject> {
    return {
      membership: await this.membershipsService.endGroupMembership(
        teacherId,
        input.membershipId,
        input.reason,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => MembershipMutationPayloadObject, {
    name: 'setGroupMembershipParticipationStatus',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async setGroupMembershipParticipationStatus(
    @AuthMember('id') teacherId: string,
    @Args('input') input: SetGroupMembershipParticipationStatusInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<MembershipMutationPayloadObject> {
    return {
      membership:
        await this.membershipsService.setGroupMembershipParticipationStatus(
          teacherId,
          input.membershipId,
          input.status,
          input.reason,
          context.req.requestId,
        ),
    };
  }
}

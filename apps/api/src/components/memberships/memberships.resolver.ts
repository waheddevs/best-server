import { TransferRequestStatus, UserRole } from '@best/database';
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
import { GroupTransferRequestConnectionObject } from '../../schemas/groups/group-transfer.object';
import {
  MembershipMutationPayloadObject,
  TransferRequestMutationPayloadObject,
} from '../../schemas/groups/group-mutation-payload.object';
import {
  AddStudentToGroupInput,
  EndGroupMembershipInput,
  RequestStudentTransferInput,
  ReviewStudentTransferInput,
} from '../../schemas/groups/membership.input';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

import { MembershipsService } from './memberships.service';

@Resolver()
export class MembershipsResolver {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Query(() => GroupTransferRequestConnectionObject, {
    name: 'adminTransferRequests',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getAdminTransferRequests(
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true }) after?: string,
    @Args('status', { nullable: true, type: () => TransferRequestStatus })
    status?: TransferRequestStatus,
  ): Promise<GroupTransferRequestConnectionObject> {
    return this.membershipsService.getAdminTransferRequests(
      first,
      after,
      status,
    );
  }

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

  @Query(() => GroupTransferRequestConnectionObject, {
    name: 'teacherTransferRequests',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  getTeacherTransferRequests(
    @AuthMember('id') teacherId: string,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true }) after?: string,
    @Args('status', { nullable: true, type: () => TransferRequestStatus })
    status?: TransferRequestStatus,
  ): Promise<GroupTransferRequestConnectionObject> {
    return this.membershipsService.getTeacherTransferRequests(
      teacherId,
      first,
      after,
      status,
    );
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

  @Mutation(() => TransferRequestMutationPayloadObject, {
    name: 'requestStudentTransfer',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async requestStudentTransfer(
    @AuthMember('id') teacherId: string,
    @Args('input') input: RequestStudentTransferInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<TransferRequestMutationPayloadObject> {
    return {
      transferRequest: await this.membershipsService.requestStudentTransfer(
        teacherId,
        input,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => TransferRequestMutationPayloadObject, {
    name: 'reviewStudentTransfer',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async reviewStudentTransfer(
    @AuthMember('id') adminId: string,
    @Args('input') input: ReviewStudentTransferInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<TransferRequestMutationPayloadObject> {
    return {
      transferRequest: await this.membershipsService.reviewStudentTransfer(
        adminId,
        input,
        context.req.requestId,
      ),
    };
  }
}

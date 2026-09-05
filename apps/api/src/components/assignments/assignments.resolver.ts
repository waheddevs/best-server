import { AssignmentStatus, SubmissionStatus, UserRole } from '@best/database';
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
  AssignmentIdInput,
  CreateAssignmentInput,
  ReviewAssignmentSubmissionInput,
  SubmitAssignmentInput,
  UpdateAssignmentInput,
} from '../../schemas/assignments/assignment.input';
import {
  AssignmentConnectionObject,
  AssignmentObject,
  AssignmentPayloadObject,
  AssignmentSubmissionConnectionObject,
  AssignmentSubmissionPayloadObject,
} from '../../schemas/assignments/assignment.object';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AssignmentsService } from './assignments.service';
@Resolver()
export class AssignmentsResolver {
  constructor(private readonly service: AssignmentsService) {}
  @Query(() => AssignmentConnectionObject, { name: 'teacherGroupAssignments' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  teacherList(
    @AuthMember('id') id: string,
    @Args('groupId', { type: () => ID }) groupId: string,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true }) after?: string,
    @Args('status', { nullable: true, type: () => AssignmentStatus })
    status?: AssignmentStatus,
  ) {
    return this.service.teacherList(id, groupId, first, after, status);
  }
  @Query(() => AssignmentObject, { name: 'teacherAssignment' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  teacherOne(
    @AuthMember('id') id: string,
    @Args('assignmentId', { type: () => ID }) assignmentId: string,
  ) {
    return this.service.teacherOne(id, assignmentId);
  }
  @Query(() => AssignmentSubmissionConnectionObject, {
    name: 'teacherAssignmentSubmissions',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  submissions(
    @AuthMember('id') id: string,
    @Args('assignmentId', { type: () => ID }) assignmentId: string,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true }) after?: string,
    @Args('status', { nullable: true, type: () => SubmissionStatus })
    status?: SubmissionStatus,
  ) {
    return this.service.submissions(id, assignmentId, first, after, status);
  }
  @Query(() => AssignmentConnectionObject, { name: 'studentAssignments' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  studentList(
    @AuthMember('id') id: string,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true }) after?: string,
    @Args('status', { nullable: true, type: () => AssignmentStatus })
    status?: AssignmentStatus,
  ) {
    return this.service.studentList(id, first, after, status);
  }
  @Query(() => AssignmentObject, { name: 'studentAssignment' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  studentOne(
    @AuthMember('id') id: string,
    @Args('assignmentId', { type: () => ID }) assignmentId: string,
  ) {
    return this.service.studentOne(id, assignmentId);
  }
  @Mutation(() => AssignmentPayloadObject, { name: 'createAssignment' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async create(
    @AuthMember('id') id: string,
    @Args('input') input: CreateAssignmentInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return {
      assignment: await this.service.create(id, input, ctx.req.requestId),
    };
  }
  @Mutation(() => AssignmentPayloadObject, { name: 'updateAssignment' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async update(
    @AuthMember('id') id: string,
    @Args('input') input: UpdateAssignmentInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return {
      assignment: await this.service.update(
        id,
        input.assignmentId,
        input,
        ctx.req.requestId,
      ),
    };
  }
  @Mutation(() => AssignmentPayloadObject, { name: 'publishAssignment' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async publish(
    @AuthMember('id') id: string,
    @Args('input') input: AssignmentIdInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return {
      assignment: await this.service.publish(
        id,
        input.assignmentId,
        ctx.req.requestId,
      ),
    };
  }
  @Mutation(() => AssignmentPayloadObject, { name: 'closeAssignment' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async close(
    @AuthMember('id') id: string,
    @Args('input') input: AssignmentIdInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return {
      assignment: await this.service.close(
        id,
        input.assignmentId,
        ctx.req.requestId,
      ),
    };
  }
  @Mutation(() => AssignmentSubmissionPayloadObject, {
    name: 'submitAssignment',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  async submit(
    @AuthMember('id') id: string,
    @Args('input') input: SubmitAssignmentInput,
  ) {
    return { submission: await this.service.submit(id, input) };
  }
  @Mutation(() => AssignmentSubmissionPayloadObject, {
    name: 'reviewAssignmentSubmission',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async review(
    @AuthMember('id') id: string,
    @Args('input') input: ReviewAssignmentSubmissionInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return {
      submission: await this.service.review(id, input, ctx.req.requestId),
    };
  }
}

import { LessonStatus, UserRole } from '@best/database';
import { UseGuards } from '@nestjs/common';
import {
  Args,
  Context,
  GraphQLISODateTime,
  ID,
  Int,
  Mutation,
  Query,
  Resolver,
} from '@nestjs/graphql';
import type { ApiGraphqlContext } from '../../libs/types/authenticated-request.type';
import { AdminLocationSummaryObject } from '../../schemas/lessons/admin-location-summary.object';
import { LessonConnectionObject } from '../../schemas/lessons/lesson-connection.object';
import {
  CreateLessonInput,
  RecordLessonAttendanceInput,
  SetLessonArchivedInput,
  SetLessonStatusInput,
  UpdateLessonInput,
} from '../../schemas/lessons/lesson.input';
import {
  LessonAttendanceObject,
  LessonAttendancePayloadObject,
  LessonObject,
  LessonPayloadObject,
} from '../../schemas/lessons/lesson.object';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { LessonsService } from './lessons.service';

@Resolver()
export class LessonsResolver {
  constructor(private readonly service: LessonsService) {}
  @Query(() => [LessonObject], { name: 'adminSchedule' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  adminSchedule(
    @Args('from', { type: () => GraphQLISODateTime }) from: Date,
    @Args('to', { type: () => GraphQLISODateTime }) to: Date,
  ) {
    return this.service.getAdminSchedule(from, to);
  }
  @Query(() => [LessonAttendanceObject], { name: 'adminAttendance' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  adminAttendance(@Args('lessonId', { type: () => ID }) lessonId: string) {
    return this.service.getAdminAttendance(lessonId);
  }
  @Query(() => [AdminLocationSummaryObject], { name: 'adminLocations' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  adminLocations() {
    return this.service.getAdminLocations();
  }
  @Query(() => [LessonObject], { name: 'teacherSchedule' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  teacherSchedule(
    @AuthMember('id') id: string,
    @Args('from', { type: () => GraphQLISODateTime }) from: Date,
    @Args('to', { type: () => GraphQLISODateTime }) to: Date,
  ) {
    return this.service.getTeacherSchedule(id, from, to);
  }
  @Query(() => LessonConnectionObject, { name: 'teacherGroupLessons' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  teacherGroupLessons(
    @AuthMember('id') id: string,
    @Args('groupId', { type: () => ID }) groupId: string,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true }) after?: string,
    @Args('status', { nullable: true, type: () => LessonStatus })
    status?: LessonStatus,
  ) {
    return this.service.getTeacherLessons(id, groupId, first, after, status);
  }
  @Query(() => LessonObject, { name: 'teacherLesson' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  teacherLesson(
    @AuthMember('id') id: string,
    @Args('lessonId', { type: () => ID }) lessonId: string,
  ) {
    return this.service.getTeacherLesson(id, lessonId);
  }
  @Query(() => [LessonObject], { name: 'studentSchedule' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  studentSchedule(
    @AuthMember('id') id: string,
    @Args('from', { type: () => GraphQLISODateTime }) from: Date,
    @Args('to', { type: () => GraphQLISODateTime }) to: Date,
  ) {
    return this.service.getStudentSchedule(id, from, to);
  }
  @Query(() => LessonObject, { name: 'studentLesson' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  studentLesson(
    @AuthMember('id') id: string,
    @Args('lessonId', { type: () => ID }) lessonId: string,
  ) {
    return this.service.getStudentLesson(id, lessonId);
  }
  @Query(() => [LessonAttendanceObject], { name: 'teacherAttendance' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  attendance(
    @AuthMember('id') id: string,
    @Args('lessonId', { type: () => ID }) lessonId: string,
  ) {
    return this.service.getAttendance(id, lessonId);
  }
  @Mutation(() => LessonPayloadObject, { name: 'createLesson' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async create(
    @AuthMember('id') id: string,
    @Args('input') input: CreateLessonInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return { lesson: await this.service.create(id, input, ctx.req.requestId) };
  }
  @Mutation(() => LessonPayloadObject, { name: 'updateLesson' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async update(
    @AuthMember('id') id: string,
    @Args('input') input: UpdateLessonInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return { lesson: await this.service.update(id, input, ctx.req.requestId) };
  }
  @Mutation(() => LessonPayloadObject, { name: 'setLessonStatus' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async status(
    @AuthMember('id') id: string,
    @Args('input') input: SetLessonStatusInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return {
      lesson: await this.service.setStatus(
        id,
        input.lessonId,
        input.status,
        input.reason,
        ctx.req.requestId,
      ),
    };
  }

  @Mutation(() => LessonPayloadObject, { name: 'setLessonArchived' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async archived(
    @AuthMember('id') id: string,
    @Args('input') input: SetLessonArchivedInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return {
      lesson: await this.service.setArchived(
        id,
        input.lessonId,
        input.archived,
        ctx.req.requestId,
      ),
    };
  }
  @Mutation(() => LessonAttendancePayloadObject, {
    name: 'recordLessonAttendance',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async record(
    @AuthMember('id') id: string,
    @Args('input') input: RecordLessonAttendanceInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return {
      attendances: await this.service.recordAttendance(
        id,
        input.lessonId,
        input.entries,
        input.correctionReason,
        ctx.req.requestId,
      ),
    };
  }
}

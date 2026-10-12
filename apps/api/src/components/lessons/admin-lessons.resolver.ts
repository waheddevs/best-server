import { UserRole } from '@best/database';
import { UseGuards } from '@nestjs/common';
import { Args, Context, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { ApiGraphqlContext } from '../../libs/types/authenticated-request.type';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminDirectoryInput } from '../../schemas/groups/admin-directory.input';

import { AdminLessonDirectory } from '../../schemas/lessons/admin-lesson.object';
import { AdminSaveLessonInput } from '../../schemas/lessons/admin-lesson.input';
import { LessonObject } from '../../schemas/lessons/lesson.object';
import { AdminLessonsService } from './admin-lessons.service';
@Resolver()
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminLessonsResolver {
  constructor(private readonly service: AdminLessonsService) {}
  @Query(() => AdminLessonDirectory) adminLessonDirectory(
    @Args('input') input: AdminDirectoryInput,
  ) {
    return this.service.directory(input);
  }
  @Mutation(() => LessonObject) adminSaveLesson(
    @AuthMember('id') id: string,
    @Args('input') input: AdminSaveLessonInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return this.service.save(id, input, ctx.req.requestId);
  }
  @Mutation(() => LessonObject) adminSetLessonStatus(
    @AuthMember('id') actor: string,
    @Args('lessonId', { type: () => ID }) id: string,
    @Args('status') status: string,
    @Args('reason') reason: string,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return this.service.status(actor, id, status, reason, ctx.req.requestId);
  }
}

import { Language, UserRole } from '@best/database';
import { UseGuards } from '@nestjs/common';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { ApiGraphqlContext } from '../../libs/types/authenticated-request.type';
import {
  RegisterForCourseInput,
  SetPublicCourseStatusInput,
  UpdateCourseInput,
  UpsertCourseInput,
} from '../../schemas/courses/course.input';
import {
  PublicCourseConnectionObject,
  PublicCourseObject,
  PublicCoursePayloadObject,
} from '../../schemas/courses/course.object';
import { PublicSubmissionReceiptObject } from '../../schemas/events/event.object';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CoursesService } from './courses.service';
@Resolver()
export class CoursesResolver {
  constructor(private readonly service: CoursesService) {}

  @Query(() => PublicCourseConnectionObject, { name: 'publicCourses' }) list(
    @Args('language', { type: () => Language }) language: Language,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true }) after?: string,
  ) {
    return this.service.list(language, first, after);
  }

  @Query(() => PublicCourseObject, { name: 'publicCourse' }) one(
    @Args('slug') slug: string,
    @Args('language', { type: () => Language }) language: Language,
  ) {
    return this.service.one(slug, language);
  }

  @Query(() => PublicCourseConnectionObject, { name: 'adminCourses' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  adminList(
    @Args('language', { type: () => Language }) language: Language,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true }) after?: string,
  ) {
    return this.service.list(language, first, after, true);
  }

  @Query(() => PublicCourseObject, { name: 'adminCourse' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  adminOne(
    @Args('slug') slug: string,
    @Args('language', { type: () => Language }) language: Language,
  ) {
    return this.service.one(slug, language, true);
  }

  @Mutation(() => PublicCoursePayloadObject, { name: 'createCourseDraft' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async create(
    @AuthMember('id') id: string,
    @Args('input') input: UpsertCourseInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return { course: await this.service.create(id, input, ctx.req.requestId) };
  }

  @Mutation(() => PublicCoursePayloadObject, { name: 'updateCourseDraft' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async update(
    @AuthMember('id') id: string,
    @Args('input') input: UpdateCourseInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return {
      course: await this.service.update(
        id,
        input.courseId,
        input,
        ctx.req.requestId,
      ),
    };
  }

  @Mutation(() => PublicCoursePayloadObject, { name: 'setCourseStatus' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async status(
    @AuthMember('id') id: string,
    @Args('input') input: SetPublicCourseStatusInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return {
      course: await this.service.setStatus(
        id,
        input.courseId,
        input.status,
        input.reason,
        ctx.req.requestId,
      ),
    };
  }

  @Mutation(() => PublicSubmissionReceiptObject, {
    name: 'registerForCourse',
  })
  register(@Args('input') input: RegisterForCourseInput) {
    return this.service.register(input);
  }
}

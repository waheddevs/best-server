import { UserRole } from '@best/database';
import { UseGuards } from '@nestjs/common';
import { Args, Query, Mutation, Resolver, ID } from '@nestjs/graphql';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { AdminDirectoryInput } from '../../schemas/groups/admin-directory.input';
import {
  AdminRemoveCourseInput,
  AdminSaveCourseContentInput,
} from '../../schemas/courses/admin-content.input';
import { AdminCourseCatalogObject } from '../../schemas/courses/admin-course-catalog.object';
import { AdminCourseContentService } from './admin-course-content.service';
@Resolver()
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminCourseContentResolver {
  constructor(private readonly service: AdminCourseContentService) {}
  @Query(() => AdminCourseCatalogObject) adminCourseCatalog(
    @Args('input') input: AdminDirectoryInput,
  ) {
    return this.service.catalog(input);
  }
  @Mutation(() => ID) adminSaveCourseContent(
    @AuthMember('id') actor: string,
    @Args('input') input: AdminSaveCourseContentInput,
  ) {
    return this.service.save(actor, input);
  }
}

import { Language, UserRole } from '@best/database';
import { UseGuards } from '@nestjs/common';
import { Args, ID, Int, Query, Resolver } from '@nestjs/graphql';

import { StudentTestConnectionObject } from '../../schemas/tests/student-test-connection.object';
import { StudentTestObject } from '../../schemas/tests/student-test.object';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

import { TestsService } from './tests.service';

@Resolver()
export class TestsResolver {
  constructor(private readonly testsService: TestsService) {}

  @Query(() => StudentTestConnectionObject, {
    name: 'studentAvailableTests',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  getAvailableTests(
    @AuthMember('id') studentId: string,
    @Args('language', { type: () => Language }) language: Language,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true, type: () => String }) after?: string,
  ): Promise<StudentTestConnectionObject> {
    return this.testsService.getAvailableTests(
      studentId,
      language,
      first,
      after,
    );
  }

  @Query(() => StudentTestObject, { name: 'studentTest' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  getStudentTest(
    @AuthMember('id') studentId: string,
    @Args('testId', { type: () => ID }) testId: string,
    @Args('language', { type: () => Language }) language: Language,
  ): Promise<StudentTestObject> {
    return this.testsService.getStudentTest(studentId, testId, language);
  }
}

import { Language, UserRole } from '@best/database';
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
import { CreateTeacherPracticeTestInput } from '../../schemas/tests/create-teacher-practice-test.input';
import { StudentTestConnectionObject } from '../../schemas/tests/student-test-connection.object';
import { StudentTestObject } from '../../schemas/tests/student-test.object';
import { StudentTestPaperConnectionObject } from '../../schemas/tests/student-test-paper-connection.object';
import { StudentTestPaperObject } from '../../schemas/tests/student-test-paper.object';
import { TeacherTestPaperPageObject } from '../../schemas/tests/teacher-test-paper-page.object';
import { TeacherTestPaperDeletionPayloadObject } from '../../schemas/tests/teacher-test-paper-deletion-payload.object';
import { TeacherTestPaperPayloadObject } from '../../schemas/tests/teacher-test-paper-payload.object';
import { TeacherTestPaperObject } from '../../schemas/tests/teacher-test-paper.object';
import { PracticeBookmarkPayloadObject } from '../../schemas/tests/practice-bookmark-payload.object';
import { SetPracticeBookmarkInput } from '../../schemas/tests/set-practice-bookmark.input';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

import { TestsService } from './tests.service';

@Resolver()
export class TestsResolver {
  constructor(private readonly testsService: TestsService) {}

  @Mutation(() => TeacherTestPaperPayloadObject, {
    name: 'createTeacherPracticeTest',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async createTeacherPracticeTest(
    @AuthMember('id') teacherId: string,
    @Args('input') input: CreateTeacherPracticeTestInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<TeacherTestPaperPayloadObject> {
    return {
      testPaper: await this.testsService.createTeacherPracticeTest(
        teacherId,
        input.groupId,
        context.req.requestId,
      ),
    };
  }

  @Mutation(() => TeacherTestPaperDeletionPayloadObject, {
    name: 'deleteTeacherPracticeTest',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  deleteTeacherPracticeTest(
    @AuthMember('id') teacherId: string,
    @Args('testPaperId', { type: () => ID }) testPaperId: string,
    @Context() context: ApiGraphqlContext,
  ): Promise<TeacherTestPaperDeletionPayloadObject> {
    return this.testsService.deleteTeacherPracticeTest(
      teacherId,
      testPaperId,
      context.req.requestId,
    );
  }

  @Mutation(() => PracticeBookmarkPayloadObject, {
    name: 'setPracticeBookmark',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER, UserRole.STUDENT)
  setPracticeBookmark(
    @AuthMember('id') userId: string,
    @AuthMember('role') role: UserRole,
    @Args('input') input: SetPracticeBookmarkInput,
  ): Promise<PracticeBookmarkPayloadObject> {
    return this.testsService.setPracticeBookmark(userId, role, input);
  }

  @Query(() => TeacherTestPaperPageObject, { name: 'teacherTestPapers' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  getTeacherTestPapers(
    @AuthMember('id') teacherId: string,
    @Args('groupId', { type: () => ID }) groupId: string,
    @Args('page', { defaultValue: 1, type: () => Int }) page: number,
  ): Promise<TeacherTestPaperPageObject> {
    return this.testsService.getTeacherTestPapers(teacherId, groupId, page);
  }

  @Query(() => TeacherTestPaperObject, { name: 'teacherTestPaper' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  getTeacherTestPaper(
    @AuthMember('id') teacherId: string,
    @Args('groupId', { type: () => ID }) groupId: string,
    @Args('practiceNumber', { type: () => Int }) practiceNumber: number,
  ): Promise<TeacherTestPaperObject> {
    return this.testsService.getTeacherTestPaper(
      teacherId,
      groupId,
      practiceNumber,
    );
  }

  @Query(() => StudentTestPaperConnectionObject, {
    name: 'studentTestPapers',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  getStudentTestPapers(
    @AuthMember('id') studentId: string,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true, type: () => String }) after?: string,
  ): Promise<StudentTestPaperConnectionObject> {
    return this.testsService.getStudentTestPapers(studentId, first, after);
  }

  @Query(() => StudentTestPaperObject, { name: 'studentTestPaper' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  getStudentTestPaper(
    @AuthMember('id') studentId: string,
    @Args('paperId', { type: () => ID }) paperId: string,
  ): Promise<StudentTestPaperObject> {
    return this.testsService.getStudentTestPaper(studentId, paperId);
  }

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

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
import { CreateTeacherPracticeTestInput } from '../../schemas/tests/authoring/teacher-test-paper.input';
import {
  StudentTestConnectionObject,
  StudentTestObject,
} from '../../schemas/tests/student/student-test.object';

import {
  StudentTestPaperConnectionObject,
  StudentTestPaperObject,
} from '../../schemas/tests/student/student-test-paper.object';

import {
  TeacherTestPaperPageObject,
  TeacherTestPaperDeletionPayloadObject,
  TeacherTestPaperPayloadObject,
  TeacherTestPaperObject,
} from '../../schemas/tests/authoring/teacher-test-paper.object';

import { PracticeBookmarkPayloadObject } from '../../schemas/tests/bookmarks/practice-bookmark-payload.object';
import { SetPracticeBookmarkInput } from '../../schemas/tests/bookmarks/set-practice-bookmark.input';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

import { StudentTestsService } from './student/student-tests.service';
import { TeacherPracticesService } from './teacher/teacher-practices.service';
import { PracticeBookmarksService } from './practice-bookmarks.service';

@Resolver()
export class TestsResolver {
  constructor(
    private readonly testsService: StudentTestsService,
    private readonly teacherPracticesService: TeacherPracticesService,
    private readonly practiceBookmarksService: PracticeBookmarksService,
  ) {}

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
      testPaper: await this.teacherPracticesService.createTeacherPracticeTest(
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
    return this.teacherPracticesService.deleteTeacherPracticeTest(
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
    return this.practiceBookmarksService.setPracticeBookmark(
      userId,
      role,
      input,
    );
  }

  @Query(() => TeacherTestPaperPageObject, { name: 'teacherTestPapers' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  getTeacherTestPapers(
    @AuthMember('id') teacherId: string,
    @Args('groupId', { type: () => ID }) groupId: string,
    @Args('page', { defaultValue: 1, type: () => Int }) page: number,
  ): Promise<TeacherTestPaperPageObject> {
    return this.teacherPracticesService.getTeacherTestPapers(
      teacherId,
      groupId,
      page,
    );
  }

  @Query(() => TeacherTestPaperObject, { name: 'teacherTestPaper' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  getTeacherTestPaper(
    @AuthMember('id') teacherId: string,
    @Args('groupId', { type: () => ID }) groupId: string,
    @Args('practiceNumber', { type: () => Int }) practiceNumber: number,
  ): Promise<TeacherTestPaperObject> {
    return this.teacherPracticesService.getTeacherTestPaper(
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

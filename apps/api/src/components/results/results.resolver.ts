import { AttemptStatus, Language, TestSkill, UserRole } from '@best/database';
import { UseGuards } from '@nestjs/common';
import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';

import { StudentResultConnectionObject } from '../../schemas/results/student-result-connection.object';
import { StudentProgressObject } from '../../schemas/results/student-progress.object';
import { StudentSpeakingResultObject } from '../../schemas/results/student-speaking-result.object';
import { StudentWritingResultObject } from '../../schemas/results/student-writing-result.object';
import { AdminAcademicOverviewObject } from '../../schemas/results/admin-academic-overview.object';
import { AdminGroupProgressConnectionObject } from '../../schemas/results/admin-group-progress.object';
import { AdminStudentResultConnectionObject } from '../../schemas/results/admin-student-result.object';
import { AdminStudentConnectionObject } from '../../schemas/results/admin-student.object';
import { TeacherAttemptConnectionObject } from '../../schemas/results/teacher-attempt.object';
import { TeacherResultInboxConnectionObject } from '../../schemas/results/teacher-result-inbox.object';
import { TeacherObjectiveAttemptResultObject } from '../../schemas/results/teacher-objective-attempt-result.object';
import { TeacherAttemptReviewObject } from '../../schemas/results/teacher-attempt-review.object';
import { TeacherSpeakingAttemptReviewObject } from '../../schemas/results/teacher-speaking-attempt-review.object';
import { TeacherWritingAttemptReviewObject } from '../../schemas/results/writing-attempt-review.object';
import { SaveSpeakingAttemptReviewInput } from '../../schemas/results/save-speaking-attempt-review.input';
import { SaveWritingAttemptReviewInput } from '../../schemas/results/save-writing-attempt-review.input';
import { TeacherGroupProgressObject } from '../../schemas/results/teacher-group-progress.object';
import { TeacherStudentProgressConnectionObject } from '../../schemas/results/teacher-student-progress.object';
import { TeacherStudentTestProgressConnectionObject } from '../../schemas/results/teacher-student-test-progress.object';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

import { ResultsService } from './results.service';
import { AdminResultsService } from './admin-results.service';
import { TeacherResultsService } from './teacher-results.service';

@Resolver()
export class ResultsResolver {
  constructor(
    private readonly adminResultsService: AdminResultsService,
    private readonly resultsService: ResultsService,
    private readonly teacherResultsService: TeacherResultsService,
  ) {}

  @Query(() => TestSkill, { name: 'teacherResultAttemptSkill' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  getTeacherResultAttemptSkill(
    @AuthMember('id') teacherId: string,
    @Args('attemptId', { type: () => ID }) attemptId: string,
  ): Promise<TestSkill> {
    return this.teacherResultsService.getResultAttemptSkill(
      teacherId,
      attemptId,
    );
  }

  @Query(() => TeacherObjectiveAttemptResultObject, {
    name: 'teacherObjectiveAttemptResult',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  getTeacherObjectiveAttemptResult(
    @AuthMember('id') teacherId: string,
    @Args('attemptId', { type: () => ID }) attemptId: string,
    @Args('language', { type: () => Language }) language: Language,
  ): Promise<TeacherObjectiveAttemptResultObject> {
    return this.teacherResultsService.getObjectiveAttemptResult(
      teacherId,
      attemptId,
      language,
    );
  }

  @Query(() => TeacherResultInboxConnectionObject, {
    name: 'teacherResultInbox',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  getTeacherResultInbox(
    @AuthMember('id') teacherId: string,
    @Args('language', { type: () => Language }) language: Language,
    @Args('groupId', { nullable: true, type: () => ID }) groupId?: string,
    @Args('paperId', { nullable: true, type: () => ID }) paperId?: string,
    @Args('skill', { nullable: true, type: () => TestSkill }) skill?: TestSkill,
    @Args('status', { nullable: true, type: () => AttemptStatus })
    status?: AttemptStatus,
    @Args('search', { nullable: true, type: () => String }) search?: string,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true, type: () => String }) after?: string,
  ): Promise<TeacherResultInboxConnectionObject> {
    return this.teacherResultsService.getResultInbox(
      teacherId,
      language,
      groupId,
      paperId,
      skill,
      status,
      search,
      first,
      after,
    );
  }

  @Query(() => AdminAcademicOverviewObject, { name: 'adminAcademicOverview' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getAdminAcademicOverview(): Promise<AdminAcademicOverviewObject> {
    return this.adminResultsService.getAcademicOverview();
  }

  @Query(() => AdminGroupProgressConnectionObject, {
    name: 'adminGroupProgresses',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getAdminGroupProgresses(
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true, type: () => String }) after?: string,
  ): Promise<AdminGroupProgressConnectionObject> {
    return this.adminResultsService.getGroupProgresses(first, after);
  }

  @Query(() => AdminStudentConnectionObject, { name: 'adminStudents' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getAdminStudents(
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true, type: () => String }) after?: string,
  ): Promise<AdminStudentConnectionObject> {
    return this.adminResultsService.getStudents(first, after);
  }

  @Query(() => AdminStudentResultConnectionObject, {
    name: 'adminStudentResults',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getAdminStudentResults(
    @Args('studentId', { type: () => ID }) studentId: string,
    @Args('language', { type: () => Language }) language: Language,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true, type: () => String }) after?: string,
  ): Promise<AdminStudentResultConnectionObject> {
    return this.adminResultsService.getStudentResults(
      studentId,
      language,
      first,
      after,
    );
  }

  @Query(() => StudentProgressObject, { name: 'studentProgress' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  getStudentProgress(
    @AuthMember('id') studentId: string,
  ): Promise<StudentProgressObject> {
    return this.resultsService.getStudentProgress(studentId);
  }

  @Query(() => StudentSpeakingResultObject, {
    name: 'studentSpeakingResult',
    nullable: true,
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  getStudentSpeakingResult(
    @AuthMember('id') studentId: string,
    @Args('attemptId', { type: () => ID }) attemptId: string,
    @Args('language', { type: () => Language }) language: Language,
  ): Promise<StudentSpeakingResultObject | null> {
    return this.resultsService.getStudentSpeakingResult(
      studentId,
      attemptId,
      language,
    );
  }

  @Query(() => StudentWritingResultObject, {
    name: 'studentWritingResult',
    nullable: true,
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  getStudentWritingResult(
    @AuthMember('id') studentId: string,
    @Args('attemptId', { type: () => ID }) attemptId: string,
    @Args('language', { type: () => Language }) language: Language,
  ): Promise<StudentWritingResultObject | null> {
    return this.resultsService.getStudentWritingResult(
      studentId,
      attemptId,
      language,
    );
  }

  @Query(() => TeacherGroupProgressObject, { name: 'teacherGroupProgress' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  getTeacherGroupProgress(
    @AuthMember('id') teacherId: string,
    @Args('groupId', { type: () => ID }) groupId: string,
  ): Promise<TeacherGroupProgressObject> {
    return this.teacherResultsService.getGroupProgress(teacherId, groupId);
  }

  @Query(() => TeacherStudentProgressConnectionObject, {
    name: 'teacherGroupStudents',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  getTeacherGroupStudents(
    @AuthMember('id') teacherId: string,
    @Args('groupId', { type: () => ID }) groupId: string,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true, type: () => String }) after?: string,
  ): Promise<TeacherStudentProgressConnectionObject> {
    return this.teacherResultsService.getGroupStudents(
      teacherId,
      groupId,
      first,
      after,
    );
  }

  @Query(() => TeacherStudentTestProgressConnectionObject, {
    name: 'teacherStudentTests',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  getTeacherStudentTests(
    @AuthMember('id') teacherId: string,
    @Args('groupId', { type: () => ID }) groupId: string,
    @Args('studentId', { type: () => ID }) studentId: string,
    @Args('language', { type: () => Language }) language: Language,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true, type: () => String }) after?: string,
  ): Promise<TeacherStudentTestProgressConnectionObject> {
    return this.teacherResultsService.getStudentTests(
      teacherId,
      groupId,
      studentId,
      language,
      first,
      after,
    );
  }

  @Query(() => TeacherAttemptConnectionObject, {
    name: 'teacherStudentAttempts',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  getTeacherStudentAttempts(
    @AuthMember('id') teacherId: string,
    @Args('groupId', { type: () => ID }) groupId: string,
    @Args('studentId', { type: () => ID }) studentId: string,
    @Args('language', { type: () => Language }) language: Language,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true, type: () => String }) after?: string,
  ): Promise<TeacherAttemptConnectionObject> {
    return this.teacherResultsService.getStudentAttempts(
      teacherId,
      groupId,
      studentId,
      language,
      first,
      after,
    );
  }

  @Query(() => TeacherAttemptReviewObject, { name: 'teacherAttemptReview' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  getTeacherAttemptReview(
    @AuthMember('id') teacherId: string,
    @Args('attemptId', { type: () => ID }) attemptId: string,
    @Args('language', { type: () => Language }) language: Language,
  ): Promise<TeacherAttemptReviewObject> {
    return this.teacherResultsService.getAttemptReview(
      teacherId,
      attemptId,
      language,
    );
  }

  @Query(() => TeacherSpeakingAttemptReviewObject, {
    name: 'teacherSpeakingAttemptReview',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  getTeacherSpeakingAttemptReview(
    @AuthMember('id') teacherId: string,
    @Args('attemptId', { type: () => ID }) attemptId: string,
    @Args('language', { type: () => Language }) language: Language,
  ): Promise<TeacherSpeakingAttemptReviewObject> {
    return this.teacherResultsService.getSpeakingAttemptReview(
      teacherId,
      attemptId,
      language,
    );
  }

  @Mutation(() => TeacherSpeakingAttemptReviewObject, {
    name: 'saveSpeakingAttemptReview',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async saveSpeakingAttemptReview(
    @AuthMember('id') teacherId: string,
    @Args('input') input: SaveSpeakingAttemptReviewInput,
    @Args('language', { type: () => Language }) language: Language,
  ): Promise<TeacherSpeakingAttemptReviewObject> {
    await this.teacherResultsService.saveSpeakingAttemptReview(
      teacherId,
      input,
    );
    return this.teacherResultsService.getSpeakingAttemptReview(
      teacherId,
      input.attemptId,
      language,
    );
  }

  @Query(() => TeacherWritingAttemptReviewObject, {
    name: 'teacherWritingAttemptReview',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  getTeacherWritingAttemptReview(
    @AuthMember('id') teacherId: string,
    @Args('attemptId', { type: () => ID }) attemptId: string,
    @Args('language', { type: () => Language }) language: Language,
  ): Promise<TeacherWritingAttemptReviewObject> {
    return this.teacherResultsService.getWritingAttemptReview(
      teacherId,
      attemptId,
      language,
    );
  }

  @Mutation(() => TeacherWritingAttemptReviewObject, {
    name: 'saveWritingAttemptReview',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async saveWritingAttemptReview(
    @AuthMember('id') teacherId: string,
    @Args('input') input: SaveWritingAttemptReviewInput,
    @Args('language', { type: () => Language }) language: Language,
  ): Promise<TeacherWritingAttemptReviewObject> {
    await this.teacherResultsService.saveWritingAttemptReview(teacherId, input);
    return this.teacherResultsService.getWritingAttemptReview(
      teacherId,
      input.attemptId,
      language,
    );
  }

  @Query(() => StudentResultConnectionObject, { name: 'studentResults' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  getStudentResults(
    @AuthMember('id') studentId: string,
    @Args('language', { type: () => Language }) language: Language,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true, type: () => String }) after?: string,
  ): Promise<StudentResultConnectionObject> {
    return this.resultsService.getStudentResults(
      studentId,
      language,
      first,
      after,
    );
  }
}

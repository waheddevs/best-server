import {
  AttemptStatus,
  ContentStatus,
  Language,
  TestVersionStatus,
} from '@best/database';
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import { ErrorCode } from '../../libs/enums/error-code.enum';
import { ApplicationError } from '../../libs/errors/application.error';
import {
  decodeCursor,
  encodeCursor,
  parsePageSize,
  parseUuid,
} from '../../libs/pagination/cursor-pagination';
import type { TeacherAttemptConnectionObject } from '../../schemas/results/teacher-attempt.object';
import type { TeacherAttemptReviewObject } from '../../schemas/results/teacher-attempt-review.object';
import type { TeacherGroupProgressObject } from '../../schemas/results/teacher-group-progress.object';
import type { TeacherStudentProgressConnectionObject } from '../../schemas/results/teacher-student-progress.object';
import { TeacherStudentTestProgressStatus } from '../../schemas/results/teacher-student-test-progress.enum';
import type { TeacherStudentTestProgressConnectionObject } from '../../schemas/results/teacher-student-test-progress.object';

import {
  calculateProgress,
  type ProgressAttempt,
  type ProgressMetrics,
} from './results-progress';

@Injectable()
export class TeacherResultsService {
  constructor(private readonly database: DatabaseService) {}

  async getGroupProgress(
    teacherId: string,
    groupIdInput: string,
  ): Promise<TeacherGroupProgressObject> {
    const group = await this.requireOwnedGroup(teacherId, groupIdInput);
    const [assignedTestIds, memberships] = await Promise.all([
      this.getAssignedTestIds(group.id),
      this.database.groupMembership.findMany({
        where: { endedAt: null, groupId: group.id },
        select: { id: true },
      }),
    ]);
    const membershipIds = memberships.map(({ id }) => id);
    const attempts =
      membershipIds.length === 0 || assignedTestIds.length === 0
        ? []
        : await this.database.attempt.findMany({
            where: {
              groupMembershipId: { in: membershipIds },
              testVersion: { testId: { in: assignedTestIds } },
            },
            select: {
              groupMembershipId: true,
              passed: true,
              percentage: true,
              status: true,
              testVersion: { select: { testId: true } },
              updatedAt: true,
            },
          });
    const progress = calculateProgress(
      membershipIds.length * assignedTestIds.length,
      attempts.map((attempt) => ({
        assignmentKey: `${attempt.groupMembershipId}:${attempt.testVersion.testId}`,
        passed: attempt.passed,
        percentage: attempt.percentage,
        status: attempt.status,
        updatedAt: attempt.updatedAt,
      })),
    );

    return {
      activeStudentCount: membershipIds.length,
      assignedTestCount: assignedTestIds.length,
      averagePercentage: progress.averagePercentage,
      awaitingScoreAssignmentCount: progress.awaitingScoreCount,
      completedAssignmentCount: progress.completedCount,
      completionPercentage: progress.completionPercentage,
      failedAssignmentCount: progress.failedCount,
      groupId: group.id,
      groupName: group.name,
      highestPercentage: progress.highestPercentage,
      lowestPercentage: progress.lowestPercentage,
      passedAssignmentCount: progress.passedCount,
      remainingAssignmentCount: progress.remainingCount,
      scoredAssignmentCount: progress.scoredCount,
      totalAssignmentCount: progress.assignedCount,
    };
  }

  async getGroupStudents(
    teacherId: string,
    groupIdInput: string,
    first: number | undefined,
    after: string | undefined,
  ): Promise<TeacherStudentProgressConnectionObject> {
    const group = await this.requireOwnedGroup(teacherId, groupIdInput);
    const pageSize = parsePageSize(first);
    const afterId = decodeCursor(after);
    const [assignedTestIds, memberships] = await Promise.all([
      this.getAssignedTestIds(group.id),
      this.database.groupMembership.findMany({
        where: {
          ...(afterId === undefined ? {} : { id: { gt: afterId } }),
          endedAt: null,
          groupId: group.id,
        },
        include: { student: { select: { displayName: true, id: true } } },
        orderBy: { id: 'asc' },
        take: pageSize + 1,
      }),
    ]);
    const hasNextPage = memberships.length > pageSize;
    const page = hasNextPage ? memberships.slice(0, pageSize) : memberships;
    const membershipIds = page.map(({ id }) => id);
    const attempts =
      membershipIds.length === 0 || assignedTestIds.length === 0
        ? []
        : await this.database.attempt.findMany({
            where: {
              groupMembershipId: { in: membershipIds },
              testVersion: { testId: { in: assignedTestIds } },
            },
            select: {
              groupMembershipId: true,
              passed: true,
              percentage: true,
              status: true,
              testVersion: { select: { testId: true } },
              updatedAt: true,
            },
          });
    const attemptsByMembershipId = new Map<string, ProgressAttempt[]>();

    for (const attempt of attempts) {
      const values =
        attemptsByMembershipId.get(attempt.groupMembershipId) ?? [];
      values.push({
        assignmentKey: attempt.testVersion.testId,
        passed: attempt.passed,
        percentage: attempt.percentage,
        status: attempt.status,
        updatedAt: attempt.updatedAt,
      });
      attemptsByMembershipId.set(attempt.groupMembershipId, values);
    }

    const edges = page.map((membership) => {
      const progress = calculateProgress(
        assignedTestIds.length,
        attemptsByMembershipId.get(membership.id) ?? [],
      );

      return {
        cursor: encodeCursor(membership.id),
        node: {
          assignedTestCount: progress.assignedCount,
          averagePercentage: progress.averagePercentage,
          awaitingScoreTestCount: progress.awaitingScoreCount,
          completedTestCount: progress.completedCount,
          completionPercentage: progress.completionPercentage,
          displayName: membership.student.displayName,
          failedTestCount: progress.failedCount,
          highestPercentage: progress.highestPercentage,
          latestActivityAt: progress.latestActivityAt,
          lowestPercentage: progress.lowestPercentage,
          passedTestCount: progress.passedCount,
          remainingTestCount: progress.remainingCount,
          scoredTestCount: progress.scoredCount,
          studentId: membership.student.id,
        },
      };
    });

    return {
      edges,
      pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
    };
  }

  async getStudentTests(
    teacherId: string,
    groupIdInput: string,
    studentIdInput: string,
    language: Language,
    first: number | undefined,
    after: string | undefined,
  ): Promise<TeacherStudentTestProgressConnectionObject> {
    const group = await this.requireOwnedGroup(teacherId, groupIdInput);
    const studentId = parseUuid(studentIdInput, 'studentId');
    const membership = await this.database.groupMembership.findFirst({
      where: { endedAt: null, groupId: group.id, studentId },
      select: { id: true },
    });

    if (membership === null) {
      throw notFound('Group Student');
    }

    const pageSize = parsePageSize(first);
    const afterId = decodeCursor(after);
    const now = new Date();
    const tests = await this.database.test.findMany({
      where: {
        ...(afterId === undefined ? {} : { id: { gt: afterId } }),
        groupId: group.id,
        status: ContentStatus.ACTIVE,
        versions: {
          some: {
            OR: [
              { availabilityStartsAt: null },
              { availabilityStartsAt: { lte: now } },
            ],
            status: TestVersionStatus.PUBLISHED,
          },
        },
      },
      include: {
        versions: {
          where: {
            OR: [
              { availabilityStartsAt: null },
              { availabilityStartsAt: { lte: now } },
            ],
            status: TestVersionStatus.PUBLISHED,
          },
          orderBy: { version: 'desc' },
          take: 1,
          select: {
            translations: {
              where: { language },
              select: { title: true },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
      take: pageSize + 1,
    });
    const hasNextPage = tests.length > pageSize;
    const page = hasNextPage ? tests.slice(0, pageSize) : tests;
    const testIds = page.map(({ id }) => id);
    const attempts =
      testIds.length === 0
        ? []
        : await this.database.attempt.findMany({
            where: {
              groupMembershipId: membership.id,
              testVersion: { testId: { in: testIds } },
            },
            select: {
              passed: true,
              percentage: true,
              status: true,
              testVersion: { select: { testId: true } },
              updatedAt: true,
            },
          });
    const attemptsByTestId = new Map<string, typeof attempts>();

    for (const attempt of attempts) {
      const testId = attempt.testVersion.testId;
      const values = attemptsByTestId.get(testId) ?? [];
      values.push(attempt);
      attemptsByTestId.set(testId, values);
    }

    const edges = page.map((test) => {
      const title = test.versions[0]?.translations[0]?.title;

      if (title === undefined) {
        throw translationNotAvailable();
      }

      const testAttempts = attemptsByTestId.get(test.id) ?? [];
      const progress = calculateProgress(
        1,
        testAttempts.map((attempt) => ({
          assignmentKey: test.id,
          passed: attempt.passed,
          percentage: attempt.percentage,
          status: attempt.status,
          updatedAt: attempt.updatedAt,
        })),
      );

      return {
        cursor: encodeCursor(test.id),
        node: {
          attemptCount: testAttempts.length,
          highestPercentage: progress.highestPercentage,
          latestActivityAt: progress.latestActivityAt,
          status: resolveTestProgressStatus(testAttempts, progress),
          testId: test.id,
          title,
        },
      };
    });

    return {
      edges,
      pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
    };
  }

  async getStudentAttempts(
    teacherId: string,
    groupIdInput: string,
    studentIdInput: string,
    language: Language,
    first: number | undefined,
    after: string | undefined,
  ): Promise<TeacherAttemptConnectionObject> {
    const group = await this.requireOwnedGroup(teacherId, groupIdInput);
    const studentId = parseUuid(studentIdInput, 'studentId');
    const membershipExists = await this.database.groupMembership.findFirst({
      where: { groupId: group.id, studentId },
      select: { id: true },
    });

    if (membershipExists === null) {
      throw notFound('Group Student');
    }

    const pageSize = parsePageSize(first);
    const afterId = decodeCursor(after);
    const attempts = await this.database.attempt.findMany({
      where: {
        ...(afterId === undefined ? {} : { id: { gt: afterId } }),
        groupMembership: { groupId: group.id },
        studentId,
      },
      include: {
        testVersion: {
          include: {
            test: { select: { id: true } },
            translations: {
              where: { language },
              select: { title: true },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
      take: pageSize + 1,
    });
    const hasNextPage = attempts.length > pageSize;
    const page = hasNextPage ? attempts.slice(0, pageSize) : attempts;
    const edges = page.map((attempt) => {
      const title = attempt.testVersion.translations[0]?.title;

      if (title === undefined) {
        throw translationNotAvailable();
      }

      return {
        cursor: encodeCursor(attempt.id),
        node: {
          attemptId: attempt.id,
          attemptNumber: attempt.attemptNumber,
          passed: attempt.passed,
          percentage: attempt.percentage?.toNumber() ?? null,
          startedAt: attempt.startedAt,
          status: attempt.status,
          submittedAt: attempt.submittedAt,
          testId: attempt.testVersion.test.id,
          title,
        },
      };
    });

    return {
      edges,
      pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
    };
  }

  async getAttemptReview(
    teacherId: string,
    attemptIdInput: string,
    language: Language,
  ): Promise<TeacherAttemptReviewObject> {
    const attemptId = parseUuid(attemptIdInput, 'attemptId');
    const attempt = await this.database.attempt.findFirst({
      where: { groupMembership: { group: { teacherId } }, id: attemptId },
      include: {
        answers: { select: { questionId: true, selectedOptionId: true } },
        student: { select: { displayName: true, id: true } },
        testVersion: {
          include: {
            questions: {
              include: {
                options: {
                  include: {
                    translations: {
                      where: { language },
                      select: { text: true },
                    },
                  },
                  orderBy: { position: 'asc' },
                },
                translations: {
                  where: { language },
                  select: { prompt: true },
                },
              },
              orderBy: { position: 'asc' },
            },
            test: { select: { id: true } },
            translations: {
              where: { language },
              select: { title: true },
            },
          },
        },
      },
    });

    if (attempt === null) {
      throw notFound('Attempt');
    }

    const title = attempt.testVersion.translations[0]?.title;

    if (title === undefined) {
      throw translationNotAvailable();
    }

    const selectedOptionByQuestionId = new Map(
      attempt.answers.map((answer) => [
        answer.questionId,
        answer.selectedOptionId,
      ]),
    );
    const answers = attempt.testVersion.questions.map((question) => {
      const prompt = question.translations[0]?.prompt;
      const correctOption = question.options.find(({ isCorrect }) => isCorrect);
      const selectedOptionId =
        selectedOptionByQuestionId.get(question.id) ?? null;
      const selectedOption =
        selectedOptionId === null
          ? undefined
          : question.options.find(({ id }) => id === selectedOptionId);
      const selectedOptionText = selectedOption?.translations[0]?.text;
      const correctOptionText = correctOption?.translations[0]?.text;
      const selectedTranslationMissing =
        selectedOptionId === null ? false : selectedOptionText === undefined;

      if (
        prompt === undefined ||
        correctOption === undefined ||
        correctOptionText === undefined ||
        selectedTranslationMissing
      ) {
        throw translationNotAvailable();
      }

      return {
        correctOptionId: correctOption.id,
        correctOptionText,
        isCorrect: selectedOptionId === correctOption.id,
        position: question.position,
        prompt,
        questionId: question.id,
        selectedOptionId,
        selectedOptionText: selectedOptionText ?? null,
      };
    });

    return {
      answers,
      attemptId: attempt.id,
      attemptNumber: attempt.attemptNumber,
      passed: attempt.passed,
      percentage: attempt.percentage?.toNumber() ?? null,
      startedAt: attempt.startedAt,
      status: attempt.status,
      studentDisplayName: attempt.student.displayName,
      studentId: attempt.student.id,
      submittedAt: attempt.submittedAt,
      testId: attempt.testVersion.test.id,
      title,
    };
  }

  private async requireOwnedGroup(teacherId: string, groupIdInput: string) {
    const groupId = parseUuid(groupIdInput, 'groupId');
    const group = await this.database.group.findFirst({
      where: { id: groupId, teacherId },
      select: { id: true, name: true },
    });

    if (group === null) {
      throw notFound('Group');
    }

    return group;
  }

  private async getAssignedTestIds(groupId: string): Promise<string[]> {
    const now = new Date();
    const tests = await this.database.test.findMany({
      where: {
        groupId,
        status: ContentStatus.ACTIVE,
        versions: {
          some: {
            OR: [
              { availabilityStartsAt: null },
              { availabilityStartsAt: { lte: now } },
            ],
            status: TestVersionStatus.PUBLISHED,
          },
        },
      },
      select: { id: true },
    });

    return tests.map(({ id }) => id);
  }
}

function notFound(resourceName: string): ApplicationError {
  return new ApplicationError(
    ErrorCode.NOT_FOUND,
    `${resourceName} was not found`,
    404,
  );
}

function translationNotAvailable(): ApplicationError {
  return new ApplicationError(
    ErrorCode.TRANSLATION_NOT_AVAILABLE,
    'The requested result translation is not available',
    400,
  );
}

function resolveTestProgressStatus(
  attempts: readonly { readonly status: AttemptStatus }[],
  progress: ProgressMetrics,
): TeacherStudentTestProgressStatus {
  if (attempts.some(({ status }) => status === AttemptStatus.SUBMITTED)) {
    return TeacherStudentTestProgressStatus.AWAITING_SCORE;
  }

  if (progress.scoredCount > 0) {
    return progress.passedCount > 0
      ? TeacherStudentTestProgressStatus.PASSED
      : TeacherStudentTestProgressStatus.FAILED;
  }

  if (attempts.some(({ status }) => status === AttemptStatus.IN_PROGRESS)) {
    return TeacherStudentTestProgressStatus.IN_PROGRESS;
  }

  return TeacherStudentTestProgressStatus.NOT_STARTED;
}

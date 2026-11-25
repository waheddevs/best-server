import { ContentStatus, Language, TestVersionStatus } from '@best/database';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import {
  decodeCursor,
  encodeCursor,
  parsePageSize,
  parseUuid,
} from '../../../libs/pagination/cursor-pagination';
import type { TeacherAttemptConnectionObject } from '../../../schemas/results/review/teacher-attempt.object';
import type { TeacherGroupProgressObject } from '../../../schemas/results/progress/teacher-group-progress.object';
import type { TeacherStudentProgressConnectionObject } from '../../../schemas/results/progress/teacher-student-progress.object';
import type { TeacherStudentTestProgressConnectionObject } from '../../../schemas/results/progress/teacher-student-test-progress.object';
import { ResultsProgressService } from '../progress/results-progress.service';
import {
  emptyProgress,
  type ProgressMetrics,
} from '../progress/progress-metrics';
import { TeacherStudentTestProgressStatus } from '../../../schemas/results/progress/teacher-student-test-progress.enum';
import { notFound, translationNotAvailable } from '../result-errors';

@Injectable()
export class TeacherProgressService {
  constructor(
    private readonly database: DatabaseService,
    private readonly resultsProgressService: ResultsProgressService,
  ) {}
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
    const progressByKey = await this.resultsProgressService.getProgress(
      membershipIds,
      assignedTestIds,
      'all',
    );
    const progress =
      progressByKey.get('all') ??
      emptyProgress(membershipIds.length * assignedTestIds.length);

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
    const progressByMembershipId =
      await this.resultsProgressService.getProgress(
        membershipIds,
        assignedTestIds,
        'membership',
      );

    const edges = page.map((membership) => {
      const progress =
        progressByMembershipId.get(membership.id) ??
        emptyProgress(assignedTestIds.length);

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
    const progressByTestId = await this.resultsProgressService.getProgress(
      [membership.id],
      testIds,
      'test',
    );

    const edges = page.map((test) => {
      const title = test.versions[0]?.translations[0]?.title;

      if (title === undefined) {
        throw translationNotAvailable();
      }

      const progress = progressByTestId.get(test.id) ?? emptyProgress(1);

      return {
        cursor: encodeCursor(test.id),
        node: {
          attemptCount: progress.attemptCount,
          highestPercentage: progress.highestPercentage,
          latestActivityAt: progress.latestActivityAt,
          status: resolveTestProgressStatus(progress),
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
            test: { select: { id: true, skill: true } },
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
          skill: attempt.testVersion.test.skill,
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

  async requireOwnedGroup(teacherId: string, groupIdInput: string) {
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

function resolveTestProgressStatus(
  progress: ProgressMetrics,
): TeacherStudentTestProgressStatus {
  if (progress.awaitingScoreCount > 0)
    return TeacherStudentTestProgressStatus.AWAITING_SCORE;
  if (progress.scoredCount > 0) {
    return progress.passedCount > 0
      ? TeacherStudentTestProgressStatus.PASSED
      : TeacherStudentTestProgressStatus.FAILED;
  }
  return progress.hasInProgressAttempt
    ? TeacherStudentTestProgressStatus.IN_PROGRESS
    : TeacherStudentTestProgressStatus.NOT_STARTED;
}

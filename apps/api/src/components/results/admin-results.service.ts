import {
  AttemptStatus,
  ContentStatus,
  Language,
  Prisma,
  TestVersionStatus,
  UserRole,
  UserStatus,
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
import type { AdminAcademicOverviewObject } from '../../schemas/results/admin-academic-overview.object';
import type { AdminGroupProgressConnectionObject } from '../../schemas/results/admin-group-progress.object';
import type { AdminStudentResultConnectionObject } from '../../schemas/results/admin-student-result.object';
import type { AdminStudentConnectionObject } from '../../schemas/results/admin-student.object';

import { calculateProgress, type ProgressAttempt } from './results-progress';

interface OverviewAggregateRow {
  readonly assignedTestCount: number;
  readonly awaitingScoreAssignmentCount: number;
  readonly averagePercentage: number | null;
  readonly completedAssignmentCount: number;
  readonly failedAssignmentCount: number;
  readonly highestPercentage: number | null;
  readonly lowestPercentage: number | null;
  readonly passedAssignmentCount: number;
  readonly scoredAssignmentCount: number;
  readonly totalAssignmentCount: number;
}

@Injectable()
export class AdminResultsService {
  constructor(private readonly database: DatabaseService) {}

  async getAcademicOverview(): Promise<AdminAcademicOverviewObject> {
    const [activeTeacherCount, activeStudentCount, activeGroupCount, rows] =
      await Promise.all([
        this.database.user.count({
          where: { role: UserRole.TEACHER, status: UserStatus.ACTIVE },
        }),
        this.database.user.count({
          where: { role: UserRole.STUDENT, status: UserStatus.ACTIVE },
        }),
        this.database.group.count({
          where: { status: ContentStatus.ACTIVE },
        }),
        this.database.$queryRaw<OverviewAggregateRow[]>(Prisma.sql`
          WITH "eligible_tests" AS (
            SELECT DISTINCT "tests"."id", "tests"."group_id"
            FROM "tests"
            INNER JOIN "groups"
              ON "groups"."id" = "tests"."group_id"
            INNER JOIN "test_versions"
              ON "test_versions"."test_id" = "tests"."id"
            WHERE "groups"."status" = 'ACTIVE'
              AND "tests"."status" = 'ACTIVE'
              AND "test_versions"."status" = 'PUBLISHED'
              AND (
                "test_versions"."availability_starts_at" IS NULL
                OR "test_versions"."availability_starts_at" <= CURRENT_TIMESTAMP
              )
          ),
          "active_memberships" AS (
            SELECT "group_memberships"."id", "group_memberships"."group_id"
            FROM "group_memberships"
            INNER JOIN "groups"
              ON "groups"."id" = "group_memberships"."group_id"
            WHERE "group_memberships"."ended_at" IS NULL
              AND "groups"."status" = 'ACTIVE'
          ),
          "assignments" AS (
            SELECT
              "active_memberships"."id" AS "membership_id",
              "eligible_tests"."id" AS "test_id"
            FROM "active_memberships"
            INNER JOIN "eligible_tests"
              ON "eligible_tests"."group_id" = "active_memberships"."group_id"
          ),
          "assignment_attempts" AS (
            SELECT
              "assignments"."membership_id",
              "assignments"."test_id",
              "attempts"."status",
              "attempts"."percentage",
              "attempts"."passed"
            FROM "assignments"
            INNER JOIN "attempts"
              ON "attempts"."group_membership_id" = "assignments"."membership_id"
            INNER JOIN "test_versions"
              ON "test_versions"."id" = "attempts"."test_version_id"
              AND "test_versions"."test_id" = "assignments"."test_id"
          ),
          "completed_assignments" AS (
            SELECT DISTINCT "membership_id", "test_id"
            FROM "assignment_attempts"
            WHERE "status" IN ('SUBMITTED', 'REVIEW_REQUIRED', 'SCORED')
          ),
          "awaiting_assignments" AS (
            SELECT DISTINCT "membership_id", "test_id"
            FROM "assignment_attempts"
            WHERE "status" IN ('SUBMITTED', 'REVIEW_REQUIRED')
          ),
          "best_scores" AS (
            SELECT DISTINCT ON ("membership_id", "test_id")
              "membership_id",
              "test_id",
              "percentage",
              "passed"
            FROM "assignment_attempts"
            WHERE "status" = 'SCORED'
              AND "percentage" IS NOT NULL
              AND "passed" IS NOT NULL
            ORDER BY
              "membership_id",
              "test_id",
              "percentage" DESC,
              "passed" DESC
          )
          SELECT
            (SELECT COUNT(*) FROM "eligible_tests")::integer
              AS "assignedTestCount",
            (SELECT COUNT(*) FROM "assignments")::integer
              AS "totalAssignmentCount",
            (SELECT COUNT(*) FROM "completed_assignments")::integer
              AS "completedAssignmentCount",
            (SELECT COUNT(*) FROM "awaiting_assignments")::integer
              AS "awaitingScoreAssignmentCount",
            (SELECT COUNT(*) FROM "best_scores")::integer
              AS "scoredAssignmentCount",
            (SELECT COUNT(*) FROM "best_scores" WHERE "passed")::integer
              AS "passedAssignmentCount",
            (SELECT COUNT(*) FROM "best_scores" WHERE NOT "passed")::integer
              AS "failedAssignmentCount",
            ROUND(AVG("percentage"), 2)::double precision
              AS "averagePercentage",
            MAX("percentage")::double precision AS "highestPercentage",
            MIN("percentage")::double precision AS "lowestPercentage"
          FROM "best_scores"
        `),
      ]);
    const aggregate = rows[0];

    if (aggregate === undefined) {
      throw internalDataError('Academic overview aggregation returned no row');
    }

    return {
      activeGroupCount,
      activeStudentCount,
      activeTeacherCount,
      assignedTestCount: aggregate.assignedTestCount,
      averagePercentage: aggregate.averagePercentage,
      awaitingScoreAssignmentCount: aggregate.awaitingScoreAssignmentCount,
      completedAssignmentCount: aggregate.completedAssignmentCount,
      completionPercentage:
        aggregate.totalAssignmentCount === 0
          ? 0
          : roundPercentage(
              (aggregate.completedAssignmentCount /
                aggregate.totalAssignmentCount) *
                100,
            ),
      failedAssignmentCount: aggregate.failedAssignmentCount,
      highestPercentage: aggregate.highestPercentage,
      lowestPercentage: aggregate.lowestPercentage,
      passedAssignmentCount: aggregate.passedAssignmentCount,
      remainingAssignmentCount:
        aggregate.totalAssignmentCount - aggregate.completedAssignmentCount,
      scoredAssignmentCount: aggregate.scoredAssignmentCount,
      totalAssignmentCount: aggregate.totalAssignmentCount,
    };
  }

  async getGroupProgresses(
    first: number | undefined,
    after: string | undefined,
  ): Promise<AdminGroupProgressConnectionObject> {
    const pageSize = parsePageSize(first);
    const afterId = decodeCursor(after);
    const groups = await this.database.group.findMany({
      where: afterId === undefined ? {} : { id: { gt: afterId } },
      include: { teacher: { select: { displayName: true, id: true } } },
      orderBy: { id: 'asc' },
      take: pageSize + 1,
    });
    const hasNextPage = groups.length > pageSize;
    const page = hasNextPage ? groups.slice(0, pageSize) : groups;
    const activeGroupIds = page
      .filter(({ status }) => status === ContentStatus.ACTIVE)
      .map(({ id }) => id);
    const [tests, memberships] =
      activeGroupIds.length === 0
        ? [[], []]
        : await Promise.all([
            this.database.test.findMany({
              where: {
                groupId: { in: activeGroupIds },
                status: ContentStatus.ACTIVE,
                versions: {
                  some: {
                    OR: [
                      { availabilityStartsAt: null },
                      { availabilityStartsAt: { lte: new Date() } },
                    ],
                    status: TestVersionStatus.PUBLISHED,
                  },
                },
              },
              select: { groupId: true, id: true },
            }),
            this.database.groupMembership.findMany({
              where: { endedAt: null, groupId: { in: activeGroupIds } },
              select: { groupId: true, id: true },
            }),
          ]);
    const membershipIds = memberships.map(({ id }) => id);
    const testIds = tests.map(({ id }) => id);
    const attempts =
      membershipIds.length === 0 || testIds.length === 0
        ? []
        : await this.database.attempt.findMany({
            where: {
              groupMembershipId: { in: membershipIds },
              testVersion: { testId: { in: testIds } },
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
    const testsByGroupId = groupIds(tests);
    const membershipsByGroupId = groupIds(memberships);
    const groupIdByMembershipId = new Map(
      memberships.map((membership) => [membership.id, membership.groupId]),
    );
    const attemptsByGroupId = new Map<string, ProgressAttempt[]>();

    for (const attempt of attempts) {
      const groupId = groupIdByMembershipId.get(attempt.groupMembershipId);

      if (groupId === undefined) {
        throw internalDataError('Attempt membership is outside the report');
      }

      const values = attemptsByGroupId.get(groupId) ?? [];
      values.push({
        assignmentKey: `${attempt.groupMembershipId}:${attempt.testVersion.testId}`,
        passed: attempt.passed,
        percentage: attempt.percentage,
        status: attempt.status,
        updatedAt: attempt.updatedAt,
      });
      attemptsByGroupId.set(groupId, values);
    }

    const edges = page.map((group) => {
      const groupTests = testsByGroupId.get(group.id) ?? [];
      const groupMemberships = membershipsByGroupId.get(group.id) ?? [];
      const progress = calculateProgress(
        groupTests.length * groupMemberships.length,
        attemptsByGroupId.get(group.id) ?? [],
      );

      return {
        cursor: encodeCursor(group.id),
        node: {
          activeStudentCount: groupMemberships.length,
          assignedTestCount: groupTests.length,
          averagePercentage: progress.averagePercentage,
          awaitingScoreAssignmentCount: progress.awaitingScoreCount,
          completedAssignmentCount: progress.completedCount,
          completionPercentage: progress.completionPercentage,
          failedAssignmentCount: progress.failedCount,
          groupId: group.id,
          groupName: group.name,
          groupStatus: group.status,
          highestPercentage: progress.highestPercentage,
          lowestPercentage: progress.lowestPercentage,
          passedAssignmentCount: progress.passedCount,
          remainingAssignmentCount: progress.remainingCount,
          scoredAssignmentCount: progress.scoredCount,
          teacherDisplayName: group.teacher.displayName,
          teacherId: group.teacher.id,
          totalAssignmentCount: progress.assignedCount,
        },
      };
    });

    return {
      edges,
      pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
    };
  }

  async getStudents(
    first: number | undefined,
    after: string | undefined,
  ): Promise<AdminStudentConnectionObject> {
    const pageSize = parsePageSize(first);
    const afterId = decodeCursor(after);
    const students = await this.database.user.findMany({
      where: {
        ...(afterId === undefined ? {} : { id: { gt: afterId } }),
        role: UserRole.STUDENT,
      },
      include: {
        groupMemberships: {
          where: { endedAt: null },
          include: { group: { select: { id: true, name: true } } },
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { id: 'asc' },
      take: pageSize + 1,
    });
    const hasNextPage = students.length > pageSize;
    const page = hasNextPage ? students.slice(0, pageSize) : students;
    const studentIds = page.map(({ id }) => id);
    const attempts =
      studentIds.length === 0
        ? []
        : await this.database.attempt.findMany({
            where: {
              status: AttemptStatus.SCORED,
              studentId: { in: studentIds },
            },
            select: {
              passed: true,
              percentage: true,
              studentId: true,
              submittedAt: true,
              status: true,
              testVersion: { select: { testId: true } },
              updatedAt: true,
            },
          });
    const attemptsByStudentId = new Map<string, typeof attempts>();

    for (const attempt of attempts) {
      const values = attemptsByStudentId.get(attempt.studentId) ?? [];
      values.push(attempt);
      attemptsByStudentId.set(attempt.studentId, values);
    }

    const edges = page.map((student) => {
      const studentAttempts = attemptsByStudentId.get(student.id) ?? [];
      const scoredTestIds = new Set(
        studentAttempts.map(({ testVersion }) => testVersion.testId),
      );
      const progress = calculateProgress(
        scoredTestIds.size,
        studentAttempts.map((attempt) => ({
          assignmentKey: attempt.testVersion.testId,
          passed: attempt.passed,
          percentage: attempt.percentage,
          status: attempt.status,
          updatedAt: attempt.updatedAt,
        })),
      );
      const membership = student.groupMemberships[0];

      return {
        cursor: encodeCursor(student.id),
        node: {
          averagePercentage: progress.averagePercentage,
          currentGroupId: membership?.group.id ?? null,
          currentGroupName: membership?.group.name ?? null,
          displayName: student.displayName,
          failedTestCount: progress.failedCount,
          highestPercentage: progress.highestPercentage,
          latestResultAt: latestSubmittedAt(studentAttempts),
          lowestPercentage: progress.lowestPercentage,
          passedTestCount: progress.passedCount,
          scoredAttemptCount: studentAttempts.length,
          scoredTestCount: progress.scoredCount,
          status: student.status,
          studentId: student.id,
        },
      };
    });

    return {
      edges,
      pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
    };
  }

  async getStudentResults(
    studentIdInput: string,
    language: Language,
    first: number | undefined,
    after: string | undefined,
  ): Promise<AdminStudentResultConnectionObject> {
    const studentId = parseUuid(studentIdInput, 'studentId');
    const student = await this.database.user.findFirst({
      where: { id: studentId, role: UserRole.STUDENT },
      select: { id: true },
    });

    if (student === null) {
      throw new ApplicationError(
        ErrorCode.NOT_FOUND,
        'Student was not found',
        404,
      );
    }

    const pageSize = parsePageSize(first);
    const afterId = decodeCursor(after);
    const attempts = await this.database.attempt.findMany({
      where: {
        ...(afterId === undefined ? {} : { id: { gt: afterId } }),
        status: AttemptStatus.SCORED,
        studentId,
      },
      include: {
        groupMembership: {
          select: { group: { select: { id: true, name: true } } },
        },
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
    const testIds = [
      ...new Set(page.map(({ testVersion }) => testVersion.test.id)),
    ];
    const scoreHistory =
      testIds.length === 0
        ? []
        : await this.database.attempt.findMany({
            where: {
              status: AttemptStatus.SCORED,
              studentId,
              testVersion: { testId: { in: testIds } },
            },
            select: {
              percentage: true,
              testVersion: { select: { testId: true } },
            },
          });
    const highestByTestId = new Map<string, number>();

    for (const historicalAttempt of scoreHistory) {
      if (historicalAttempt.percentage === null) {
        throw internalDataError('Scored attempt has no percentage');
      }

      const testId = historicalAttempt.testVersion.testId;
      const percentage = historicalAttempt.percentage.toNumber();
      const currentHighest = highestByTestId.get(testId);

      if (currentHighest === undefined || percentage > currentHighest) {
        highestByTestId.set(testId, percentage);
      }
    }

    const edges = page.map((attempt) => {
      const title = attempt.testVersion.translations[0]?.title;
      const score = requireCompleteScore(attempt);
      const testId = attempt.testVersion.test.id;

      if (title === undefined) {
        throw new ApplicationError(
          ErrorCode.TRANSLATION_NOT_AVAILABLE,
          'The requested result translation is not available',
          400,
        );
      }

      return {
        cursor: encodeCursor(attempt.id),
        node: {
          attemptId: attempt.id,
          attemptNumber: attempt.attemptNumber,
          correctAnswerCount: score.correctAnswerCount,
          groupId: attempt.groupMembership.group.id,
          groupName: attempt.groupMembership.group.name,
          highestPercentage: highestByTestId.get(testId) ?? score.percentage,
          passed: score.passed,
          percentage: score.percentage,
          submittedAt: score.submittedAt,
          testId,
          title,
          totalQuestionCount: score.totalQuestionCount,
        },
      };
    });

    return {
      edges,
      pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
    };
  }
}

function groupIds<T extends { readonly groupId: string }>(
  records: readonly T[],
): Map<string, T[]> {
  const recordsByGroupId = new Map<string, T[]>();

  for (const record of records) {
    const values = recordsByGroupId.get(record.groupId) ?? [];
    values.push(record);
    recordsByGroupId.set(record.groupId, values);
  }

  return recordsByGroupId;
}

function latestSubmittedAt(
  attempts: readonly { readonly submittedAt: Date | null }[],
): Date | null {
  let latest: Date | null = null;

  for (const attempt of attempts) {
    if (
      attempt.submittedAt !== null &&
      (latest === null || attempt.submittedAt > latest)
    ) {
      latest = attempt.submittedAt;
    }
  }

  return latest;
}

interface ScoredAttemptFields {
  readonly correctAnswerCount: number | null;
  readonly passed: boolean | null;
  readonly percentage: Prisma.Decimal | null;
  readonly submittedAt: Date | null;
  readonly totalQuestionCount: number | null;
}

function requireCompleteScore(attempt: ScoredAttemptFields) {
  if (
    attempt.correctAnswerCount === null ||
    attempt.passed === null ||
    attempt.percentage === null ||
    attempt.submittedAt === null ||
    attempt.totalQuestionCount === null
  ) {
    throw internalDataError('A scored attempt contains incomplete result data');
  }

  return {
    correctAnswerCount: attempt.correctAnswerCount,
    passed: attempt.passed,
    percentage: attempt.percentage.toNumber(),
    submittedAt: attempt.submittedAt,
    totalQuestionCount: attempt.totalQuestionCount,
  };
}

function internalDataError(message: string): ApplicationError {
  return new ApplicationError(ErrorCode.INTERNAL_SERVER_ERROR, message, 500);
}

function roundPercentage(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

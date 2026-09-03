import {
  AttemptStatus,
  ContentStatus,
  Language,
  Prisma,
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
} from '../../libs/pagination/cursor-pagination';
import type { StudentProgressObject } from '../../schemas/results/student-progress.object';
import type { StudentResultConnectionObject } from '../../schemas/results/student-result-connection.object';

import { calculateProgress } from './results-progress';

@Injectable()
export class ResultsService {
  constructor(private readonly database: DatabaseService) {}

  async getStudentProgress(studentId: string): Promise<StudentProgressObject> {
    const membership = await this.database.groupMembership.findFirst({
      where: { endedAt: null, studentId },
      select: {
        group: { select: { id: true, name: true } },
        id: true,
      },
    });

    if (membership === null) {
      return emptyStudentProgress();
    }

    const now = new Date();
    const assignedTests = await this.database.test.findMany({
      where: {
        groupId: membership.group.id,
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
    const assignedTestIds = assignedTests.map(({ id }) => id);

    if (assignedTestIds.length === 0) {
      return emptyStudentProgress(membership.group);
    }

    const attempts = await this.database.attempt.findMany({
      where: {
        groupMembershipId: membership.id,
        testVersion: { testId: { in: assignedTestIds } },
      },
      select: {
        passed: true,
        percentage: true,
        status: true,
        testVersion: { select: { testId: true } },
        updatedAt: true,
      },
    });
    const progress = calculateProgress(
      assignedTestIds.length,
      attempts.map((attempt) => ({
        assignmentKey: attempt.testVersion.testId,
        passed: attempt.passed,
        percentage: attempt.percentage,
        status: attempt.status,
        updatedAt: attempt.updatedAt,
      })),
    );

    return {
      assignedTestCount: progress.assignedCount,
      averagePercentage: progress.averagePercentage,
      awaitingScoreTestCount: progress.awaitingScoreCount,
      completedTestCount: progress.completedCount,
      completionPercentage: progress.completionPercentage,
      failedTestCount: progress.failedCount,
      groupId: membership.group.id,
      groupName: membership.group.name,
      highestPercentage: progress.highestPercentage,
      latestActivityAt: progress.latestActivityAt,
      passedTestCount: progress.passedCount,
      remainingTestCount: progress.remainingCount,
      scoredTestCount: progress.scoredCount,
    };
  }

  async getStudentResults(
    studentId: string,
    language: Language,
    first: number | undefined,
    after: string | undefined,
  ): Promise<StudentResultConnectionObject> {
    const pageSize = parsePageSize(first);
    const afterId = decodeCursor(after);
    const attempts = await this.database.attempt.findMany({
      where: {
        ...(afterId === undefined ? {} : { id: { gt: afterId } }),
        status: AttemptStatus.SCORED,
        studentId,
      },
      orderBy: { id: 'asc' },
      take: pageSize + 1,
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
        continue;
      }

      const testId = historicalAttempt.testVersion.testId;
      const percentage = historicalAttempt.percentage.toNumber();
      const currentHighest = highestByTestId.get(testId);

      if (currentHighest === undefined || percentage > currentHighest) {
        highestByTestId.set(testId, percentage);
      }
    }

    const edges = page.map((attempt) => {
      const testId = attempt.testVersion.test.id;
      const title = attempt.testVersion.translations[0]?.title;
      const score = requireCompleteScore(attempt);

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
      pageInfo: {
        endCursor: edges.at(-1)?.cursor ?? null,
        hasNextPage,
      },
    };
  }
}

function emptyStudentProgress(group?: {
  readonly id: string;
  readonly name: string;
}): StudentProgressObject {
  return {
    assignedTestCount: 0,
    averagePercentage: null,
    awaitingScoreTestCount: 0,
    completedTestCount: 0,
    completionPercentage: 0,
    failedTestCount: 0,
    groupId: group?.id ?? null,
    groupName: group?.name ?? null,
    highestPercentage: null,
    latestActivityAt: null,
    passedTestCount: 0,
    remainingTestCount: 0,
    scoredTestCount: 0,
  };
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
    throw new ApplicationError(
      ErrorCode.INTERNAL_SERVER_ERROR,
      'A scored attempt contains incomplete result data',
      500,
    );
  }

  return {
    correctAnswerCount: attempt.correctAnswerCount,
    passed: attempt.passed,
    percentage: attempt.percentage.toNumber(),
    submittedAt: attempt.submittedAt,
    totalQuestionCount: attempt.totalQuestionCount,
  };
}

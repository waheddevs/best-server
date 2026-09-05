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
import type { StudentTestConnectionObject } from '../../schemas/tests/student-test-connection.object';
import type { StudentTestObject } from '../../schemas/tests/student-test.object';
import type { AdminTestSummaryConnectionObject } from '../../schemas/tests/admin-test-summary.object';
import type { AdminTestSummaryObject } from '../../schemas/tests/admin-test-summary.object';

@Injectable()
export class TestsService {
  constructor(private readonly database: DatabaseService) {}

  async getAdminTest(
    testId: string,
    language: Language,
  ): Promise<AdminTestSummaryObject> {
    const id = parseUuid(testId, 'testId');
    const test = await this.database.test.findUnique({
      where: { id },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            teacher: { select: { displayName: true, id: true } },
          },
        },
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          include: {
            _count: { select: { questions: true } },
            attempts: { select: { status: true } },
            translations: { where: { language }, select: { title: true } },
          },
        },
      },
    });

    if (test === null) {
      throw new ApplicationError(
        ErrorCode.NOT_FOUND,
        'The requested test was not found',
        404,
      );
    }

    const version = test.versions[0];
    return {
      attemptCount: version?.attempts.length ?? 0,
      awaitingReviewCount:
        version?.attempts.filter(
          ({ status }) => status === AttemptStatus.SUBMITTED,
        ).length ?? 0,
      groupId: test.group.id,
      groupName: test.group.name,
      id: test.id,
      language,
      latestVersionNumber: version?.version ?? null,
      latestVersionStatus: version?.status ?? null,
      questionCount: version?._count.questions ?? 0,
      status: test.status,
      teacherDisplayName: test.group.teacher.displayName,
      teacherId: test.group.teacher.id,
      title: version?.translations[0]?.title ?? test.id,
    };
  }

  async getAdminTests(
    language: Language,
    first: number | undefined,
    after: string | undefined,
  ): Promise<AdminTestSummaryConnectionObject> {
    const pageSize = parsePageSize(first);
    const afterId = decodeCursor(after);
    const tests = await this.database.test.findMany({
      where: afterId === undefined ? {} : { id: { gt: afterId } },
      orderBy: { id: 'asc' },
      take: pageSize + 1,
      include: {
        group: {
          select: {
            id: true,
            name: true,
            teacher: { select: { displayName: true, id: true } },
          },
        },
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          include: {
            _count: { select: { questions: true } },
            attempts: { select: { status: true } },
            translations: { where: { language }, select: { title: true } },
          },
        },
      },
    });
    const hasNextPage = tests.length > pageSize;
    const page = hasNextPage ? tests.slice(0, pageSize) : tests;
    const edges = page.map((test) => {
      const version = test.versions[0];
      return {
        cursor: encodeCursor(test.id),
        node: {
          attemptCount: version?.attempts.length ?? 0,
          awaitingReviewCount:
            version?.attempts.filter(
              ({ status }) => status === AttemptStatus.SUBMITTED,
            ).length ?? 0,
          groupId: test.group.id,
          groupName: test.group.name,
          id: test.id,
          language,
          latestVersionNumber: version?.version ?? null,
          latestVersionStatus: version?.status ?? null,
          questionCount: version?._count.questions ?? 0,
          status: test.status,
          teacherDisplayName: test.group.teacher.displayName,
          teacherId: test.group.teacher.id,
          title: version?.translations[0]?.title ?? test.id,
        },
      };
    });
    return {
      edges,
      pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
    };
  }

  async getAvailableTests(
    studentId: string,
    language: Language,
    first: number | undefined,
    after: string | undefined,
  ): Promise<StudentTestConnectionObject> {
    const pageSize = parsePageSize(first);
    const afterId = decodeCursor(after);
    const membership = await this.database.groupMembership.findFirst({
      where: { endedAt: null, studentId },
      select: { groupId: true },
    });

    if (membership === null) {
      return emptyConnection();
    }

    const now = new Date();
    const tests = await this.database.test.findMany({
      where: {
        groupId: membership.groupId,
        ...(afterId === undefined ? {} : { id: { gt: afterId } }),
        status: ContentStatus.ACTIVE,
        versions: { some: availableVersionWhere(now) },
      },
      orderBy: { id: 'asc' },
      take: pageSize + 1,
      include: {
        category: { select: { name: true } },
        versions: {
          where: availableVersionWhere(now),
          orderBy: { version: 'desc' },
          take: 1,
          include: {
            attempts: {
              where: { studentId },
              select: { id: true, status: true },
            },
            translations: {
              where: { language },
              select: { description: true, title: true },
            },
          },
        },
      },
    });
    const hasNextPage = tests.length > pageSize;
    const page = hasNextPage ? tests.slice(0, pageSize) : tests;
    const edges = page.map((test) => ({
      cursor: encodeCursor(test.id),
      node: mapStudentTest(test, language),
    }));

    return {
      edges,
      pageInfo: {
        endCursor: edges.at(-1)?.cursor ?? null,
        hasNextPage,
      },
    };
  }

  async getStudentTest(
    studentId: string,
    testIdInput: string,
    language: Language,
  ): Promise<StudentTestObject> {
    const testId = parseUuid(testIdInput, 'testId');
    const now = new Date();
    const test = await this.database.test.findFirst({
      where: {
        id: testId,
        status: ContentStatus.ACTIVE,
        group: {
          memberships: { some: { endedAt: null, studentId } },
        },
      },
      include: {
        category: { select: { name: true } },
        versions: {
          where: availableVersionWhere(now),
          orderBy: { version: 'desc' },
          take: 1,
          include: {
            attempts: {
              where: { studentId },
              select: { id: true, status: true },
            },
            translations: {
              where: { language },
              select: { description: true, title: true },
            },
          },
        },
      },
    });

    if (test === null || test.versions.length === 0) {
      throw new ApplicationError(
        ErrorCode.NOT_FOUND,
        'The requested test is not available',
        404,
      );
    }

    return mapStudentTest(test, language);
  }
}

function availableVersionWhere(now: Date) {
  return {
    AND: [
      {
        OR: [
          { availabilityStartsAt: null },
          { availabilityStartsAt: { lte: now } },
        ],
      },
      {
        OR: [{ availabilityEndsAt: null }, { availabilityEndsAt: { gt: now } }],
      },
    ],
    status: TestVersionStatus.PUBLISHED,
  };
}

interface StudentTestRecord {
  readonly category: { readonly name: string };
  readonly id: string;
  readonly versions: readonly {
    readonly attempts: readonly {
      readonly id: string;
      readonly status: AttemptStatus;
    }[];
    readonly attemptLimit: number;
    readonly availabilityEndsAt: Date | null;
    readonly availabilityStartsAt: Date | null;
    readonly durationMinutes: number | null;
    readonly id: string;
    readonly translations: readonly {
      readonly description: string | null;
      readonly title: string;
    }[];
  }[];
}

function mapStudentTest(
  test: StudentTestRecord,
  language: Language,
): StudentTestObject {
  const version = test.versions[0];

  if (version === undefined) {
    throw new ApplicationError(
      ErrorCode.TEST_NOT_AVAILABLE,
      'The requested test is not available',
      409,
    );
  }

  const translation = version.translations[0];

  if (translation === undefined) {
    throw new ApplicationError(
      ErrorCode.TRANSLATION_NOT_AVAILABLE,
      'The requested test translation is not available',
      400,
    );
  }

  return {
    activeAttemptId:
      version.attempts.find(
        ({ status }) => status === AttemptStatus.IN_PROGRESS,
      )?.id ?? null,
    attemptLimit: version.attemptLimit,
    attemptsUsed: version.attempts.length,
    availabilityEndsAt: version.availabilityEndsAt,
    availabilityStartsAt: version.availabilityStartsAt,
    categoryName: test.category.name,
    description: translation.description,
    durationMinutes: version.durationMinutes,
    id: test.id,
    language,
    testVersionId: version.id,
    title: translation.title,
  };
}

function emptyConnection(): StudentTestConnectionObject {
  return {
    edges: [],
    pageInfo: { endCursor: null, hasNextPage: false },
  };
}

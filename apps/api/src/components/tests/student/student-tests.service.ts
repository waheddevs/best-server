import {
  AttemptStatus,
  ContentStatus,
  IeltsModule,
  Language,
  TestSkill,
  TestVersionStatus,
} from '@best/database';
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import { ErrorCode } from '../../../libs/enums/error-code.enum';
import { ApplicationError } from '../../../libs/errors/application.error';
import {
  decodeCursor,
  encodeCursor,
  parsePageSize,
  parseUuid,
} from '../../../libs/pagination/cursor-pagination';
import type {
  StudentTestConnectionObject,
  StudentTestObject,
} from '../../../schemas/tests/student/student-test.object';

import type {
  StudentTestPaperConnectionObject,
  StudentTestPaperObject,
} from '../../../schemas/tests/student/student-test-paper.object';

@Injectable()
export class StudentTestsService {
  constructor(private readonly database: DatabaseService) {}

  async getStudentTestPapers(
    studentId: string,
    first: number | undefined,
    after: string | undefined,
  ): Promise<StudentTestPaperConnectionObject> {
    const pageSize = parsePageSize(first);
    const afterId = decodeCursor(after);
    const now = new Date();
    const papers = await this.database.testPaper.findMany({
      where: {
        ...(afterId === undefined ? {} : { id: { gt: afterId } }),
        group: { memberships: { some: { endedAt: null, studentId } } },
        ieltsModule: IeltsModule.ACADEMIC,
        status: ContentStatus.ACTIVE,
        tests: {
          some: {
            status: ContentStatus.ACTIVE,
            versions: { some: availableVersionWhere(now) },
          },
        },
      },
      orderBy: { id: 'asc' },
      take: pageSize + 1,
      include: {
        bookmarks: { where: { userId: studentId }, select: { id: true } },
        tests: paperSkillInclude(studentId, now),
      },
    });
    const hasNextPage = papers.length > pageSize;
    const page = hasNextPage ? papers.slice(0, pageSize) : papers;
    const edges = page.map((paper) => ({
      cursor: encodeCursor(paper.id),
      node: mapStudentTestPaper(paper),
    }));

    return {
      edges,
      pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
    };
  }

  async getStudentTestPaper(
    studentId: string,
    paperIdInput: string,
  ): Promise<StudentTestPaperObject> {
    const id = parseUuid(paperIdInput, 'paperId');
    const now = new Date();
    const paper = await this.database.testPaper.findFirst({
      where: {
        id,
        group: { memberships: { some: { endedAt: null, studentId } } },
        ieltsModule: IeltsModule.ACADEMIC,
        status: ContentStatus.ACTIVE,
      },
      include: {
        bookmarks: { where: { userId: studentId }, select: { id: true } },
        tests: paperSkillInclude(studentId, now),
      },
    });

    if (paper === null || paper.tests.length === 0) {
      throw new ApplicationError(
        ErrorCode.NOT_FOUND,
        'The requested test paper is not available',
        404,
      );
    }

    return mapStudentTestPaper(paper);
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
        OR: [
          { paperId: null },
          {
            paper: {
              ieltsModule: IeltsModule.ACADEMIC,
              status: ContentStatus.ACTIVE,
            },
          },
        ],
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
        OR: [
          { paperId: null },
          {
            paper: {
              ieltsModule: IeltsModule.ACADEMIC,
              status: ContentStatus.ACTIVE,
            },
          },
        ],
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

function paperSkillInclude(studentId: string, now: Date) {
  return {
    where: { status: ContentStatus.ACTIVE, skill: { not: null } },
    orderBy: { skill: 'asc' as const },
    include: {
      versions: {
        where: availableVersionWhere(now),
        orderBy: { version: 'desc' as const },
        take: 1,
        include: {
          _count: { select: { questions: true } },
          attempts: {
            where: { studentId },
            orderBy: { attemptNumber: 'desc' as const },
            take: 1,
            select: { id: true, status: true },
          },
          translations: {
            where: { language: Language.EN },
            select: { description: true, title: true },
          },
        },
      },
    },
  };
}

interface StudentTestPaperRecord {
  readonly academicYear: number;
  readonly id: string;
  readonly ieltsModule: IeltsModule;
  readonly slug: string;
  readonly sourceLabel: string;
  readonly title: string;
  readonly bookmarks: readonly { readonly id: string }[];
  readonly tests: readonly {
    readonly id: string;
    readonly skill: TestSkill | null;
    readonly versions: readonly {
      readonly _count: { readonly questions: number };
      readonly attempts: readonly {
        readonly id: string;
        readonly status: AttemptStatus;
      }[];
      readonly durationMinutes: number | null;
      readonly id: string;
      readonly translations: readonly {
        readonly description: string | null;
        readonly title: string;
      }[];
    }[];
  }[];
}

function mapStudentTestPaper(
  paper: StudentTestPaperRecord,
): StudentTestPaperObject {
  const skills = paper.tests.flatMap((test) => {
    const version = test.versions[0];
    const translation = version?.translations[0];
    if (
      test.skill === null ||
      version === undefined ||
      translation === undefined
    ) {
      return [];
    }
    const attempt = version.attempts[0];
    return [
      {
        attemptId: attempt?.id ?? null,
        attemptStatus: attempt?.status ?? null,
        description: translation.description,
        durationMinutes: version.durationMinutes,
        questionCount: version._count.questions,
        skill: test.skill,
        testId: test.id,
        testVersionId: version.id,
        title: translation.title,
      },
    ];
  });

  return {
    academicYear: paper.academicYear,
    id: paper.id,
    ieltsModule: paper.ieltsModule,
    isSaved: paper.bookmarks.length > 0,
    skills,
    slug: paper.slug,
    sourceLabel: paper.sourceLabel,
    title: paper.title,
  };
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

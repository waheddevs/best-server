import { randomUUID } from 'node:crypto';

import {
  AttemptStatus,
  ContentStatus,
  GroupCategory,
  GroupMembershipStatus,
  IeltsModule,
  Language,
  Prisma,
  TestSkill,
  TestVersionStatus,
  UserRole,
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
import type { StudentTestPaperConnectionObject } from '../../schemas/tests/student-test-paper-connection.object';
import type { StudentTestPaperObject } from '../../schemas/tests/student-test-paper.object';
import type { TeacherTestPaperPageObject } from '../../schemas/tests/teacher-test-paper-page.object';
import type { TeacherTestPaperDeletionPayloadObject } from '../../schemas/tests/teacher-test-paper-deletion-payload.object';
import type { TeacherTestPaperObject } from '../../schemas/tests/teacher-test-paper.object';
import type { PracticeBookmarkPayloadObject } from '../../schemas/tests/practice-bookmark-payload.object';
import type { SetPracticeBookmarkInput } from '../../schemas/tests/set-practice-bookmark.input';
import type { AdminTestSummaryConnectionObject } from '../../schemas/tests/admin-test-summary.object';
import type { AdminTestSummaryObject } from '../../schemas/tests/admin-test-summary.object';

const TEACHER_PRACTICE_PAGE_SIZE = 16;

@Injectable()
export class TestsService {
  constructor(private readonly database: DatabaseService) {}

  async createTeacherPracticeTest(
    teacherId: string,
    groupIdInput: string,
    correlationId?: string,
  ): Promise<TeacherTestPaperObject> {
    const groupId = parseUuid(groupIdInput, 'groupId');
    return this.database.$transaction(
      async (transaction) => {
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`teacher-practice:${groupId}`}, 0))`;
        const group = await transaction.group.findFirst({
          where: {
            category: GroupCategory.IELTS,
            id: groupId,
            status: ContentStatus.ACTIVE,
            teacherId,
          },
          select: { id: true },
        });
        if (group === null) {
          throw new ApplicationError(
            ErrorCode.NOT_FOUND,
            'The requested group was not found',
            404,
          );
        }
        const maximum = await transaction.testPaper.aggregate({
          where: { groupId },
          _max: { practiceNumber: true },
        });
        const practiceNumber = (maximum._max.practiceNumber ?? 0) + 1;
        const id = randomUUID();
        const paper = await transaction.testPaper.create({
          data: {
            academicYear: new Date().getUTCFullYear(),
            createdById: teacherId,
            groupId,
            id,
            ieltsModule: IeltsModule.ACADEMIC,
            practiceNumber,
            slug: `practice-test-${String(practiceNumber)}-${id.slice(0, 8)}`,
            sourceLabel: 'Teacher-created IELTS Academic practice test.',
            title: `Practice test ${String(practiceNumber)}`,
          },
        });
        await transaction.auditLog.create({
          data: {
            action: 'TEACHER_PRACTICE_TEST_CREATED',
            actorId: teacherId,
            correlationId: correlationId ?? null,
            newValues: {
              groupId,
              ieltsModule: IeltsModule.ACADEMIC,
              practiceNumber,
              title: paper.title,
            },
            targetId: paper.id,
            targetType: 'TEST_PAPER',
          },
        });
        return {
          academicYear: paper.academicYear,
          completedStudentCount: 0,
          createdAt: paper.createdAt,
          id: paper.id,
          ieltsModule: paper.ieltsModule,
          isSaved: false,
          practiceNumber: paper.practiceNumber,
          skills: [],
          slug: paper.slug,
          sourceLabel: paper.sourceLabel,
          title: paper.title,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async deleteTeacherPracticeTest(
    teacherId: string,
    testPaperIdInput: string,
    correlationId?: string,
  ): Promise<TeacherTestPaperDeletionPayloadObject> {
    const testPaperId = parseUuid(testPaperIdInput, 'testPaperId');
    return this.database.$transaction(
      async (transaction) => {
        const paper = await transaction.testPaper.findFirst({
          where: {
            id: testPaperId,
            ieltsModule: IeltsModule.ACADEMIC,
            status: ContentStatus.ACTIVE,
            group: { status: ContentStatus.ACTIVE, teacherId },
          },
          select: { groupId: true, id: true, practiceNumber: true },
        });
        if (paper === null) {
          throw new ApplicationError(
            ErrorCode.NOT_FOUND,
            'The requested test paper was not found',
            404,
          );
        }

        const deletedAt = new Date();
        const deletedSkills = await transaction.test.updateMany({
          where: { paperId: paper.id, status: { not: ContentStatus.DELETED } },
          data: { archivedAt: deletedAt, status: ContentStatus.DELETED },
        });
        await transaction.testPaper.update({
          where: { id: paper.id },
          data: { archivedAt: deletedAt, status: ContentStatus.DELETED },
        });
        await transaction.auditLog.create({
          data: {
            action: 'TEACHER_PRACTICE_TEST_DELETED',
            actorId: teacherId,
            correlationId: correlationId ?? null,
            newValues: {
              deletedSkillCount: deletedSkills.count,
              groupId: paper.groupId,
              practiceNumber: paper.practiceNumber,
              status: ContentStatus.DELETED,
            },
            targetId: paper.id,
            targetType: 'TEST_PAPER',
          },
        });

        return {
          deletedSkillCount: deletedSkills.count,
          status: ContentStatus.DELETED,
          testPaperId: paper.id,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async setPracticeBookmark(
    userId: string,
    role: UserRole,
    input: SetPracticeBookmarkInput,
  ): Promise<PracticeBookmarkPayloadObject> {
    const testPaperId = parseUuid(input.testPaperId, 'testPaperId');
    const paper = await this.database.testPaper.findFirst({
      where: {
        id: testPaperId,
        status: ContentStatus.ACTIVE,
        group:
          role === UserRole.TEACHER
            ? { teacherId: userId }
            : { memberships: { some: { endedAt: null, studentId: userId } } },
      },
      select: { id: true },
    });
    if (paper === null) {
      throw new ApplicationError(
        ErrorCode.NOT_FOUND,
        'The requested test paper was not found',
        404,
      );
    }
    if (input.saved) {
      await this.database.practiceBookmark.upsert({
        where: { userId_testPaperId: { testPaperId, userId } },
        create: { testPaperId, userId },
        update: {},
      });
    } else {
      await this.database.practiceBookmark.deleteMany({
        where: { testPaperId, userId },
      });
    }
    return { saved: input.saved, testPaperId };
  }

  async getTeacherTestPapers(
    teacherId: string,
    groupIdInput: string,
    page: number,
  ): Promise<TeacherTestPaperPageObject> {
    const groupId = parseUuid(groupIdInput, 'groupId');
    if (!Number.isInteger(page) || page < 1) {
      throw new ApplicationError(
        ErrorCode.BAD_USER_INPUT,
        'page must be a positive integer',
        400,
      );
    }
    const group = await this.database.group.findFirst({
      where: { id: groupId, status: ContentStatus.ACTIVE, teacherId },
      select: { id: true },
    });
    if (group === null) {
      throw new ApplicationError(
        ErrorCode.NOT_FOUND,
        'The requested group was not found',
        404,
      );
    }

    const { completionCounts, papers, totalItems } =
      await this.database.$transaction(
        async (transaction) => {
          const where = {
            groupId,
            ieltsModule: IeltsModule.ACADEMIC,
            status: ContentStatus.ACTIVE,
          } as const;
          const totalItems = await transaction.testPaper.count({ where });
          const papers = await transaction.testPaper.findMany({
            where,
            orderBy: [{ practiceNumber: 'asc' }, { id: 'asc' }],
            skip: (page - 1) * TEACHER_PRACTICE_PAGE_SIZE,
            take: TEACHER_PRACTICE_PAGE_SIZE,
            include: teacherPaperInclude(teacherId),
          });
          const completionCounts = await teacherPaperCompletionCounts(
            transaction,
            papers.map(({ id }) => id),
          );
          return { completionCounts, papers, totalItems };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );
    const totalPages = Math.ceil(totalItems / TEACHER_PRACTICE_PAGE_SIZE);

    return {
      items: papers.map((paper) =>
        mapTeacherTestPaper(paper, completionCounts.get(paper.id) ?? 0),
      ),
      pageInfo: {
        currentPage: page,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1 && totalPages > 0,
        pageSize: TEACHER_PRACTICE_PAGE_SIZE,
        totalItems,
        totalPages,
      },
    };
  }

  async getTeacherTestPaper(
    teacherId: string,
    groupIdInput: string,
    practiceNumber: number,
  ): Promise<TeacherTestPaperObject> {
    const groupId = parseUuid(groupIdInput, 'groupId');
    if (!Number.isInteger(practiceNumber) || practiceNumber < 1) {
      throw new ApplicationError(
        ErrorCode.BAD_USER_INPUT,
        'practiceNumber must be a positive integer',
        400,
      );
    }
    const paper = await this.database.testPaper.findFirst({
      where: {
        groupId,
        ieltsModule: IeltsModule.ACADEMIC,
        practiceNumber,
        status: ContentStatus.ACTIVE,
        group: { status: ContentStatus.ACTIVE, teacherId },
      },
      include: teacherPaperInclude(teacherId),
    });
    if (paper === null) {
      throw new ApplicationError(
        ErrorCode.NOT_FOUND,
        'The requested test paper was not found',
        404,
      );
    }
    const completionCounts = await teacherPaperCompletionCounts(this.database, [
      paper.id,
    ]);
    return mapTeacherTestPaper(paper, completionCounts.get(paper.id) ?? 0);
  }

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
          ({ status }) =>
            status === AttemptStatus.SUBMITTED ||
            status === AttemptStatus.REVIEW_REQUIRED,
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
              ({ status }) =>
                status === AttemptStatus.SUBMITTED ||
                status === AttemptStatus.REVIEW_REQUIRED,
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

function teacherPaperInclude(userId: string) {
  return {
    bookmarks: { where: { userId }, select: { id: true } },
    tests: {
      where: { skill: { not: null }, status: ContentStatus.ACTIVE },
      orderBy: { skill: 'asc' as const },
      include: {
        versions: {
          orderBy: { version: 'desc' as const },
          take: 1,
          include: {
            _count: { select: { questions: true } },
            translations: {
              where: { language: Language.EN },
              select: { description: true, title: true },
            },
          },
        },
      },
    },
  } satisfies Prisma.TestPaperInclude;
}

type TeacherTestPaperRecord = Prisma.TestPaperGetPayload<{
  include: ReturnType<typeof teacherPaperInclude>;
}>;

function mapTeacherTestPaper(
  paper: TeacherTestPaperRecord,
  completedStudentCount: number,
): TeacherTestPaperObject {
  return {
    academicYear: paper.academicYear,
    completedStudentCount,
    createdAt: paper.createdAt,
    id: paper.id,
    ieltsModule: paper.ieltsModule,
    isSaved: paper.bookmarks.length > 0,
    practiceNumber: paper.practiceNumber,
    skills: paper.tests.flatMap((test) => {
      const version = test.versions[0];
      const translation = version?.translations[0];
      if (
        test.skill === null ||
        version === undefined ||
        translation === undefined
      ) {
        return [];
      }
      return [
        {
          description: translation.description,
          durationMinutes: version.durationMinutes,
          questionCount: version._count.questions,
          skill: test.skill,
          status: version.status,
          testId: test.id,
          testVersionId: version.id,
          title: translation.title,
        },
      ];
    }),
    slug: paper.slug,
    sourceLabel: paper.sourceLabel,
    title: paper.title,
  };
}

async function teacherPaperCompletionCounts(
  database: Pick<Prisma.TransactionClient, 'test'>,
  paperIds: readonly string[],
): Promise<ReadonlyMap<string, number>> {
  if (paperIds.length === 0) return new Map();

  const tests = await database.test.findMany({
    where: {
      paperId: { in: [...paperIds] },
      skill: { not: null },
      status: ContentStatus.ACTIVE,
      versions: { some: { status: TestVersionStatus.PUBLISHED } },
    },
    select: {
      id: true,
      paperId: true,
      versions: {
        where: { status: TestVersionStatus.PUBLISHED },
        orderBy: { version: 'desc' },
        take: 1,
        select: {
          attempts: {
            where: {
              groupMembership: {
                endedAt: null,
                participationStatus: GroupMembershipStatus.ACTIVE,
              },
              status: {
                in: [
                  AttemptStatus.SUBMITTED,
                  AttemptStatus.REVIEW_REQUIRED,
                  AttemptStatus.SCORED,
                ],
              },
            },
            select: { studentId: true },
          },
        },
      },
    },
  });

  const testsByPaper = new Map<string, typeof tests>();
  for (const test of tests) {
    if (test.paperId === null || test.versions.length === 0) continue;
    const paperTests = testsByPaper.get(test.paperId) ?? [];
    paperTests.push(test);
    testsByPaper.set(test.paperId, paperTests);
  }

  const counts = new Map<string, number>();
  for (const paperId of paperIds) {
    const paperTests = testsByPaper.get(paperId) ?? [];
    if (paperTests.length === 0) {
      counts.set(paperId, 0);
      continue;
    }

    const completedTestsByStudent = new Map<string, Set<string>>();
    for (const test of paperTests) {
      const studentIds = new Set(
        test.versions[0]?.attempts.map(({ studentId }) => studentId),
      );
      for (const studentId of studentIds) {
        const completedTests =
          completedTestsByStudent.get(studentId) ?? new Set<string>();
        completedTests.add(test.id);
        completedTestsByStudent.set(studentId, completedTests);
      }
    }
    counts.set(
      paperId,
      [...completedTestsByStudent.values()].filter(
        (completedTests) => completedTests.size === paperTests.length,
      ).length,
    );
  }
  return counts;
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

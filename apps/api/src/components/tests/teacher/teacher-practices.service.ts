import { randomUUID } from 'node:crypto';

import {
  ContentStatus,
  GroupCategory,
  IeltsModule,
  Language,
  Prisma,
} from '@best/database';
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import { ErrorCode } from '../../../libs/enums/error-code.enum';
import { ApplicationError } from '../../../libs/errors/application.error';
import { parseUuid } from '../../../libs/pagination/cursor-pagination';
import type {
  TeacherTestPaperPageObject,
  TeacherTestPaperDeletionPayloadObject,
  TeacherTestPaperObject,
} from '../../../schemas/tests/authoring/teacher-test-paper.object';

const TEACHER_PRACTICE_PAGE_SIZE = 16;

@Injectable()
export class TeacherPracticesService {
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
  database: Pick<Prisma.TransactionClient, '$queryRaw'>,
  paperIds: readonly string[],
): Promise<ReadonlyMap<string, number>> {
  if (paperIds.length === 0) return new Map();
  const rows = await database.$queryRaw<
    { paperId: string; completedStudentCount: number }[]
  >(Prisma.sql`
    WITH current_skills AS (
      SELECT t.paper_id, t.id AS test_id, v.id AS version_id
      FROM tests t
      JOIN LATERAL (
        SELECT id FROM test_versions
        WHERE test_id = t.id AND status = 'PUBLISHED'
        ORDER BY version DESC LIMIT 1
      ) v ON true
      WHERE t.paper_id IN (${Prisma.join(paperIds.map((id) => Prisma.sql`${id}::uuid`))})
        AND t.status = 'ACTIVE' AND t.skill IS NOT NULL
    ), required_skills AS (
      SELECT paper_id, count(*)::int AS skill_count
      FROM current_skills GROUP BY paper_id
    ), student_completions AS (
      SELECT s.paper_id, a.student_id, count(DISTINCT s.test_id)::int AS skill_count
      FROM current_skills s
      JOIN attempts a ON a.test_version_id = s.version_id
      JOIN group_memberships m ON m.id = a.group_membership_id
      WHERE a.status IN ('SUBMITTED', 'REVIEW_REQUIRED', 'SCORED')
        AND m.ended_at IS NULL AND m.participation_status = 'ACTIVE'
      GROUP BY s.paper_id, a.student_id
    )
    SELECT r.paper_id AS "paperId", count(c.student_id)::int AS "completedStudentCount"
    FROM required_skills r
    LEFT JOIN student_completions c ON c.paper_id = r.paper_id AND c.skill_count = r.skill_count
    GROUP BY r.paper_id
  `);
  return new Map(rows.map((row) => [row.paperId, row.completedStudentCount]));
}

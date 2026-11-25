import {
  ContentStatus,
  MediaMalwareStatus,
  MediaObjectStatus,
  Prisma,
  TestVersionStatus,
} from '@best/database';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { ErrorCode } from '../../../libs/enums/error-code.enum';
import { ApplicationError } from '../../../libs/errors/application.error';
import { parseUuid } from '../../../libs/pagination/cursor-pagination';
import { versionInclude, type VersionRecord } from './test-version-record';
import { validationError, notFound } from './test-authoring-errors';

@Injectable()
export class TestDraftAccessService {
  constructor(private readonly database: DatabaseService) {}
  async requireReadyTeacherMedia(
    teacherId: string,
    mediaObjectId: string,
    database: Prisma.TransactionClient = this.database,
  ): Promise<void> {
    const media = await database.mediaObject.findFirst({
      where: {
        createdById: teacherId,
        id: mediaObjectId,
        malwareStatus: MediaMalwareStatus.CLEAN,
        status: MediaObjectStatus.READY,
      },
      select: { id: true },
    });
    if (media === null) throw notFound();
  }

  async requireSectionBlockQuestions(
    testSectionId: string,
    questionIds: string[],
    currentBlockId?: string,
    database: Prisma.TransactionClient = this.database,
  ): Promise<string[]> {
    const uniqueIds = new Set(questionIds);
    if (uniqueIds.size !== questionIds.length)
      throw validationError('questionIds must be unique');
    const questions = await database.question.findMany({
      where: { id: { in: questionIds }, sectionId: testSectionId },
      select: {
        id: true,
        sectionBlocks: {
          ...(currentBlockId === undefined
            ? {}
            : { where: { testSectionBlockId: { not: currentBlockId } } }),
          select: { testSectionBlockId: true },
        },
      },
    });
    if (
      questions.length !== questionIds.length ||
      questions.some(({ sectionBlocks }) => sectionBlocks.length > 0)
    )
      throw validationError(
        'Question groups may contain only unassigned questions from the same section',
      );
    return questionIds;
  }

  async requireVersionSection(
    testVersionId: string,
    testSectionId: string | null,
    database: Prisma.TransactionClient = this.database,
  ): Promise<void> {
    if (testSectionId === null) return;
    const count = await database.testSection.count({
      where: { id: testSectionId, testVersionId },
    });
    if (count !== 1) throw notFound();
  }

  async requireOwnedVersion(
    teacherId: string,
    versionIdInput: string,
    database: Prisma.TransactionClient = this.database,
  ): Promise<VersionRecord> {
    const id = parseUuid(versionIdInput, 'testVersionId');
    const version = await database.testVersion.findFirst({
      where: { id, test: { group: { teacherId } } },
      include: versionInclude,
    });
    if (version === null) throw notFound();
    return version;
  }

  async requireDraft(
    teacherId: string,
    versionIdInput: string,
    database: Prisma.TransactionClient = this.database,
  ): Promise<VersionRecord> {
    const version = await this.requireOwnedVersion(
      teacherId,
      versionIdInput,
      database,
    );
    if (version.status !== TestVersionStatus.DRAFT)
      throw new ApplicationError(
        ErrorCode.CONFLICT,
        'Published test versions are immutable',
        409,
      );
    const activeTest = await database.test.count({
      where: { id: version.testId, status: ContentStatus.ACTIVE },
    });
    if (activeTest !== 1)
      throw new ApplicationError(
        ErrorCode.CONFLICT,
        'Archived tests cannot be edited or published',
        409,
      );
    return version;
  }

  async withDraft<T>(
    teacherId: string,
    reference: Prisma.TestVersionWhereInput,
    expectedUpdatedAt: Date,
    work: (
      transaction: Prisma.TransactionClient,
      version: VersionRecord,
    ) => Promise<T>,
  ): Promise<T> {
    return this.database.$transaction(
      async (transaction) => {
        const referenceVersion = await transaction.testVersion.findFirst({
          where: { AND: [reference, { test: { group: { teacherId } } }] },
          select: { id: true },
        });
        if (referenceVersion === null) throw notFound();
        const locked = await transaction.$queryRaw<{ id: string }[]>`
        SELECT t.id FROM tests t
        JOIN test_versions v ON v.test_id = t.id
        JOIN groups g ON g.id = t.group_id
        WHERE v.id = ${referenceVersion.id}::uuid AND g.teacher_id = ${teacherId}::uuid
        FOR UPDATE OF t
      `;
        if (locked.length !== 1) throw notFound();
        const version = await this.requireDraft(
          teacherId,
          referenceVersion.id,
          transaction,
        );
        if (
          !(expectedUpdatedAt instanceof Date) ||
          expectedUpdatedAt.getTime() !== version.updatedAt.getTime()
        ) {
          throw new ApplicationError(
            ErrorCode.CONFLICT,
            'The test draft changed in another session. Reload before saving.',
            409,
          );
        }
        const updatedAt = new Date(
          Math.max(Date.now(), version.updatedAt.getTime() + 1),
        );
        await transaction.testVersion.update({
          where: { id: version.id },
          data: { updatedAt },
        });
        return work(transaction, { ...version, updatedAt });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }
}

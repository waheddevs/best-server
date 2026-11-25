import { MediaVisibility, Prisma, TestVersionStatus } from '@best/database';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ErrorCode } from '../../libs/enums/error-code.enum';
import { ApplicationError } from '../../libs/errors/application.error';
import { parseUuid } from '../../libs/pagination/cursor-pagination';
import type {
  CreateTestSectionBlockInput,
  CreateTestSectionInput,
  UpdateTestSectionBlockInput,
  UpdateTestSectionInput,
} from '../../schemas/tests/teacher-test.input';
import type { TeacherTestVersionObject } from '../../schemas/tests/teacher-test.object';
import { TestDraftAccessService } from './test-draft-access.service';
import { versionInclude } from './test-version-record';
import {
  parseSection,
  requireCompleteOrderedIds,
  parseSectionBlock,
} from './test-draft-parsing';
import { mapVersion } from './test-version-mapping';
import { writeAudit } from './test-authoring-audit';
import { notFound } from './test-authoring-errors';

@Injectable()
export class TestSectionsService {
  constructor(
    private readonly testDraftAccessService: TestDraftAccessService,
    private readonly database: DatabaseService,
  ) {}
  async createSection(
    teacherId: string,
    input: CreateTestSectionInput,
    correlationId?: string,
  ): Promise<TeacherTestVersionObject> {
    const version = await this.testDraftAccessService.requireDraft(
      teacherId,
      input.testVersionId,
    );
    const values = parseSection(input, version.primaryLanguage);
    if (values.mediaObjectId !== null)
      await this.testDraftAccessService.requireReadyTeacherMedia(
        teacherId,
        values.mediaObjectId,
      );
    const updated = await this.database.$transaction(async (tx) => {
      const position =
        (await tx.testSection.count({ where: { testVersionId: version.id } })) +
        1;
      const section = await tx.testSection.create({
        data: {
          ...values.metadata,
          mediaObjectId: values.mediaObjectId,
          position,
          testVersionId: version.id,
          translations: { createMany: { data: values.translations } },
        },
      });
      if (values.mediaObjectId !== null) {
        await tx.mediaObject.update({
          where: { id: values.mediaObjectId },
          data: { visibility: MediaVisibility.DOMAIN_AUTHORIZED },
        });
      }
      await writeAudit(
        tx,
        teacherId,
        'TEST_SECTION_CREATED',
        'TEST_SECTION',
        section.id,
        correlationId,
        { testVersionId: version.id },
      );
      return tx.testVersion.findUniqueOrThrow({
        where: { id: version.id },
        include: versionInclude,
      });
    });
    return mapVersion(updated);
  }

  async updateSection(
    teacherId: string,
    input: UpdateTestSectionInput,
    correlationId?: string,
  ): Promise<TeacherTestVersionObject> {
    const testSectionId = parseUuid(input.testSectionId, 'testSectionId');
    const existing = await this.database.testSection.findFirst({
      where: {
        id: testSectionId,
        testVersion: {
          status: TestVersionStatus.DRAFT,
          test: { group: { teacherId } },
        },
      },
      select: {
        testVersion: { select: { id: true, primaryLanguage: true } },
      },
    });
    if (existing === null) throw notFound();
    const values = parseSection(input, existing.testVersion.primaryLanguage);
    if (values.mediaObjectId !== null)
      await this.testDraftAccessService.requireReadyTeacherMedia(
        teacherId,
        values.mediaObjectId,
      );
    const updated = await this.database.$transaction(async (tx) => {
      await tx.testSectionTranslation.deleteMany({ where: { testSectionId } });
      await tx.testSection.update({
        where: { id: testSectionId },
        data: {
          ...values.metadata,
          mediaObjectId: values.mediaObjectId,
          translations: { createMany: { data: values.translations } },
        },
      });
      if (values.mediaObjectId !== null) {
        await tx.mediaObject.update({
          where: { id: values.mediaObjectId },
          data: { visibility: MediaVisibility.DOMAIN_AUTHORIZED },
        });
      }
      await writeAudit(
        tx,
        teacherId,
        'TEST_SECTION_UPDATED',
        'TEST_SECTION',
        testSectionId,
        correlationId,
      );
      return tx.testVersion.findUniqueOrThrow({
        where: { id: existing.testVersion.id },
        include: versionInclude,
      });
    });
    return mapVersion(updated);
  }

  async reorderSections(
    teacherId: string,
    versionIdInput: string,
    sectionIdInputs: string[],
    correlationId?: string,
  ): Promise<TeacherTestVersionObject> {
    const version = await this.testDraftAccessService.requireDraft(
      teacherId,
      versionIdInput,
    );
    const sectionIds = sectionIdInputs.map((id) =>
      parseUuid(id, 'testSectionId'),
    );
    await requireCompleteOrderedIds(
      sectionIds,
      this.database.testSection.findMany({
        where: { testVersionId: version.id },
        select: { id: true },
      }),
      'testSectionIds',
    );
    const updated = await this.database.$transaction(async (tx) => {
      await tx.testSection.updateMany({
        where: { testVersionId: version.id },
        data: { position: { increment: sectionIds.length + 1000 } },
      });
      for (const [index, id] of sectionIds.entries())
        await tx.testSection.update({
          where: { id },
          data: { position: index + 1 },
        });
      await writeAudit(
        tx,
        teacherId,
        'TEST_SECTIONS_REORDERED',
        'TEST_VERSION',
        version.id,
        correlationId,
        { sectionIds },
      );
      return tx.testVersion.findUniqueOrThrow({
        where: { id: version.id },
        include: versionInclude,
      });
    });
    return mapVersion(updated);
  }

  async deleteSection(
    teacherId: string,
    versionIdInput: string,
    sectionIdInput: string,
    correlationId?: string,
  ): Promise<TeacherTestVersionObject> {
    const version = await this.testDraftAccessService.requireDraft(
      teacherId,
      versionIdInput,
    );
    const sectionId = parseUuid(sectionIdInput, 'testSectionId');
    const target = await this.database.testSection.findFirst({
      where: { id: sectionId, testVersionId: version.id },
      select: { position: true, _count: { select: { questions: true } } },
    });
    if (target === null) throw notFound();
    if (target._count.questions > 0)
      throw new ApplicationError(
        ErrorCode.CONFLICT,
        'Move or delete the section questions before deleting this section',
        409,
      );
    const updated = await this.database.$transaction(async (tx) => {
      await tx.testSection.delete({ where: { id: sectionId } });
      await tx.testSection.updateMany({
        where: { testVersionId: version.id, position: { gt: target.position } },
        data: { position: { decrement: 1 } },
      });
      await writeAudit(
        tx,
        teacherId,
        'TEST_SECTION_DELETED',
        'TEST_SECTION',
        sectionId,
        correlationId,
        { testVersionId: version.id },
      );
      return tx.testVersion.findUniqueOrThrow({
        where: { id: version.id },
        include: versionInclude,
      });
    });
    return mapVersion(updated);
  }

  async createSectionBlock(
    teacherId: string,
    input: CreateTestSectionBlockInput,
    correlationId?: string,
  ): Promise<TeacherTestVersionObject> {
    const testSectionId = parseUuid(input.testSectionId, 'testSectionId');
    const section = await this.database.testSection.findFirst({
      where: {
        id: testSectionId,
        testVersion: {
          status: TestVersionStatus.DRAFT,
          test: { group: { teacherId } },
        },
      },
      select: { testVersionId: true },
    });
    if (section === null) throw notFound();
    const values = parseSectionBlock(input);
    if (values.mediaObjectId !== null)
      await this.testDraftAccessService.requireReadyTeacherMedia(
        teacherId,
        values.mediaObjectId,
      );
    const questionIds =
      await this.testDraftAccessService.requireSectionBlockQuestions(
        testSectionId,
        values.questionIds,
      );
    const updated = await this.database.$transaction(async (tx) => {
      const position =
        (await tx.testSectionBlock.count({ where: { testSectionId } })) + 1;
      const block = await tx.testSectionBlock.create({
        data: {
          headingLevel: values.headingLevel,
          kind: values.kind,
          mediaObjectId: values.mediaObjectId,
          position,
          tablePayload: values.tablePayload ?? Prisma.DbNull,
          testSectionId,
          translations: { createMany: { data: values.translations } },
          questions: {
            createMany: {
              data: questionIds.map((questionId, index) => ({
                position: index + 1,
                questionId,
              })),
            },
          },
        },
      });
      await writeAudit(
        tx,
        teacherId,
        'TEST_SECTION_BLOCK_CREATED',
        'TEST_SECTION_BLOCK',
        block.id,
        correlationId,
        { testSectionId },
      );
      return tx.testVersion.findUniqueOrThrow({
        where: { id: section.testVersionId },
        include: versionInclude,
      });
    });
    return mapVersion(updated);
  }

  async updateSectionBlock(
    teacherId: string,
    input: UpdateTestSectionBlockInput,
    correlationId?: string,
  ): Promise<TeacherTestVersionObject> {
    const testSectionBlockId = parseUuid(
      input.testSectionBlockId,
      'testSectionBlockId',
    );
    const existing = await this.database.testSectionBlock.findFirst({
      where: {
        id: testSectionBlockId,
        testSection: {
          testVersion: {
            status: TestVersionStatus.DRAFT,
            test: { group: { teacherId } },
          },
        },
      },
      select: { testSection: { select: { id: true, testVersionId: true } } },
    });
    if (existing === null) throw notFound();
    const values = parseSectionBlock(input);
    if (values.mediaObjectId !== null)
      await this.testDraftAccessService.requireReadyTeacherMedia(
        teacherId,
        values.mediaObjectId,
      );
    const questionIds =
      await this.testDraftAccessService.requireSectionBlockQuestions(
        existing.testSection.id,
        values.questionIds,
        testSectionBlockId,
      );
    const updated = await this.database.$transaction(async (tx) => {
      await tx.testSectionBlockQuestion.deleteMany({
        where: { testSectionBlockId },
      });
      await tx.testSectionBlockTranslation.deleteMany({
        where: { testSectionBlockId },
      });
      await tx.testSectionBlock.update({
        where: { id: testSectionBlockId },
        data: {
          headingLevel: values.headingLevel,
          kind: values.kind,
          mediaObjectId: values.mediaObjectId,
          tablePayload: values.tablePayload ?? Prisma.DbNull,
          translations: { createMany: { data: values.translations } },
          questions: {
            createMany: {
              data: questionIds.map((questionId, index) => ({
                position: index + 1,
                questionId,
              })),
            },
          },
        },
      });
      await writeAudit(
        tx,
        teacherId,
        'TEST_SECTION_BLOCK_UPDATED',
        'TEST_SECTION_BLOCK',
        testSectionBlockId,
        correlationId,
      );
      return tx.testVersion.findUniqueOrThrow({
        where: { id: existing.testSection.testVersionId },
        include: versionInclude,
      });
    });
    return mapVersion(updated);
  }

  async reorderSectionBlocks(
    teacherId: string,
    sectionIdInput: string,
    blockIdInputs: string[],
    correlationId?: string,
  ): Promise<TeacherTestVersionObject> {
    const testSectionId = parseUuid(sectionIdInput, 'testSectionId');
    const section = await this.database.testSection.findFirst({
      where: {
        id: testSectionId,
        testVersion: {
          status: TestVersionStatus.DRAFT,
          test: { group: { teacherId } },
        },
      },
      select: { testVersionId: true },
    });
    if (section === null) throw notFound();
    const blockIds = blockIdInputs.map((id) =>
      parseUuid(id, 'testSectionBlockId'),
    );
    await requireCompleteOrderedIds(
      blockIds,
      this.database.testSectionBlock.findMany({
        where: { testSectionId },
        select: { id: true },
      }),
      'testSectionBlockIds',
    );
    const updated = await this.database.$transaction(async (tx) => {
      await tx.testSectionBlock.updateMany({
        where: { testSectionId },
        data: { position: { increment: blockIds.length + 1000 } },
      });
      for (const [index, id] of blockIds.entries())
        await tx.testSectionBlock.update({
          where: { id },
          data: { position: index + 1 },
        });
      await writeAudit(
        tx,
        teacherId,
        'TEST_SECTION_BLOCKS_REORDERED',
        'TEST_SECTION',
        testSectionId,
        correlationId,
        { blockIds },
      );
      return tx.testVersion.findUniqueOrThrow({
        where: { id: section.testVersionId },
        include: versionInclude,
      });
    });
    return mapVersion(updated);
  }

  async deleteSectionBlock(
    teacherId: string,
    sectionIdInput: string,
    blockIdInput: string,
    correlationId?: string,
  ): Promise<TeacherTestVersionObject> {
    const testSectionId = parseUuid(sectionIdInput, 'testSectionId');
    const testSectionBlockId = parseUuid(blockIdInput, 'testSectionBlockId');
    const block = await this.database.testSectionBlock.findFirst({
      where: {
        id: testSectionBlockId,
        testSectionId,
        testSection: {
          testVersion: {
            status: TestVersionStatus.DRAFT,
            test: { group: { teacherId } },
          },
        },
      },
      select: {
        position: true,
        testSection: { select: { testVersionId: true } },
      },
    });
    if (block === null) throw notFound();
    const updated = await this.database.$transaction(async (tx) => {
      await tx.testSectionBlock.delete({ where: { id: testSectionBlockId } });
      await tx.testSectionBlock.updateMany({
        where: { testSectionId, position: { gt: block.position } },
        data: { position: { decrement: 1 } },
      });
      await writeAudit(
        tx,
        teacherId,
        'TEST_SECTION_BLOCK_DELETED',
        'TEST_SECTION_BLOCK',
        testSectionBlockId,
        correlationId,
        { testSectionId },
      );
      return tx.testVersion.findUniqueOrThrow({
        where: { id: block.testSection.testVersionId },
        include: versionInclude,
      });
    });
    return mapVersion(updated);
  }
}

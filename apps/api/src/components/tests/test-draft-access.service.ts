import {
  ContentStatus,
  MediaMalwareStatus,
  MediaObjectStatus,
  TestVersionStatus,
} from '@best/database';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ErrorCode } from '../../libs/enums/error-code.enum';
import { ApplicationError } from '../../libs/errors/application.error';
import { parseUuid } from '../../libs/pagination/cursor-pagination';
import { versionInclude, type VersionRecord } from './test-version-record';
import { validationError, notFound } from './test-authoring-errors';

@Injectable()
export class TestDraftAccessService {
  constructor(private readonly database: DatabaseService) {}
  async requireReadyTeacherMedia(
    teacherId: string,
    mediaObjectId: string,
  ): Promise<void> {
    const media = await this.database.mediaObject.findFirst({
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
  ): Promise<string[]> {
    const uniqueIds = new Set(questionIds);
    if (uniqueIds.size !== questionIds.length)
      throw validationError('questionIds must be unique');
    const questions = await this.database.question.findMany({
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
  ): Promise<void> {
    if (testSectionId === null) return;
    const count = await this.database.testSection.count({
      where: { id: testSectionId, testVersionId },
    });
    if (count !== 1) throw notFound();
  }

  async requireOwnedVersion(
    teacherId: string,
    versionIdInput: string,
  ): Promise<VersionRecord> {
    const id = parseUuid(versionIdInput, 'testVersionId');
    const version = await this.database.testVersion.findFirst({
      where: { id, test: { group: { teacherId } } },
      include: versionInclude,
    });
    if (version === null) throw notFound();
    return version;
  }

  async requireDraft(
    teacherId: string,
    versionIdInput: string,
  ): Promise<VersionRecord> {
    const version = await this.requireOwnedVersion(teacherId, versionIdInput);
    if (version.status !== TestVersionStatus.DRAFT)
      throw new ApplicationError(
        ErrorCode.CONFLICT,
        'Published test versions are immutable',
        409,
      );
    const activeTest = await this.database.test.count({
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
}

import { createHash, randomUUID } from 'node:crypto';

import {
  ContentStatus,
  Language,
  MediaMalwareStatus,
  MediaObjectSource,
  MediaObjectStatus,
  MediaType,
  MediaVisibility,
  Prisma,
  QuestionKind,
  TestSectionBlockKind,
  TestSkill,
  TestVersionStatus,
  UserRole,
  UserStatus,
} from '@best/database';
import { createPrivateObjectKey } from '@best/storage';
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
import type { GenerateListeningAudioInput } from '../../schemas/tests/generate-listening-audio.input';
import type { GeneratedListeningAudioObject } from '../../schemas/tests/generated-listening-audio.object';
import type {
  AttemptGrantConnectionObject,
  TeacherTestConnectionObject,
} from '../../schemas/tests/teacher-test-connection.object';
import type {
  CreateTestSectionBlockInput,
  CreateTestSectionInput,
  CreateTestDraftInput,
  CreateTestPaperSkillDraftInput,
  CreateTestQuestionInput,
  GrantAdditionalTestAttemptInput,
  ReplaceTestDraftTranslationsInput,
  TestTranslationInput,
  UpdateTestSectionBlockInput,
  UpdateTestSectionInput,
  UpdateTestDraftSettingsInput,
  UpdateTestQuestionInput,
} from '../../schemas/tests/teacher-test.input';
import type {
  AttemptGrantObject,
  TeacherTestDraftValidationObject,
  TeacherTestObject,
  TeacherTestVersionObject,
  TestCategoryObject,
} from '../../schemas/tests/teacher-test.object';
import { AssetsStorageGateway } from '../assets/assets-storage.gateway';

import {
  ListeningAudioGateway,
  ListeningAudioProviderError,
} from './listening-audio.gateway';

const versionInclude = {
  questions: {
    include: {
      acceptedAnswers: { orderBy: { position: 'asc' } },
      options: {
        include: { translations: { orderBy: { language: 'asc' } } },
        orderBy: { position: 'asc' },
      },
      section: { select: { id: true, position: true } },
      translations: { orderBy: { language: 'asc' } },
    },
    orderBy: { position: 'asc' },
  },
  sections: {
    include: {
      blocks: {
        include: {
          mediaObject: {
            select: {
              durationSeconds: true,
              heightPixels: true,
              malwareStatus: true,
              status: true,
              widthPixels: true,
            },
          },
          questions: { orderBy: { position: 'asc' } },
          translations: { orderBy: { language: 'asc' } },
        },
        orderBy: { position: 'asc' },
      },
      mediaObject: {
        select: { malwareStatus: true, status: true },
      },
      translations: { orderBy: { language: 'asc' } },
    },
    orderBy: { position: 'asc' },
  },
  test: { select: { skill: true } },
  translations: { orderBy: { language: 'asc' } },
} satisfies Prisma.TestVersionInclude;

type VersionRecord = Prisma.TestVersionGetPayload<{
  include: typeof versionInclude;
}>;

const OPTION_QUESTION_KINDS = new Set<QuestionKind>([
  QuestionKind.MATCHING,
  QuestionKind.MULTIPLE_CHOICE,
  QuestionKind.SINGLE_CHOICE,
  QuestionKind.TRUE_FALSE_NOT_GIVEN,
  QuestionKind.YES_NO_NOT_GIVEN,
]);
const SINGLE_CORRECT_QUESTION_KINDS = new Set<QuestionKind>([
  QuestionKind.SINGLE_CHOICE,
  QuestionKind.TRUE_FALSE_NOT_GIVEN,
  QuestionKind.YES_NO_NOT_GIVEN,
]);
const MULTI_CORRECT_QUESTION_KINDS = new Set<QuestionKind>([
  QuestionKind.MATCHING,
  QuestionKind.MULTIPLE_CHOICE,
]);
const TEXT_QUESTION_KINDS = new Set<QuestionKind>([
  QuestionKind.LONG_TEXT,
  QuestionKind.SHORT_TEXT,
]);
const MEDIA_BLOCK_KINDS = new Set<TestSectionBlockKind>([
  TestSectionBlockKind.AUDIO,
  TestSectionBlockKind.IMAGE,
]);
const TEXT_BLOCK_KINDS = new Set<TestSectionBlockKind>([
  TestSectionBlockKind.HEADING,
  TestSectionBlockKind.RICH_TEXT,
]);
const CAPTION_BLOCK_KINDS = new Set<TestSectionBlockKind>([
  TestSectionBlockKind.AUDIO,
  TestSectionBlockKind.TABLE,
]);
const READING_CONTENT_BLOCK_KINDS = new Set<TestSectionBlockKind>([
  TestSectionBlockKind.IMAGE,
  TestSectionBlockKind.RICH_TEXT,
  TestSectionBlockKind.TABLE,
]);

@Injectable()
export class TestsAuthoringService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audio: ListeningAudioGateway,
    private readonly storage: AssetsStorageGateway,
  ) {}

  async getCategories(teacherId: string): Promise<TestCategoryObject[]> {
    return this.database.testCategory.findMany({
      where: { teacherId },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true },
    });
  }

  async createCategory(
    teacherId: string,
    nameInput: string,
    correlationId?: string,
  ): Promise<TestCategoryObject> {
    const name = requiredText(nameInput, 'name', 100);
    try {
      return await this.database.$transaction(async (tx) => {
        const category = await tx.testCategory.create({
          data: { name, teacherId },
          select: { id: true, name: true },
        });
        await writeAudit(
          tx,
          teacherId,
          'TEST_CATEGORY_CREATED',
          'TEST_CATEGORY',
          category.id,
          correlationId,
        );
        return category;
      });
    } catch (error: unknown) {
      throw uniqueError(error, 'A test category with this name already exists');
    }
  }

  async updateCategory(
    teacherId: string,
    categoryIdInput: string,
    nameInput: string,
    correlationId?: string,
  ): Promise<TestCategoryObject> {
    const categoryId = parseUuid(categoryIdInput, 'categoryId');
    const name = requiredText(nameInput, 'name', 100);
    try {
      return await this.database.$transaction(async (tx) => {
        const updated = await tx.testCategory.updateMany({
          where: { id: categoryId, teacherId },
          data: { name },
        });
        if (updated.count === 0) throw notFound();
        const category = await tx.testCategory.findUniqueOrThrow({
          where: { id: categoryId },
          select: { id: true, name: true },
        });
        await writeAudit(
          tx,
          teacherId,
          'TEST_CATEGORY_UPDATED',
          'TEST_CATEGORY',
          category.id,
          correlationId,
        );
        return category;
      });
    } catch (error: unknown) {
      if (error instanceof ApplicationError) throw error;
      throw uniqueError(error, 'A test category with this name already exists');
    }
  }

  async getTests(
    teacherId: string,
    groupIdInput: string | undefined,
    first: number | undefined,
    after: string | undefined,
    status: ContentStatus | undefined,
    search: string | undefined,
  ): Promise<TeacherTestConnectionObject> {
    const groupId =
      groupIdInput === undefined
        ? undefined
        : parseUuid(groupIdInput, 'groupId');
    const afterId = decodeCursor(after);
    const pageSize = parsePageSize(first);
    const term = search?.trim();
    const tests = await this.database.test.findMany({
      where: {
        group: { teacherId },
        ...(groupId === undefined ? {} : { groupId }),
        ...(status === undefined ? {} : { status }),
        ...(afterId === undefined ? {} : { id: { gt: afterId } }),
        ...(term === undefined || term.length === 0
          ? {}
          : {
              versions: {
                some: {
                  translations: {
                    some: { title: { contains: term, mode: 'insensitive' } },
                  },
                },
              },
            }),
      },
      include: {
        category: { select: { id: true, name: true } },
        versions: {
          include: versionInclude,
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
      orderBy: { id: 'asc' },
      take: pageSize + 1,
    });
    const hasNextPage = tests.length > pageSize;
    const page = hasNextPage ? tests.slice(0, pageSize) : tests;
    const edges = page.map((test) => ({
      cursor: encodeCursor(test.id),
      node: mapTest(test),
    }));
    return {
      edges,
      pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
    };
  }

  async getDraft(
    teacherId: string,
    testIdInput: string,
  ): Promise<TeacherTestVersionObject> {
    const testId = parseUuid(testIdInput, 'testId');
    const version = await this.database.testVersion.findFirst({
      where: {
        status: TestVersionStatus.DRAFT,
        testId,
        test: { group: { teacherId } },
      },
      include: versionInclude,
      orderBy: { version: 'desc' },
    });
    if (version === null) throw notFound();
    return mapVersion(version);
  }

  async getVersion(
    teacherId: string,
    versionIdInput: string,
  ): Promise<TeacherTestVersionObject> {
    return mapVersion(
      await this.requireOwnedVersion(teacherId, versionIdInput),
    );
  }

  async validateDraft(
    teacherId: string,
    testVersionId: string,
  ): Promise<TeacherTestDraftValidationObject> {
    const version = await this.requireDraft(teacherId, testVersionId);
    const issues = collectPublishValidationIssues(version);
    return { isPublishable: issues.length === 0, issues };
  }

  async createDraft(
    teacherId: string,
    input: CreateTestDraftInput,
    correlationId?: string,
  ): Promise<TeacherTestObject> {
    const groupId = parseUuid(input.groupId, 'groupId');
    const categoryId = parseUuid(input.categoryId, 'categoryId');
    const translations = parseTestTranslations(
      input.translations,
      input.primaryLanguage,
    );
    const [group, category] = await Promise.all([
      this.database.group.findFirst({
        where: { id: groupId, teacherId, status: ContentStatus.ACTIVE },
        select: { id: true },
      }),
      this.database.testCategory.findFirst({
        where: { id: categoryId, teacherId },
        select: { id: true },
      }),
    ]);
    if (group === null || category === null) throw notFound();

    const testId = await this.database.$transaction(async (tx) => {
      const test = await tx.test.create({ data: { categoryId, groupId } });
      const version = await tx.testVersion.create({
        data: {
          primaryLanguage: input.primaryLanguage,
          testId: test.id,
          version: 1,
          translations: { createMany: { data: translations } },
        },
      });
      await writeAudit(
        tx,
        teacherId,
        'TEST_DRAFT_CREATED',
        'TEST',
        test.id,
        correlationId,
        { testVersionId: version.id },
      );
      return test.id;
    });
    return this.getTest(teacherId, testId);
  }

  async createPaperSkillDraft(
    teacherId: string,
    input: CreateTestPaperSkillDraftInput,
    correlationId?: string,
  ): Promise<TeacherTestVersionObject> {
    const testPaperId = parseUuid(input.testPaperId, 'testPaperId');
    const paper = await this.database.testPaper.findFirst({
      where: {
        id: testPaperId,
        status: ContentStatus.ACTIVE,
        group: { status: ContentStatus.ACTIVE, teacherId },
      },
      select: { groupId: true, title: true },
    });
    if (paper === null) throw notFound();

    const category = await this.database.testCategory.upsert({
      where: {
        teacherId_name: { name: 'BEST LC Academic Tests', teacherId },
      },
      create: { name: 'BEST LC Academic Tests', teacherId },
      update: {},
      select: { id: true },
    });
    const title = `${paper.title} — ${skillLabel(input.skill)}`;

    try {
      const versionId = await this.database.$transaction(async (tx) => {
        const test = await tx.test.create({
          data: {
            categoryId: category.id,
            groupId: paper.groupId,
            paperId: testPaperId,
            skill: input.skill,
            versions: {
              create: {
                primaryLanguage: Language.EN,
                scoringRuleVersion:
                  input.skill === TestSkill.LISTENING ||
                  input.skill === TestSkill.READING
                    ? 'objective-v2'
                    : 'subjective-v1',
                translations: {
                  create: {
                    description: `Teacher-authored ${skillLabel(input.skill)} draft.`,
                    language: Language.EN,
                    title,
                  },
                },
                version: 1,
              },
            },
          },
          select: { id: true, versions: { select: { id: true } } },
        });
        const createdVersionId = test.versions[0]?.id;
        if (createdVersionId === undefined)
          throw new Error('Draft version was not created');
        await writeAudit(
          tx,
          teacherId,
          'TEST_PAPER_SKILL_DRAFT_CREATED',
          'TEST_VERSION',
          createdVersionId,
          correlationId,
          { skill: input.skill, testId: test.id, testPaperId },
        );
        return createdVersionId;
      });
      return await this.getVersion(teacherId, versionId);
    } catch (error) {
      throw uniqueError(
        error,
        'This practice already contains the selected skill',
      );
    }
  }

  async updateSettings(
    teacherId: string,
    input: UpdateTestDraftSettingsInput,
    correlationId?: string,
  ): Promise<TeacherTestVersionObject> {
    const version = await this.requireDraft(teacherId, input.testVersionId);
    const values = parseSettings(input);
    const updated = await this.database.$transaction(async (tx) => {
      const row = await tx.testVersion.update({
        where: { id: version.id },
        data: values,
        include: versionInclude,
      });
      await writeAudit(
        tx,
        teacherId,
        'TEST_DRAFT_SETTINGS_UPDATED',
        'TEST_VERSION',
        row.id,
        correlationId,
        values,
      );
      return row;
    });
    return mapVersion(updated);
  }

  async replaceTranslations(
    teacherId: string,
    input: ReplaceTestDraftTranslationsInput,
    correlationId?: string,
  ): Promise<TeacherTestVersionObject> {
    const version = await this.requireDraft(teacherId, input.testVersionId);
    const translations = parseTestTranslations(
      input.translations,
      version.primaryLanguage,
    );
    const updated = await this.database.$transaction(async (tx) => {
      await tx.testTranslation.deleteMany({
        where: { testVersionId: version.id },
      });
      await tx.testTranslation.createMany({
        data: translations.map((row) => ({
          ...row,
          testVersionId: version.id,
        })),
      });
      await writeAudit(
        tx,
        teacherId,
        'TEST_DRAFT_TRANSLATIONS_REPLACED',
        'TEST_VERSION',
        version.id,
        correlationId,
        { languages: translations.map(({ language }) => language) },
      );
      return tx.testVersion.findUniqueOrThrow({
        where: { id: version.id },
        include: versionInclude,
      });
    });
    return mapVersion(updated);
  }

  async createSection(
    teacherId: string,
    input: CreateTestSectionInput,
    correlationId?: string,
  ): Promise<TeacherTestVersionObject> {
    const version = await this.requireDraft(teacherId, input.testVersionId);
    const values = parseSection(input, version.primaryLanguage);
    if (values.mediaObjectId !== null)
      await this.requireReadyTeacherMedia(teacherId, values.mediaObjectId);
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
      await this.requireReadyTeacherMedia(teacherId, values.mediaObjectId);
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

  async generateListeningAudio(
    teacherId: string,
    input: GenerateListeningAudioInput,
    correlationId?: string,
  ): Promise<GeneratedListeningAudioObject> {
    const testSectionId = parseUuid(input.testSectionId, 'testSectionId');
    const transcript = requiredText(
      input.transcript,
      'transcript',
      this.audio.maxTranscriptCharacters,
    );
    const existing = await this.database.testSection.findFirst({
      where: {
        id: testSectionId,
        testVersion: {
          status: TestVersionStatus.DRAFT,
          test: {
            group: { teacherId },
            skill: TestSkill.LISTENING,
            status: ContentStatus.ACTIVE,
          },
        },
      },
      select: {
        position: true,
      },
    });

    if (existing === null) throw notFound();

    const mediaObjectId = randomUUID();
    const objectKey = createPrivateObjectKey({
      mediaObjectId,
      ownerId: teacherId,
    });
    let mediaObjectCreated = false;

    try {
      const generated = await this.audio.generate(transcript);

      if (
        generated.bytes.byteLength < 1 ||
        generated.bytes.byteLength > this.storage.maxUploadBytes
      ) {
        throw new ListeningAudioProviderError(
          'The generated audio exceeds the configured storage limit',
        );
      }

      const checksumSha256 = createHash('sha256')
        .update(generated.bytes)
        .digest('hex');
      await this.database.mediaObject.create({
        data: {
          bucket: this.storage.bucket,
          createdById: teacherId,
          id: mediaObjectId,
          mediaType: MediaType.AUDIO,
          mimeType: generated.mimeType,
          objectKey,
          originalName: `listening-part-${String(existing.position)}.wav`,
          source: MediaObjectSource.SYSTEM_GENERATED,
          status: MediaObjectStatus.VERIFYING,
          uploadExpiresAt: new Date(Date.now() + 15 * 60 * 1_000),
          visibility: MediaVisibility.OWNER_ONLY,
        },
      });
      mediaObjectCreated = true;

      await this.storage.writeObject({
        bytes: generated.bytes,
        contentType: generated.mimeType,
        key: objectKey,
      });
      const download = await this.storage.createDownloadIntent(objectKey);

      const lifecycleTime = new Date();
      await this.database.$transaction(async (tx) => {
        const current = await tx.testSection.count({
          where: {
            id: testSectionId,
            testVersion: {
              status: TestVersionStatus.DRAFT,
              test: {
                group: { teacherId },
                skill: TestSkill.LISTENING,
                status: ContentStatus.ACTIVE,
              },
            },
          },
        });

        if (current !== 1) {
          throw new ApplicationError(
            ErrorCode.CONFLICT,
            'The listening draft changed while audio was being generated',
            409,
          );
        }

        await tx.mediaObject.update({
          where: { id: mediaObjectId },
          data: {
            checksumSha256,
            durationSeconds: generated.durationSeconds,
            malwareEngine: generated.engine,
            malwareEngineVersion: generated.engineVersion,
            malwareScannedAt: lifecycleTime,
            malwareSignatureVersion: 'trusted-system-output',
            malwareStatus: MediaMalwareStatus.CLEAN,
            sizeBytes: BigInt(generated.bytes.byteLength),
            status: MediaObjectStatus.READY,
            verifiedAt: lifecycleTime,
          },
        });
        await writeAudit(
          tx,
          teacherId,
          'LISTENING_AUDIO_PREVIEW_GENERATED',
          'MEDIA_OBJECT',
          mediaObjectId,
          correlationId,
          {
            testSectionId,
            voice: generated.voice,
          },
        );
      });

      return {
        durationSeconds: generated.durationSeconds,
        expiresAt: download.expiresAt,
        mediaObjectId,
        url: download.url,
      };
    } catch (error: unknown) {
      if (mediaObjectCreated) {
        await this.rejectGeneratedMediaObject(mediaObjectId);
      }

      if (error instanceof ApplicationError) throw error;

      throw new ApplicationError(
        ErrorCode.SERVICE_UNAVAILABLE,
        'Listening audio could not be generated',
        503,
      );
    }
  }

  async reorderSections(
    teacherId: string,
    versionIdInput: string,
    sectionIdInputs: string[],
    correlationId?: string,
  ): Promise<TeacherTestVersionObject> {
    const version = await this.requireDraft(teacherId, versionIdInput);
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
    const version = await this.requireDraft(teacherId, versionIdInput);
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
      await this.requireReadyTeacherMedia(teacherId, values.mediaObjectId);
    const questionIds = await this.requireSectionBlockQuestions(
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
      await this.requireReadyTeacherMedia(teacherId, values.mediaObjectId);
    const questionIds = await this.requireSectionBlockQuestions(
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

  async createQuestion(
    teacherId: string,
    input: CreateTestQuestionInput,
    correlationId?: string,
  ): Promise<TeacherTestVersionObject> {
    const version = await this.requireDraft(teacherId, input.testVersionId);
    const question = parseQuestion(
      input,
      version.primaryLanguage,
      QuestionKind.SINGLE_CHOICE,
    );
    await this.requireVersionSection(version.id, question.sectionId);
    const updated = await this.database.$transaction(async (tx) => {
      const count = await tx.question.count({
        where: { testVersionId: version.id },
      });
      const created = await tx.question.create({
        data: {
          answerLimit: question.answerLimit,
          kind: question.kind,
          maxSelections: question.maxSelections,
          position: count + 1,
          sectionId: question.sectionId,
          testVersionId: version.id,
          acceptedAnswers: {
            createMany: { data: question.acceptedAnswers },
          },
          translations: { createMany: { data: question.translations } },
        },
      });
      await createOptions(tx, created.id, question.options);
      await writeAudit(
        tx,
        teacherId,
        'TEST_QUESTION_CREATED',
        'QUESTION',
        created.id,
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

  async updateQuestion(
    teacherId: string,
    input: UpdateTestQuestionInput,
    correlationId?: string,
  ): Promise<TeacherTestVersionObject> {
    const questionId = parseUuid(input.questionId, 'questionId');
    const existing = await this.database.question.findFirst({
      where: {
        id: questionId,
        testVersion: {
          status: TestVersionStatus.DRAFT,
          test: { group: { teacherId } },
        },
      },
      select: {
        kind: true,
        id: true,
        testVersion: { select: { id: true, primaryLanguage: true } },
      },
    });
    if (existing === null) throw notFound();
    const values = parseQuestion(
      input,
      existing.testVersion.primaryLanguage,
      existing.kind,
    );
    await this.requireVersionSection(existing.testVersion.id, values.sectionId);
    const updated = await this.database.$transaction(async (tx) => {
      await tx.answerOption.deleteMany({ where: { questionId } });
      await tx.questionAcceptedAnswer.deleteMany({ where: { questionId } });
      await tx.questionTranslation.deleteMany({ where: { questionId } });
      await tx.question.update({
        where: { id: questionId },
        data: {
          answerLimit: values.answerLimit,
          kind: values.kind,
          maxSelections: values.maxSelections,
          sectionId: values.sectionId,
          acceptedAnswers: { createMany: { data: values.acceptedAnswers } },
          translations: { createMany: { data: values.translations } },
        },
      });
      await createOptions(tx, questionId, values.options);
      await writeAudit(
        tx,
        teacherId,
        'TEST_QUESTION_UPDATED',
        'QUESTION',
        questionId,
        correlationId,
      );
      return tx.testVersion.findUniqueOrThrow({
        where: { id: existing.testVersion.id },
        include: versionInclude,
      });
    });
    return mapVersion(updated);
  }

  async reorderQuestions(
    teacherId: string,
    versionIdInput: string,
    questionIdInputs: string[],
    correlationId?: string,
  ): Promise<TeacherTestVersionObject> {
    const version = await this.requireDraft(teacherId, versionIdInput);
    const questionIds = questionIdInputs.map((id) =>
      parseUuid(id, 'questionId'),
    );
    const uniqueIds = new Set(questionIds);
    const existing = await this.database.question.findMany({
      where: { testVersionId: version.id },
      select: { id: true },
    });
    if (
      uniqueIds.size !== questionIds.length ||
      existing.length !== questionIds.length ||
      existing.some(({ id }) => !uniqueIds.has(id))
    ) {
      throw validationError(
        'questionIds must contain every draft question exactly once',
      );
    }
    const updated = await this.database.$transaction(async (tx) => {
      await tx.question.updateMany({
        where: { testVersionId: version.id },
        data: { position: { increment: questionIds.length + 1000 } },
      });
      for (const [index, id] of questionIds.entries())
        await tx.question.update({
          where: { id },
          data: { position: index + 1 },
        });
      await writeAudit(
        tx,
        teacherId,
        'TEST_QUESTIONS_REORDERED',
        'TEST_VERSION',
        version.id,
        correlationId,
        { questionIds },
      );
      return tx.testVersion.findUniqueOrThrow({
        where: { id: version.id },
        include: versionInclude,
      });
    });
    return mapVersion(updated);
  }

  async deleteQuestion(
    teacherId: string,
    versionIdInput: string,
    questionIdInput: string,
    correlationId?: string,
  ): Promise<TeacherTestVersionObject> {
    const version = await this.requireDraft(teacherId, versionIdInput);
    const questionId = parseUuid(questionIdInput, 'questionId');
    const target = await this.database.question.findFirst({
      where: { id: questionId, testVersionId: version.id },
      select: { position: true },
    });
    if (target === null) throw notFound();
    const updated = await this.database.$transaction(async (tx) => {
      await tx.question.delete({ where: { id: questionId } });
      await tx.question.updateMany({
        where: { testVersionId: version.id, position: { gt: target.position } },
        data: { position: { decrement: 1 } },
      });
      await writeAudit(
        tx,
        teacherId,
        'TEST_QUESTION_DELETED',
        'QUESTION',
        questionId,
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

  async publish(
    teacherId: string,
    versionIdInput: string,
    correlationId?: string,
  ): Promise<TeacherTestVersionObject> {
    const version = await this.requireDraft(teacherId, versionIdInput);
    validatePublishable(version);
    const updated = await this.database.$transaction(async (tx) => {
      const row = await tx.testVersion.update({
        where: { id: version.id },
        data: { publishedAt: new Date(), status: TestVersionStatus.PUBLISHED },
        include: versionInclude,
      });
      await writeAudit(
        tx,
        teacherId,
        'TEST_VERSION_PUBLISHED',
        'TEST_VERSION',
        row.id,
        correlationId,
        { version: row.version },
      );
      return row;
    });
    return mapVersion(updated);
  }

  async createNextVersion(
    teacherId: string,
    testIdInput: string,
    correlationId?: string,
  ): Promise<TeacherTestVersionObject> {
    const testId = parseUuid(testIdInput, 'testId');
    const latest = await this.database.testVersion.findFirst({
      where: { testId, test: { group: { teacherId } } },
      include: versionInclude,
      orderBy: { version: 'desc' },
    });
    if (latest === null) throw notFound();
    const draft = await this.database.testVersion.findFirst({
      where: { testId, status: TestVersionStatus.DRAFT },
      select: { id: true },
    });
    if (draft !== null)
      throw new ApplicationError(
        ErrorCode.CONFLICT,
        'This test already has an editable draft',
        409,
      );
    const created = await this.database.$transaction(async (tx) => {
      const row = await tx.testVersion.create({
        data: {
          attemptLimit: latest.attemptLimit,
          availabilityEndsAt: latest.availabilityEndsAt,
          availabilityStartsAt: latest.availabilityStartsAt,
          durationMinutes: latest.durationMinutes,
          passingPercentage: latest.passingPercentage,
          primaryLanguage: latest.primaryLanguage,
          scoringRuleVersion: latest.scoringRuleVersion,
          testId,
          version: latest.version + 1,
          translations: {
            createMany: {
              data: latest.translations.map(
                ({ description, language, title }) => ({
                  description,
                  language,
                  title,
                }),
              ),
            },
          },
        },
      });
      const sectionIds = new Map<string, string>();
      for (const section of latest.sections) {
        const copiedSection = await tx.testSection.create({
          data: {
            mediaObjectId: section.mediaObjectId,
            minimumWords: section.minimumWords,
            position: section.position,
            preparationSeconds: section.preparationSeconds,
            responseSeconds: section.responseSeconds,
            suggestedMinutes: section.suggestedMinutes,
            testVersionId: row.id,
            translations: {
              createMany: {
                data: section.translations.map(
                  ({ content, instructions, language, title }) => ({
                    content,
                    instructions,
                    language,
                    title,
                  }),
                ),
              },
            },
          },
        });
        sectionIds.set(section.id, copiedSection.id);
      }
      const questionIds = new Map<string, string>();
      for (const question of latest.questions) {
        const copiedQuestion = await tx.question.create({
          data: {
            answerLimit: question.answerLimit,
            kind: question.kind,
            maxSelections: question.maxSelections,
            position: question.position,
            sectionId:
              question.section === null
                ? null
                : (sectionIds.get(question.section.id) ?? null),
            testVersionId: row.id,
            acceptedAnswers: {
              createMany: {
                data: question.acceptedAnswers.map(
                  ({ displayValue, normalizedValue, position }) => ({
                    displayValue,
                    normalizedValue,
                    position,
                  }),
                ),
              },
            },
            translations: {
              createMany: {
                data: question.translations.map(
                  ({ language, prompt, rationale }) => ({
                    language,
                    prompt,
                    rationale,
                  }),
                ),
              },
            },
          },
        });
        questionIds.set(question.id, copiedQuestion.id);
        await createOptions(
          tx,
          copiedQuestion.id,
          question.options.map((option) => ({
            isCorrect: option.isCorrect,
            translations: option.translations.map(({ language, text }) => ({
              language,
              text,
            })),
          })),
        );
      }
      for (const section of latest.sections) {
        const copiedSectionId = sectionIds.get(section.id);
        if (copiedSectionId === undefined)
          throw new Error('Copied section identity was not created');
        for (const block of section.blocks) {
          await tx.testSectionBlock.create({
            data: {
              headingLevel: block.headingLevel,
              kind: block.kind,
              mediaObjectId: block.mediaObjectId,
              position: block.position,
              tablePayload: block.tablePayload ?? Prisma.DbNull,
              testSectionId: copiedSectionId,
              translations: {
                createMany: {
                  data: block.translations.map(
                    ({ altText, caption, language, text }) => ({
                      altText,
                      caption,
                      language,
                      text,
                    }),
                  ),
                },
              },
              questions: {
                createMany: {
                  data: block.questions.map(({ position, questionId }) => {
                    const copiedQuestionId = questionIds.get(questionId);
                    if (copiedQuestionId === undefined)
                      throw new Error(
                        'Copied question identity was not created',
                      );
                    return { position, questionId: copiedQuestionId };
                  }),
                },
              },
            },
          });
        }
      }
      await writeAudit(
        tx,
        teacherId,
        'TEST_VERSION_DRAFTED',
        'TEST_VERSION',
        row.id,
        correlationId,
        { copiedFromVersionId: latest.id },
      );
      return tx.testVersion.findUniqueOrThrow({
        where: { id: row.id },
        include: versionInclude,
      });
    });
    return mapVersion(created);
  }

  async setArchived(
    teacherId: string,
    testIdInput: string,
    archived: boolean,
    correlationId?: string,
  ): Promise<TeacherTestObject> {
    const testId = parseUuid(testIdInput, 'testId');
    const existing = await this.database.test.findFirst({
      where: { id: testId, group: { teacherId } },
      select: { id: true },
    });
    if (existing === null) throw notFound();
    await this.database.$transaction(async (tx) => {
      await tx.test.update({
        where: { id: testId },
        data: {
          archivedAt: archived ? new Date() : null,
          status: archived ? ContentStatus.ARCHIVED : ContentStatus.ACTIVE,
        },
      });
      await writeAudit(
        tx,
        teacherId,
        archived ? 'TEST_ARCHIVED' : 'TEST_RESTORED',
        'TEST',
        testId,
        correlationId,
      );
    });
    return this.getTest(teacherId, testId);
  }

  async getGrants(
    teacherId: string,
    testIdInput: string,
    first?: number,
    after?: string,
  ): Promise<AttemptGrantConnectionObject> {
    const testId = parseUuid(testIdInput, 'testId');
    await this.requireTest(teacherId, testId);
    const pageSize = parsePageSize(first);
    const afterId = decodeCursor(after);
    const rows = await this.database.attemptGrant.findMany({
      where: {
        testId,
        ...(afterId === undefined ? {} : { id: { gt: afterId } }),
      },
      orderBy: { id: 'asc' },
      take: pageSize + 1,
    });
    const hasNextPage = rows.length > pageSize;
    const page = hasNextPage ? rows.slice(0, pageSize) : rows;
    const edges = page.map((node) => ({ cursor: encodeCursor(node.id), node }));
    return {
      edges,
      pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
    };
  }

  async grantAttempt(
    teacherId: string,
    input: GrantAdditionalTestAttemptInput,
    correlationId?: string,
  ): Promise<AttemptGrantObject> {
    const testId = parseUuid(input.testId, 'testId');
    const studentId = parseUuid(input.studentId, 'studentId');
    const reason = requiredText(input.reason, 'reason', 1000);
    if (
      !Number.isInteger(input.additionalAttempts) ||
      input.additionalAttempts < 1 ||
      input.additionalAttempts > 10
    )
      throw validationError('additionalAttempts must be between 1 and 10');
    const test = await this.requireTest(teacherId, testId);
    const student = await this.database.user.findFirst({
      where: {
        id: studentId,
        role: UserRole.STUDENT,
        status: UserStatus.ACTIVE,
        groupMemberships: { some: { endedAt: null, groupId: test.groupId } },
      },
      select: { id: true },
    });
    if (student === null) throw notFound();
    return this.database.$transaction(async (tx) => {
      const grant = await tx.attemptGrant.create({
        data: {
          additionalAttempts: input.additionalAttempts,
          grantedById: teacherId,
          reason,
          studentId,
          testId,
        },
      });
      await writeAudit(
        tx,
        teacherId,
        'TEST_ATTEMPT_GRANTED',
        'ATTEMPT_GRANT',
        grant.id,
        correlationId,
        { additionalAttempts: grant.additionalAttempts, studentId, testId },
      );
      return grant;
    });
  }

  private async getTest(
    teacherId: string,
    testId: string,
  ): Promise<TeacherTestObject> {
    const test = await this.database.test.findFirst({
      where: { id: testId, group: { teacherId } },
      include: {
        category: { select: { id: true, name: true } },
        versions: {
          include: versionInclude,
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });
    if (test === null) throw notFound();
    return mapTest(test);
  }

  private async requireTest(teacherId: string, testId: string) {
    const test = await this.database.test.findFirst({
      where: { id: testId, group: { teacherId } },
      select: { groupId: true, id: true },
    });
    if (test === null) throw notFound();
    return test;
  }

  private async requireReadyTeacherMedia(
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

  private async requireSectionBlockQuestions(
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

  private async requireVersionSection(
    testVersionId: string,
    testSectionId: string | null,
  ): Promise<void> {
    if (testSectionId === null) return;
    const count = await this.database.testSection.count({
      where: { id: testSectionId, testVersionId },
    });
    if (count !== 1) throw notFound();
  }

  private async requireOwnedVersion(
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

  private async rejectGeneratedMediaObject(
    mediaObjectId: string,
  ): Promise<void> {
    await this.database.mediaObject.updateMany({
      where: {
        id: mediaObjectId,
        status: MediaObjectStatus.VERIFYING,
      },
      data: {
        rejectedAt: new Date(),
        rejectionCode: 'GENERATION_FAILED',
        status: MediaObjectStatus.REJECTED,
      },
    });
  }

  private async requireDraft(
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

function parseSettings(input: UpdateTestDraftSettingsInput) {
  if (
    !Number.isInteger(input.attemptLimit) ||
    input.attemptLimit < 1 ||
    input.attemptLimit > 20
  )
    throw validationError('attemptLimit must be between 1 and 20');
  if (
    !Number.isInteger(input.passingPercentage) ||
    input.passingPercentage < 0 ||
    input.passingPercentage > 100
  )
    throw validationError('passingPercentage must be between 0 and 100');
  if (
    input.durationMinutes !== undefined &&
    (!Number.isInteger(input.durationMinutes) ||
      input.durationMinutes < 1 ||
      input.durationMinutes > 1440)
  )
    throw validationError('durationMinutes must be between 1 and 1440');
  if (
    input.availabilityStartsAt !== undefined &&
    input.availabilityEndsAt !== undefined &&
    input.availabilityEndsAt <= input.availabilityStartsAt
  )
    throw validationError(
      'availabilityEndsAt must be later than availabilityStartsAt',
    );
  return {
    attemptLimit: input.attemptLimit,
    availabilityEndsAt: input.availabilityEndsAt ?? null,
    availabilityStartsAt: input.availabilityStartsAt ?? null,
    durationMinutes: input.durationMinutes ?? null,
    passingPercentage: input.passingPercentage,
    primaryLanguage: input.primaryLanguage,
  };
}

function parseSection(
  input: CreateTestSectionInput | UpdateTestSectionInput,
  primaryLanguage: Language,
) {
  return {
    mediaObjectId: input.mediaObjectId
      ? parseUuid(input.mediaObjectId, 'mediaObjectId')
      : null,
    metadata: {
      minimumWords: optionalPositiveInteger(input.minimumWords, 'minimumWords'),
      preparationSeconds: optionalPositiveInteger(
        input.preparationSeconds,
        'preparationSeconds',
      ),
      responseSeconds: optionalPositiveInteger(
        input.responseSeconds,
        'responseSeconds',
      ),
      suggestedMinutes: optionalPositiveInteger(
        input.suggestedMinutes,
        'suggestedMinutes',
      ),
    },
    translations: parseSectionTranslations(input.translations, primaryLanguage),
  };
}

function parseSectionTranslations(
  inputs: CreateTestSectionInput['translations'],
  primaryLanguage: Language,
) {
  if (inputs.length < 1 || inputs.length > 3)
    throw validationError('Provide between one and three section translations');
  const languages = new Set(inputs.map(({ language }) => language));
  if (languages.size !== inputs.length || !languages.has(primaryLanguage))
    throw validationError(
      'Section translations must be unique and include the primary language',
    );
  return inputs.map(({ content, instructions, language, title }) => ({
    content: optionalText(content, 'section content', 100_000),
    instructions: requiredText(instructions, 'section instructions', 10_000),
    language,
    title: requiredText(title, 'section title', 240),
  }));
}

function optionalPositiveInteger(
  value: number | null | undefined,
  field: string,
): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || value < 1)
    throw validationError(`${field} must be a positive whole number`);
  return value;
}

async function requireCompleteOrderedIds(
  ids: string[],
  existingPromise: Promise<{ id: string }[]>,
  field: string,
): Promise<void> {
  const uniqueIds = new Set(ids);
  const existing = await existingPromise;
  if (
    uniqueIds.size !== ids.length ||
    existing.length !== ids.length ||
    existing.some(({ id }) => !uniqueIds.has(id))
  )
    throw validationError(
      `${field} must contain every owned draft item exactly once`,
    );
}

function parseTestTranslations(
  inputs: TestTranslationInput[],
  primaryLanguage: Language,
) {
  if (inputs.length < 1 || inputs.length > 3)
    throw validationError('Provide between one and three translations');
  const languages = new Set(inputs.map(({ language }) => language));
  if (languages.size !== inputs.length || !languages.has(primaryLanguage))
    throw validationError(
      'Translations must be unique and include the primary language',
    );
  return inputs.map(({ description, language, title }) => ({
    description: optionalText(description, 'description', 10_000),
    language,
    title: requiredText(title, 'title', 240),
  }));
}

function parseSectionBlock(
  input: CreateTestSectionBlockInput | UpdateTestSectionBlockInput,
) {
  const mediaObjectId = input.mediaObjectId
    ? parseUuid(input.mediaObjectId, 'mediaObjectId')
    : null;
  const headingLevel = input.headingLevel ?? null;
  const questionIds = (input.questionIds ?? []).map((id) =>
    parseUuid(id, 'questionId'),
  );
  let tablePayload: Prisma.InputJsonObject | null = null;

  if (input.kind === TestSectionBlockKind.HEADING) {
    if (headingLevel === null || ![2, 3, 4].includes(headingLevel))
      throw validationError('Heading blocks require level 2, 3, or 4');
  } else if (headingLevel !== null) {
    throw validationError('Only heading blocks may define headingLevel');
  }

  if (MEDIA_BLOCK_KINDS.has(input.kind) !== (mediaObjectId !== null))
    throw validationError('Only image and audio blocks require mediaObjectId');

  if (input.kind === TestSectionBlockKind.TABLE) {
    const headerRows = parseTableRowInputs(
      input.tableHeaderRows ?? [],
      'tableHeaderRows',
    );
    const rows = parseTableRowInputs(input.tableRows ?? [], 'tableRows');
    const columnCount = headerRows[0]?.length ?? rows[0]?.length ?? 0;
    if (
      columnCount === 0 ||
      [...headerRows, ...rows].some((row) => row.length !== columnCount)
    )
      throw validationError(
        'Table rows must use one consistent non-empty shape',
      );
    tablePayload = { headerRows, rows, version: 1 };
  } else if (
    input.tableHeaderRows !== undefined ||
    input.tableRows !== undefined
  ) {
    throw validationError('Only table blocks may define table rows');
  }

  if (input.kind === TestSectionBlockKind.QUESTION_GROUP) {
    if (questionIds.length === 0)
      throw validationError('Question groups require at least one question');
  } else if (questionIds.length > 0) {
    throw validationError('Only question-group blocks may reference questions');
  }

  return {
    headingLevel,
    kind: input.kind,
    mediaObjectId,
    questionIds,
    tablePayload,
    translations: parseSectionBlockTranslations(input),
  };
}

function parseSectionBlockTranslations(
  input: CreateTestSectionBlockInput | UpdateTestSectionBlockInput,
) {
  if (input.kind === TestSectionBlockKind.QUESTION_GROUP) {
    if (input.translations.length > 0)
      throw validationError(
        'Question-group blocks do not contain translations',
      );
    return [];
  }
  if (input.translations.length < 1 || input.translations.length > 3)
    throw validationError('Provide between one and three block translations');
  const languages = new Set(input.translations.map(({ language }) => language));
  if (languages.size !== input.translations.length)
    throw validationError('Block translation languages must be unique');

  return input.translations.map(({ altText, caption, language, text }) => {
    const values = {
      altText: optionalText(altText, 'block alt text', 2000),
      caption: optionalText(caption, 'block caption', 2000),
      language,
      text: optionalText(text, 'block text', 100_000),
    };
    if (TEXT_BLOCK_KINDS.has(input.kind) && values.text === null)
      throw validationError('Heading and rich-text blocks require text');
    if (input.kind === TestSectionBlockKind.IMAGE && values.altText === null)
      throw validationError('Image blocks require alt text');
    if (CAPTION_BLOCK_KINDS.has(input.kind) && values.caption === null)
      throw validationError('Table and audio blocks require a caption');
    return values;
  });
}

function parseTableRowInputs(
  inputs: { cells: string[] }[],
  field: string,
): string[][] {
  if (inputs.length > 100)
    throw validationError(`${field} may contain at most 100 rows`);
  return inputs.map(({ cells }, rowIndex) => {
    if (cells.length < 1 || cells.length > 50)
      throw validationError(`${field}[${String(rowIndex)}] has invalid cells`);
    return cells.map((cell) => requiredText(cell, 'table cell', 10_000));
  });
}

function parseQuestion(
  input: CreateTestQuestionInput | UpdateTestQuestionInput,
  primaryLanguage: Language,
  fallbackKind: QuestionKind,
) {
  const translationsInput = input.translations;
  const optionsInput = input.options;
  const kind = input.kind ?? fallbackKind;
  if (translationsInput.length < 1 || translationsInput.length > 3)
    throw validationError(
      'Provide between one and three question translations',
    );
  const languages = new Set(translationsInput.map(({ language }) => language));
  if (
    languages.size !== translationsInput.length ||
    !languages.has(primaryLanguage)
  )
    throw validationError(
      'Question translations must be unique and include the primary language',
    );
  const optionKind = OPTION_QUESTION_KINDS.has(kind);
  if (optionKind && (optionsInput.length < 2 || optionsInput.length > 50))
    throw validationError(
      'This question kind must contain between 2 and 50 options',
    );
  if (!optionKind && optionsInput.length > 0)
    throw validationError('This question kind does not accept options');
  const correctOptionCount = optionsInput.filter(
    ({ isCorrect }) => isCorrect,
  ).length;
  if (SINGLE_CORRECT_QUESTION_KINDS.has(kind) && correctOptionCount !== 1)
    throw validationError('This question kind requires one correct option');
  if (MULTI_CORRECT_QUESTION_KINDS.has(kind) && correctOptionCount < 1)
    throw validationError(
      'This question kind requires at least one correct option',
    );
  const options = optionsInput.map((option) => {
    const optionLanguages = new Set(
      option.translations.map(({ language }) => language),
    );
    if (
      optionLanguages.size !== option.translations.length ||
      optionLanguages.size !== languages.size ||
      [...languages].some((language) => !optionLanguages.has(language))
    )
      throw validationError(
        'Every option must contain the same unique languages as its question',
      );
    return {
      isCorrect: option.isCorrect,
      translations: option.translations.map(({ language, text }) => ({
        language,
        text: requiredText(text, 'option text', 2000),
      })),
    };
  });
  const maxSelections = optionalPositiveInteger(
    input.maxSelections,
    'maxSelections',
  );
  if (
    maxSelections !== null &&
    (!MULTI_CORRECT_QUESTION_KINDS.has(kind) || maxSelections > options.length)
  )
    throw validationError(
      'maxSelections is allowed only for multi-select questions and must fit the options',
    );
  const answerLimit = optionalPositiveInteger(input.answerLimit, 'answerLimit');
  if (answerLimit !== null && !TEXT_QUESTION_KINDS.has(kind))
    throw validationError(
      'answerLimit is allowed only for short- and long-text questions',
    );
  const acceptedAnswerValues = (input.acceptedAnswers ?? []).map((answer) => {
    const displayValue = requiredText(answer, 'accepted answer', 500);
    return {
      displayValue,
      normalizedValue: normalizeObjectiveText(displayValue),
    };
  });
  if (
    new Set(acceptedAnswerValues.map(({ normalizedValue }) => normalizedValue))
      .size !== acceptedAnswerValues.length ||
    acceptedAnswerValues.length > 20
  )
    throw validationError(
      'acceptedAnswers must contain at most 20 unique normalized values',
    );
  if ((kind === QuestionKind.SHORT_TEXT) !== acceptedAnswerValues.length > 0)
    throw validationError('Only short-text questions require acceptedAnswers');
  return {
    acceptedAnswers: acceptedAnswerValues.map((answer, index) => ({
      ...answer,
      position: index + 1,
    })),
    answerLimit,
    kind,
    maxSelections,
    options,
    sectionId: input.sectionId ? parseUuid(input.sectionId, 'sectionId') : null,
    translations: translationsInput.map(({ language, prompt }) => ({
      language,
      prompt: requiredText(prompt, 'prompt', 10_000),
      rationale: optionalText(
        translationsInput.find((item) => item.language === language)?.rationale,
        'rationale',
        10_000,
      ),
    })),
  };
}

async function createOptions(
  tx: Prisma.TransactionClient,
  questionId: string,
  options: {
    isCorrect: boolean;
    translations: { language: Language; text: string }[];
  }[],
) {
  for (const [index, option] of options.entries()) {
    await tx.answerOption.create({
      data: {
        isCorrect: option.isCorrect,
        position: index + 1,
        questionId,
        translations: { createMany: { data: option.translations } },
      },
    });
  }
}

interface PublishValidationIssue {
  code: string;
  severity: 'ERROR';
  path: string;
  message: string;
}

function addPublishIssue(
  issues: PublishValidationIssue[],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ code, severity: 'ERROR', path, message });
}

function validatePublishable(version: VersionRecord): void {
  const [issue] = collectPublishValidationIssues(version);
  if (issue !== undefined) throw validationError(issue.message);
}

function collectPublishValidationIssues(
  version: VersionRecord,
): PublishValidationIssue[] {
  const issues: PublishValidationIssue[] = [];
  if (!hasLanguage(version.translations, version.primaryLanguage)) {
    addPublishIssue(
      issues,
      'PRIMARY_TRANSLATION_REQUIRED',
      'translations',
      'The primary test translation is required',
    );
  }
  if (version.questions.length === 0) {
    addPublishIssue(
      issues,
      'QUESTION_REQUIRED',
      'questions',
      'A test must contain at least one question',
    );
  }
  for (const question of version.questions) {
    const questionPath = `questions.${String(question.position)}`;
    if (!hasLanguage(question.translations, version.primaryLanguage)) {
      addPublishIssue(
        issues,
        'QUESTION_PRIMARY_TRANSLATION_REQUIRED',
        `${questionPath}.translations`,
        `Question ${String(question.position)} is missing its primary translation`,
      );
    }
    const languages = new Set(
      question.translations.map(({ language }) => language),
    );
    if (
      question.options.some(
        (option) =>
          option.translations.length !== languages.size ||
          option.translations.some(({ language }) => !languages.has(language)),
      )
    ) {
      addPublishIssue(
        issues,
        'QUESTION_TRANSLATIONS_INCOMPLETE',
        `${questionPath}.options`,
        `Question ${String(question.position)} has incomplete translations`,
      );
    }
    collectPublishableQuestionIssues(question, questionPath, issues);
    if (version.test.skill !== null && question.section === null) {
      addPublishIssue(
        issues,
        'QUESTION_SECTION_REQUIRED',
        `${questionPath}.sectionId`,
        `Question ${String(question.position)} must belong to a section`,
      );
    }
  }
  collectPublishableSectionIssues(version, issues);
  if (
    version.availabilityStartsAt !== null &&
    version.availabilityEndsAt !== null &&
    version.availabilityEndsAt <= version.availabilityStartsAt
  ) {
    addPublishIssue(
      issues,
      'AVAILABILITY_WINDOW_INVALID',
      'availabilityEndsAt',
      'The availability window is invalid',
    );
  }
  const expectedScoringRule =
    version.test.skill === null
      ? 'single-choice-v1'
      : [QuestionKind.LONG_TEXT, QuestionKind.AUDIO_RESPONSE].some((kind) =>
            version.questions.some((question) => question.kind === kind),
          )
        ? 'manual-rubric-v1'
        : 'objective-v2';
  if (version.scoringRuleVersion !== expectedScoringRule) {
    addPublishIssue(
      issues,
      'SCORING_RULE_UNSUPPORTED',
      'scoringRuleVersion',
      'The scoring rule version is not supported',
    );
  }
  return issues;
}

function collectPublishableQuestionIssues(
  question: VersionRecord['questions'][number],
  path: string,
  issues: PublishValidationIssue[],
): void {
  const correctOptionCount = question.options.filter(
    ({ isCorrect }) => isCorrect,
  ).length;
  if (
    SINGLE_CORRECT_QUESTION_KINDS.has(question.kind) &&
    (question.options.length < 2 || correctOptionCount !== 1)
  ) {
    addPublishIssue(
      issues,
      'QUESTION_CORRECT_OPTION_REQUIRED',
      `${path}.options`,
      `Question ${String(question.position)} requires one correct option`,
    );
  }
  if (
    MULTI_CORRECT_QUESTION_KINDS.has(question.kind) &&
    (question.options.length < 2 || correctOptionCount < 1)
  ) {
    addPublishIssue(
      issues,
      'QUESTION_CORRECT_OPTIONS_REQUIRED',
      `${path}.options`,
      `Question ${String(question.position)} requires correct options`,
    );
  }
  if (
    !OPTION_QUESTION_KINDS.has(question.kind) &&
    question.options.length > 0
  ) {
    addPublishIssue(
      issues,
      'QUESTION_OPTIONS_UNSUPPORTED',
      `${path}.options`,
      `Question ${String(question.position)} does not accept options`,
    );
  }
  if (
    question.kind === QuestionKind.SHORT_TEXT &&
    question.acceptedAnswers.length === 0
  ) {
    addPublishIssue(
      issues,
      'QUESTION_ACCEPTED_ANSWERS_REQUIRED',
      `${path}.acceptedAnswers`,
      `Question ${String(question.position)} requires accepted answers`,
    );
  }
  if (
    question.kind !== QuestionKind.SHORT_TEXT &&
    question.acceptedAnswers.length > 0
  ) {
    addPublishIssue(
      issues,
      'QUESTION_ACCEPTED_ANSWERS_UNSUPPORTED',
      `${path}.acceptedAnswers`,
      `Question ${String(question.position)} has unsupported accepted answers`,
    );
  }
}

function collectPublishableSectionIssues(
  version: VersionRecord,
  issues: PublishValidationIssue[],
): void {
  if (version.test.skill === null) return;
  if (version.sections.length === 0) {
    addPublishIssue(
      issues,
      'SECTION_REQUIRED',
      'sections',
      'IELTS skill tests require ordered sections',
    );
  }
  const groupedQuestionIds = new Set<string>();
  let usesBlocks = false;
  for (const section of version.sections) {
    const sectionPath = `sections.${String(section.position)}`;
    const primarySection = section.translations.find(
      ({ language }) => language === version.primaryLanguage,
    );
    if (!primarySection?.title.trim() || !primarySection.instructions.trim()) {
      addPublishIssue(
        issues,
        'SECTION_PRIMARY_TRANSLATION_REQUIRED',
        `${sectionPath}.translations`,
        `Section ${String(section.position)} is missing its primary translation`,
      );
    }
    usesBlocks ||= section.blocks.length > 0;
    for (const block of section.blocks) {
      collectPublishableBlockIssues(
        block,
        version.primaryLanguage,
        `${sectionPath}.blocks.${String(block.position)}`,
        issues,
      );
      for (const { questionId } of block.questions) {
        if (groupedQuestionIds.has(questionId)) {
          addPublishIssue(
            issues,
            'QUESTION_GROUP_DUPLICATE',
            `${sectionPath}.blocks.${String(block.position)}.questionIds`,
            'A question may appear in only one question group',
          );
        }
        groupedQuestionIds.add(questionId);
      }
    }
  }
  if (usesBlocks) {
    for (const question of version.questions) {
      if (!groupedQuestionIds.has(question.id)) {
        addPublishIssue(
          issues,
          'QUESTION_GROUP_ASSIGNMENT_REQUIRED',
          `questions.${String(question.position)}`,
          'Every question must appear in an ordered question group',
        );
      }
    }
  }

  const questionCounts = version.sections.map(
    (section) =>
      version.questions.filter(
        ({ section: questionSection }) => questionSection?.id === section.id,
      ).length,
  );
  if (version.test.skill === 'READING') {
    for (const [index, section] of version.sections.entries()) {
      if (
        (questionCounts[index] ?? 0) === 0 ||
        (!section.translations.some(({ content }) =>
          Boolean(content?.trim()),
        ) &&
          !section.blocks.some(({ kind }) =>
            READING_CONTENT_BLOCK_KINDS.has(kind),
          ))
      ) {
        addPublishIssue(
          issues,
          'READING_SECTION_INCOMPLETE',
          `sections.${String(section.position)}`,
          'Every Reading section requires content and questions',
        );
      }
    }
  }
  if (
    version.test.skill === 'LISTENING' &&
    !version.sections.some(
      (section) =>
        (section.mediaObject !== null &&
          section.mediaObject.status === MediaObjectStatus.READY &&
          section.mediaObject.malwareStatus === MediaMalwareStatus.CLEAN) ||
        section.blocks.some(({ kind }) => kind === TestSectionBlockKind.AUDIO),
    )
  ) {
    addPublishIssue(
      issues,
      'LISTENING_AUDIO_REQUIRED',
      'sections',
      'Listening requires authorized audio',
    );
  }
  if (version.test.skill === 'WRITING') {
    const valid =
      version.sections.length === 2 &&
      version.sections.every(
        (section, index) =>
          (questionCounts[index] ?? 0) === 1 &&
          version.questions.find(
            ({ section: questionSection }) =>
              questionSection?.id === section.id,
          )?.kind === QuestionKind.LONG_TEXT &&
          section.minimumWords !== null &&
          section.suggestedMinutes !== null,
      );
    if (!valid) {
      addPublishIssue(
        issues,
        'WRITING_STRUCTURE_INVALID',
        'sections',
        'Writing requires two timed tasks with one long-text response each',
      );
    }
  }
  if (version.test.skill === 'SPEAKING') {
    const [part1Count = 0, part2Count = 0, part3Count = 0] = questionCounts;
    const part2 = version.sections[1];
    const valid =
      version.sections.length === 3 &&
      part1Count >= 1 &&
      part2Count === 1 &&
      part3Count >= 1 &&
      version.questions.every(
        ({ kind }) => kind === QuestionKind.AUDIO_RESPONSE,
      ) &&
      typeof part2?.preparationSeconds === 'number' &&
      typeof part2.responseSeconds === 'number';
    if (!valid) {
      addPublishIssue(
        issues,
        'SPEAKING_STRUCTURE_INVALID',
        'sections',
        'Speaking requires three parts, one timed Part 2 cue card, and audio responses',
      );
    }
  }
}

function collectPublishableBlockIssues(
  block: VersionRecord['sections'][number]['blocks'][number],
  primaryLanguage: Language,
  path: string,
  issues: PublishValidationIssue[],
): void {
  const primary = block.translations.find(
    ({ language }) => language === primaryLanguage,
  );
  if (
    block.kind !== TestSectionBlockKind.QUESTION_GROUP &&
    primary === undefined
  ) {
    addPublishIssue(
      issues,
      'BLOCK_PRIMARY_TRANSLATION_REQUIRED',
      `${path}.translations`,
      `Block ${String(block.position)} is missing its primary translation`,
    );
  }
  if (TEXT_BLOCK_KINDS.has(block.kind) && !primary?.text?.trim()) {
    addPublishIssue(
      issues,
      'BLOCK_TEXT_REQUIRED',
      `${path}.text`,
      `Block ${String(block.position)} requires text`,
    );
  }
  if (block.kind === TestSectionBlockKind.IMAGE && !primary?.altText?.trim()) {
    addPublishIssue(
      issues,
      'IMAGE_ALT_TEXT_REQUIRED',
      `${path}.altText`,
      `Block ${String(block.position)} requires alt text`,
    );
  }
  if (CAPTION_BLOCK_KINDS.has(block.kind) && !primary?.caption?.trim()) {
    addPublishIssue(
      issues,
      'BLOCK_CAPTION_REQUIRED',
      `${path}.caption`,
      `Block ${String(block.position)} requires a caption`,
    );
  }
  if (
    MEDIA_BLOCK_KINDS.has(block.kind) &&
    (block.mediaObject?.status !== MediaObjectStatus.READY ||
      block.mediaObject.malwareStatus !== MediaMalwareStatus.CLEAN)
  ) {
    addPublishIssue(
      issues,
      'BLOCK_MEDIA_NOT_READY',
      `${path}.mediaObjectId`,
      `Block ${String(block.position)} requires verified clean media`,
    );
  }
  if (
    block.kind === TestSectionBlockKind.IMAGE &&
    (block.mediaObject?.widthPixels === null ||
      block.mediaObject?.heightPixels === null)
  ) {
    addPublishIssue(
      issues,
      'IMAGE_DIMENSIONS_REQUIRED',
      `${path}.mediaObjectId`,
      'Image blocks require intrinsic dimensions',
    );
  }
  if (
    block.kind === TestSectionBlockKind.AUDIO &&
    block.mediaObject?.durationSeconds === null
  ) {
    addPublishIssue(
      issues,
      'AUDIO_DURATION_REQUIRED',
      `${path}.mediaObjectId`,
      'Audio blocks require a verified duration',
    );
  }
  if (
    block.kind === TestSectionBlockKind.QUESTION_GROUP &&
    block.questions.length === 0
  ) {
    addPublishIssue(
      issues,
      'QUESTION_GROUP_EMPTY',
      `${path}.questionIds`,
      'Question-group blocks cannot be empty',
    );
  }
  if (
    block.kind === TestSectionBlockKind.TABLE &&
    mapTablePayload(block.tablePayload).headerRows.length === 0 &&
    mapTablePayload(block.tablePayload).rows.length === 0
  ) {
    addPublishIssue(
      issues,
      'TABLE_ROWS_REQUIRED',
      `${path}.tableRows`,
      'Table blocks require validated rows',
    );
  }
}

function hasLanguage(
  translations: readonly { language: Language }[],
  language: Language,
): boolean {
  return translations.some((translation) => translation.language === language);
}

function mapTablePayload(value: Prisma.JsonValue | null): {
  headerRows: string[][];
  rows: string[][];
} {
  if (value === null || Array.isArray(value) || typeof value !== 'object')
    return { headerRows: [], rows: [] };
  return {
    headerRows: parseTableRows(value.headerRows),
    rows: parseTableRows(value.rows),
  };
}

function parseTableRows(value: Prisma.JsonValue | undefined): string[][] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is string[] =>
      Array.isArray(row) && row.every((cell) => typeof cell === 'string'),
  );
}

function mapVersion(version: VersionRecord): TeacherTestVersionObject {
  return {
    attemptLimit: version.attemptLimit,
    availabilityEndsAt: version.availabilityEndsAt,
    availabilityStartsAt: version.availabilityStartsAt,
    durationMinutes: version.durationMinutes,
    id: version.id,
    passingPercentage: version.passingPercentage,
    primaryLanguage: version.primaryLanguage,
    publishedAt: version.publishedAt,
    questions: version.questions.map((question) => ({
      acceptedAnswers: question.acceptedAnswers.map(
        ({ displayValue }) => displayValue,
      ),
      answerLimit: question.answerLimit,
      id: question.id,
      kind: question.kind,
      maxSelections: question.maxSelections,
      options: question.options.map((option) => ({
        id: option.id,
        isCorrect: option.isCorrect,
        position: option.position,
        translations: option.translations,
      })),
      position: question.position,
      sectionId: question.section?.id ?? null,
      sectionPosition: question.section?.position ?? null,
      translations: question.translations,
    })),
    sections: version.sections.map((section) => ({
      blocks: section.blocks.map((block) => {
        const table = mapTablePayload(block.tablePayload);
        return {
          headingLevel: block.headingLevel,
          id: block.id,
          kind: block.kind,
          mediaDurationSeconds: block.mediaObject?.durationSeconds ?? null,
          mediaHeightPixels: block.mediaObject?.heightPixels ?? null,
          mediaObjectId: block.mediaObjectId,
          mediaWidthPixels: block.mediaObject?.widthPixels ?? null,
          position: block.position,
          questionIds: block.questions.map(({ questionId }) => questionId),
          tableHeaderRows: table.headerRows.map((cells) => ({ cells })),
          tableRows: table.rows.map((cells) => ({ cells })),
          translations: block.translations,
        };
      }),
      id: section.id,
      mediaObjectId: section.mediaObjectId,
      minimumWords: section.minimumWords,
      position: section.position,
      preparationSeconds: section.preparationSeconds,
      responseSeconds: section.responseSeconds,
      suggestedMinutes: section.suggestedMinutes,
      translations: section.translations,
    })),
    scoringRuleVersion: version.scoringRuleVersion,
    status: version.status,
    testId: version.testId,
    translations: version.translations,
    version: version.version,
  };
}

function mapTest(test: {
  archivedAt: Date | null;
  category: { id: string; name: string };
  createdAt: Date;
  groupId: string;
  id: string;
  status: ContentStatus;
  updatedAt: Date;
  versions: VersionRecord[];
}): TeacherTestObject {
  const latest = test.versions[0];
  return {
    archivedAt: test.archivedAt,
    category: test.category,
    createdAt: test.createdAt,
    groupId: test.groupId,
    id: test.id,
    latestVersion: latest === undefined ? null : mapVersion(latest),
    status: test.status,
    updatedAt: test.updatedAt,
  };
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  correlationId?: string,
  newValues?: Prisma.InputJsonValue,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      action,
      actorId,
      correlationId: correlationId ?? null,
      ...(newValues === undefined ? {} : { newValues }),
      targetId,
      targetType,
    },
  });
}

function requiredText(value: string, field: string, maximum: number): string {
  const text = value.trim();
  if (text.length === 0 || text.length > maximum)
    throw validationError(
      `${field} must contain between 1 and ${String(maximum)} characters`,
    );
  return text;
}

function optionalText(
  value: string | null | undefined,
  field: string,
  maximum: number,
): string | null {
  if (value === undefined || value === null) return null;
  const text = value.trim();
  if (text.length > maximum)
    throw validationError(
      `${field} must not exceed ${String(maximum)} characters`,
    );
  return text.length === 0 ? null : text;
}

function normalizeObjectiveText(value: string): string {
  return value.trim().toLocaleLowerCase('en').replace(/\s+/gu, ' ');
}

function skillLabel(skill: TestSkill): string {
  return skill.charAt(0) + skill.slice(1).toLocaleLowerCase('en');
}

function validationError(message: string): ApplicationError {
  return new ApplicationError(ErrorCode.BAD_USER_INPUT, message, 400);
}
function notFound(): ApplicationError {
  return new ApplicationError(
    ErrorCode.NOT_FOUND,
    'The requested test resource was not found',
    404,
  );
}
function uniqueError(error: unknown, message: string): ApplicationError {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  )
    return new ApplicationError(ErrorCode.CONFLICT, message, 409);
  throw error;
}

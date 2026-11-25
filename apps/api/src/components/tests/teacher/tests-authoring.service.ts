import {
  ContentStatus,
  Language,
  TestSkill,
  TestVersionStatus,
  UserRole,
  UserStatus,
} from '@best/database';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { ApplicationError } from '../../../libs/errors/application.error';
import {
  decodeCursor,
  encodeCursor,
  parsePageSize,
  parseUuid,
} from '../../../libs/pagination/cursor-pagination';
import type {
  AttemptGrantConnectionObject,
  TeacherTestConnectionObject,
} from '../../../schemas/tests/authoring/teacher-test-connection.object';
import type {
  CreateTestDraftInput,
  ReplaceTestDraftTranslationsInput,
  UpdateTestDraftSettingsInput,
} from '../../../schemas/tests/authoring/test-draft.input';
import type { CreateTestPaperSkillDraftInput } from '../../../schemas/tests/authoring/teacher-test-paper.input';
import type { GrantAdditionalTestAttemptInput } from '../../../schemas/tests/authoring/teacher-test.input';
import type {
  AttemptGrantObject,
  TeacherTestObject,
  TestCategoryObject,
} from '../../../schemas/tests/authoring/teacher-test.object';
import type {
  TeacherTestDraftValidationObject,
  TeacherTestVersionObject,
} from '../../../schemas/tests/authoring/test-draft.object';
import { TestDraftAccessService } from '../authoring/test-draft-access.service';
import { versionInclude } from '../authoring/test-version-record';
import {
  parseSettings,
  parseTestTranslations,
  requiredText,
  skillLabel,
} from '../authoring/test-draft-parsing';
import { collectPublishValidationIssues } from '../authoring/test-publication-validation';
import { mapVersion, mapTest } from '../authoring/test-version-mapping';
import { writeAudit } from '../authoring/test-authoring-audit';
import {
  validationError,
  notFound,
  uniqueError,
} from '../authoring/test-authoring-errors';

@Injectable()
export class TestsAuthoringService {
  constructor(
    private readonly database: DatabaseService,
    private readonly testDraftAccessService: TestDraftAccessService,
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
      await this.testDraftAccessService.requireOwnedVersion(
        teacherId,
        versionIdInput,
      ),
    );
  }

  async validateDraft(
    teacherId: string,
    testVersionId: string,
  ): Promise<TeacherTestDraftValidationObject> {
    const version = await this.testDraftAccessService.requireDraft(
      teacherId,
      testVersionId,
    );
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
    const updated = await this.testDraftAccessService.withDraft(
      teacherId,
      { id: parseUuid(input.testVersionId, 'testVersionId') },
      input.expectedUpdatedAt,
      async (tx, version) => {
        const values = parseSettings(input);

        const row = await tx.testVersion.update({
          where: { id: version.id },
          data: { ...values, updatedAt: version.updatedAt },
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
      },
    );
    return mapVersion(updated);
  }

  async replaceTranslations(
    teacherId: string,
    input: ReplaceTestDraftTranslationsInput,
    correlationId?: string,
  ): Promise<TeacherTestVersionObject> {
    const updated = await this.testDraftAccessService.withDraft(
      teacherId,
      { id: parseUuid(input.testVersionId, 'testVersionId') },
      input.expectedUpdatedAt,
      async (tx, version) => {
        const translations = parseTestTranslations(
          input.translations,
          version.primaryLanguage,
        );

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
      },
    );
    return mapVersion(updated);
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
}

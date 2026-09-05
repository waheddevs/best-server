import {
  ContentStatus,
  Language,
  Prisma,
  TestVersionStatus,
  UserRole,
  UserStatus,
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
import type {
  AttemptGrantConnectionObject,
  TeacherTestConnectionObject,
} from '../../schemas/tests/teacher-test-connection.object';
import type {
  AnswerOptionDraftInput,
  CreateTestDraftInput,
  CreateTestQuestionInput,
  GrantAdditionalTestAttemptInput,
  ReplaceTestDraftTranslationsInput,
  TestTranslationInput,
  UpdateTestDraftSettingsInput,
  UpdateTestQuestionInput,
} from '../../schemas/tests/teacher-test.input';
import type {
  AttemptGrantObject,
  TeacherTestObject,
  TeacherTestVersionObject,
  TestCategoryObject,
} from '../../schemas/tests/teacher-test.object';

const versionInclude = {
  questions: {
    include: {
      options: {
        include: { translations: { orderBy: { language: 'asc' } } },
        orderBy: { position: 'asc' },
      },
      translations: { orderBy: { language: 'asc' } },
    },
    orderBy: { position: 'asc' },
  },
  translations: { orderBy: { language: 'asc' } },
} satisfies Prisma.TestVersionInclude;

type VersionRecord = Prisma.TestVersionGetPayload<{
  include: typeof versionInclude;
}>;

@Injectable()
export class TestsAuthoringService {
  constructor(private readonly database: DatabaseService) {}

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

  async createQuestion(
    teacherId: string,
    input: CreateTestQuestionInput,
    correlationId?: string,
  ): Promise<TeacherTestVersionObject> {
    const version = await this.requireDraft(teacherId, input.testVersionId);
    const question = parseQuestion(
      input.translations,
      input.options,
      version.primaryLanguage,
    );
    const updated = await this.database.$transaction(async (tx) => {
      const count = await tx.question.count({
        where: { testVersionId: version.id },
      });
      const created = await tx.question.create({
        data: {
          position: count + 1,
          testVersionId: version.id,
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
        id: true,
        testVersion: { select: { id: true, primaryLanguage: true } },
      },
    });
    if (existing === null) throw notFound();
    const values = parseQuestion(
      input.translations,
      input.options,
      existing.testVersion.primaryLanguage,
    );
    const updated = await this.database.$transaction(async (tx) => {
      await tx.answerOption.deleteMany({ where: { questionId } });
      await tx.questionTranslation.deleteMany({ where: { questionId } });
      await tx.questionTranslation.createMany({
        data: values.translations.map((row) => ({ ...row, questionId })),
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
      for (const question of latest.questions) {
        const copiedQuestion = await tx.question.create({
          data: {
            position: question.position,
            testVersionId: row.id,
            translations: {
              createMany: {
                data: question.translations.map(({ language, prompt }) => ({
                  language,
                  prompt,
                })),
              },
            },
          },
        });
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

function parseQuestion(
  translationsInput: { language: Language; prompt: string }[],
  optionsInput: AnswerOptionDraftInput[],
  primaryLanguage: Language,
) {
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
  if (optionsInput.length < 2 || optionsInput.length > 10)
    throw validationError('A question must contain between 2 and 10 options');
  if (optionsInput.filter(({ isCorrect }) => isCorrect).length !== 1)
    throw validationError(
      'A single-choice question must have exactly one correct option',
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
  return {
    options,
    translations: translationsInput.map(({ language, prompt }) => ({
      language,
      prompt: requiredText(prompt, 'prompt', 10_000),
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

function validatePublishable(version: VersionRecord): void {
  if (
    version.translations.length === 0 ||
    !version.translations.some(
      ({ language }) => language === version.primaryLanguage,
    )
  )
    throw validationError('The primary test translation is required');
  if (version.questions.length === 0)
    throw validationError('A test must contain at least one question');
  for (const question of version.questions) {
    if (
      question.translations.length === 0 ||
      question.options.length < 2 ||
      question.options.filter(({ isCorrect }) => isCorrect).length !== 1
    )
      throw validationError(
        `Question ${String(question.position)} is incomplete`,
      );
    const languages = new Set(
      question.translations.map(({ language }) => language),
    );
    if (
      !languages.has(version.primaryLanguage) ||
      question.options.some(
        (option) =>
          option.translations.length !== languages.size ||
          option.translations.some(({ language }) => !languages.has(language)),
      )
    )
      throw validationError(
        `Question ${String(question.position)} has incomplete translations`,
      );
  }
  if (
    version.availabilityStartsAt !== null &&
    version.availabilityEndsAt !== null &&
    version.availabilityEndsAt <= version.availabilityStartsAt
  )
    throw validationError('The availability window is invalid');
  if (version.scoringRuleVersion !== 'single-choice-v1')
    throw validationError('The scoring rule version is not supported');
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
      id: question.id,
      options: question.options.map((option) => ({
        id: option.id,
        isCorrect: option.isCorrect,
        position: option.position,
        translations: option.translations,
      })),
      position: question.position,
      translations: question.translations,
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
  value: string | undefined,
  field: string,
  maximum: number,
): string | null {
  if (value === undefined) return null;
  const text = value.trim();
  if (text.length > maximum)
    throw validationError(
      `${field} must not exceed ${String(maximum)} characters`,
    );
  return text.length === 0 ? null : text;
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

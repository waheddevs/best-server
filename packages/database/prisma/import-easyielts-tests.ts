import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type * as DatabasePackage from '../src/index.ts';

const require = createRequire(import.meta.url);
const {
  ContentStatus,
  createDatabaseClient,
  EASYIELTS_SOURCE_SYSTEM,
  IeltsModule,
  Language,
  MediaMalwareStatus,
  MediaObjectStatus,
  MediaType,
  normalizeEasyIeltsCatalog,
  stableEasyIeltsUuid,
  TestSectionBlockKind,
  TestSkill,
  TestVersionStatus,
} = require('../dist/src/index.js') as typeof DatabasePackage;

type NormalizedTest = DatabasePackage.NormalizedEasyIeltsTest;
type Tx = Parameters<Parameters<typeof database.$transaction>[0]>[0];

const database = createDatabaseClient();
const expectedCounts = {
  listening: 10,
  questions: 192,
  reading: 10,
  sections: 49,
  speaking: 9,
  writing: 10,
} as const;
const sourceModules = [
  {
    exportName: 'communityHallTest',
    relativePath: 'content/tests/listening/gt-community-hall.ts',
  },
  {
    exportName: 'moreListeningTests',
    relativePath: 'content/tests/listening/more-listening.ts',
  },
  {
    exportName: 'toolLibrariesTest',
    relativePath: 'content/tests/reading/gt-tool-libraries.ts',
  },
  {
    exportName: 'moreReadingTests',
    relativePath: 'content/tests/reading/more-reading.ts',
  },
  {
    exportName: 'writingTest001',
    relativePath: 'content/tests/writing/gt-writing-001.ts',
  },
  {
    exportName: 'moreWritingTests',
    relativePath: 'content/tests/writing/more-writing.ts',
  },
  {
    exportName: 'moreSpeakingTests',
    relativePath: 'content/tests/speaking/more-speaking.ts',
  },
] as const;

interface ImportOptions {
  readonly apply: boolean;
  readonly categoryId: string;
  readonly groupId: string;
  readonly mediaMapPath: string | undefined;
  readonly sourceDir: string;
  readonly startPracticeNumber: number;
}

async function main(): Promise<void> {
  assertLocalDevelopmentDatabase();
  const options = parseOptions(process.argv.slice(2));
  const sourceValues = await loadSourceValues(options.sourceDir);
  const catalog = normalizeEasyIeltsCatalog(sourceValues);
  assertExpectedCatalog(catalog.counts);
  const target = await requireTarget(options.groupId, options.categoryId);
  const mediaMap = await readMediaMap(options.mediaMapPath);
  const mediaByPath = await validateMediaMap(mediaMap, target.teacherId);
  const plans = createPaperPlans(
    catalog.sourceTests,
    target.id,
    options.startPracticeNumber,
  );
  const preview = await preflight(plans, target.id);
  const missingAssetPaths = [
    ...new Set(
      catalog.sourceTests.flatMap((test) =>
        test.sections.flatMap((section) =>
          section.audioPath !== null && !mediaByPath.has(section.audioPath)
            ? [section.audioPath]
            : [],
        ),
      ),
    ),
  ];

  process.stdout.write(
    `${JSON.stringify(
      {
        apply: options.apply,
        counts: catalog.counts,
        missingAssetPaths,
        papersToCreate: preview.papersToCreate,
        sourceTestsToCreate: preview.sourceTestsToCreate,
        sourceTestsUnchanged: preview.sourceTestsUnchanged,
        targetCategoryId: options.categoryId,
        targetGroupId: target.id,
      },
      null,
      2,
    )}\n`,
  );
  if (!options.apply) {
    process.stdout.write(
      'Dry run only. Pass --apply to import the reviewed catalog.\n',
    );
    return;
  }

  let createdPapers = 0;
  let createdSourceTests = 0;
  let skippedSourceTests = 0;
  for (const plan of plans) {
    const result = await database.$transaction(async (tx) => {
      const paper = await ensurePaper(tx, plan, target.teacherId, target.id);
      let created = 0;
      let skipped = 0;
      for (const sourceTest of plan.sourceTests) {
        const outcome = await importSourceTest(tx, {
          categoryId: options.categoryId,
          groupId: target.id,
          mediaByPath,
          paperId: paper.id,
          sourceTest,
          teacherId: target.teacherId,
        });
        if (outcome === 'created') created += 1;
        else skipped += 1;
      }
      return { created, paperCreated: paper.created, skipped };
    });
    if (result.paperCreated) createdPapers += 1;
    createdSourceTests += result.created;
    skippedSourceTests += result.skipped;
  }

  process.stdout.write(
    `${JSON.stringify(
      { createdPapers, createdSourceTests, skippedSourceTests },
      null,
      2,
    )}\n`,
  );
}

interface PaperPlan {
  readonly id: string;
  readonly practiceNumber: number;
  readonly slug: string;
  readonly sourceTests: readonly NormalizedTest[];
  readonly title: string;
}

function createPaperPlans(
  tests: readonly NormalizedTest[],
  groupId: string,
  startPracticeNumber: number,
): PaperPlan[] {
  const bySkill = new Map<DatabasePackage.TestSkill, NormalizedTest[]>();
  for (const skill of Object.values(TestSkill)) bySkill.set(skill, []);
  for (const sourceTest of tests)
    bySkill.get(sourceTest.skill)?.push(sourceTest);
  const maximum = Math.max(
    ...[...bySkill.values()].map((items) => items.length),
  );
  return Array.from({ length: maximum }, (_, index) => {
    const practiceNumber = startPracticeNumber + index;
    return {
      id: stableEasyIeltsUuid(`${groupId}:paper:${String(index + 1)}`),
      practiceNumber,
      slug: `easyielts-gt-practice-${String(index + 1)}`,
      sourceTests: [...bySkill.values()].flatMap((items) =>
        items[index] === undefined ? [] : [items[index]],
      ),
      title: `BEST LC General Training Practice ${String(index + 1)}`,
    };
  });
}

async function preflight(
  plans: readonly PaperPlan[],
  groupId: string,
): Promise<{
  papersToCreate: number;
  sourceTestsToCreate: number;
  sourceTestsUnchanged: number;
}> {
  let papersToCreate = 0;
  let sourceTestsToCreate = 0;
  let sourceTestsUnchanged = 0;
  for (const plan of plans) {
    const collisions = await database.testPaper.findMany({
      where: {
        groupId,
        OR: [
          { id: plan.id },
          { practiceNumber: plan.practiceNumber },
          { slug: plan.slug },
        ],
      },
      select: {
        id: true,
        ieltsModule: true,
        practiceNumber: true,
        slug: true,
      },
    });
    if (collisions.length === 0) papersToCreate += 1;
    else assertMatchingPaper(collisions, plan);
    for (const sourceTest of plan.sourceTests) {
      const provenance = await database.testImportSource.findFirst({
        where: {
          externalId: sourceTest.externalId,
          sourceSystem: EASYIELTS_SOURCE_SYSTEM,
          targetGroupId: groupId,
        },
        select: { sourceSha256: true, testVersionId: true },
      });
      if (provenance === null) sourceTestsToCreate += 1;
      else {
        assertMatchingProvenance(provenance, sourceTest, groupId);
        sourceTestsUnchanged += 1;
      }
    }
  }
  return { papersToCreate, sourceTestsToCreate, sourceTestsUnchanged };
}

async function ensurePaper(
  tx: Tx,
  plan: PaperPlan,
  teacherId: string,
  groupId: string,
): Promise<{ created: boolean; id: string }> {
  const collisions = await tx.testPaper.findMany({
    where: {
      groupId,
      OR: [
        { id: plan.id },
        { practiceNumber: plan.practiceNumber },
        { slug: plan.slug },
      ],
    },
    select: {
      id: true,
      ieltsModule: true,
      practiceNumber: true,
      slug: true,
    },
  });
  if (collisions.length > 0) {
    assertMatchingPaper(collisions, plan);
    return { created: false, id: plan.id };
  }
  await tx.testPaper.create({
    data: {
      academicYear: 2026,
      createdById: teacherId,
      groupId,
      id: plan.id,
      ieltsModule: IeltsModule.GENERAL_TRAINING,
      practiceNumber: plan.practiceNumber,
      slug: plan.slug,
      sourceLabel:
        'Imported from the user-permitted easyIELTS static General Training catalog.',
      title: plan.title,
    },
  });
  return { created: true, id: plan.id };
}

function assertMatchingPaper(
  collisions: readonly {
    readonly id: string;
    readonly ieltsModule: DatabasePackage.IeltsModule;
    readonly practiceNumber: number;
    readonly slug: string;
  }[],
  plan: PaperPlan,
): void {
  if (
    collisions.length !== 1 ||
    collisions[0]?.id !== plan.id ||
    collisions[0].practiceNumber !== plan.practiceNumber ||
    collisions[0].slug !== plan.slug ||
    collisions[0].ieltsModule !== IeltsModule.GENERAL_TRAINING
  ) {
    throw new Error(
      `Practice ${String(plan.practiceNumber)} conflicts with an existing paper`,
    );
  }
}

async function importSourceTest(
  tx: Tx,
  input: {
    readonly categoryId: string;
    readonly groupId: string;
    readonly mediaByPath: ReadonlyMap<string, string>;
    readonly paperId: string;
    readonly sourceTest: NormalizedTest;
    readonly teacherId: string;
  },
): Promise<'created' | 'skipped'> {
  const { sourceTest } = input;
  const versionId = stableEasyIeltsUuid(
    `${input.groupId}:version:${sourceTest.externalId}:1`,
  );
  const provenance = await tx.testImportSource.findFirst({
    where: {
      externalId: sourceTest.externalId,
      sourceSystem: EASYIELTS_SOURCE_SYSTEM,
      targetGroupId: input.groupId,
    },
    select: { sourceSha256: true, testVersionId: true },
  });
  if (provenance !== null) {
    assertMatchingProvenance(provenance, sourceTest, input.groupId);
    return 'skipped';
  }
  const occupiedSkill = await tx.test.findUnique({
    where: {
      paperId_skill: { paperId: input.paperId, skill: sourceTest.skill },
    },
    select: { id: true },
  });
  if (occupiedSkill !== null) {
    throw new Error(
      `${sourceTest.skill} is already occupied in paper ${input.paperId}`,
    );
  }
  const testId = stableEasyIeltsUuid(
    `${input.groupId}:test:${sourceTest.externalId}`,
  );
  await tx.test.create({
    data: {
      categoryId: input.categoryId,
      groupId: input.groupId,
      id: testId,
      paperId: input.paperId,
      skill: sourceTest.skill,
      status: ContentStatus.ACTIVE,
    },
  });
  await tx.testVersion.create({
    data: {
      attemptLimit: 1,
      durationMinutes: sourceTest.durationMinutes,
      id: versionId,
      passingPercentage: 60,
      primaryLanguage: Language.EN,
      scoringRuleVersion:
        sourceTest.skill === TestSkill.LISTENING ||
        sourceTest.skill === TestSkill.READING
          ? 'objective-v2'
          : 'manual-rubric-v1',
      status: TestVersionStatus.DRAFT,
      testId,
      version: 1,
    },
  });
  await tx.testTranslation.create({
    data: {
      id: stableEasyIeltsUuid(`${versionId}:translation:en`),
      language: Language.EN,
      testVersionId: versionId,
      title: sourceTest.title,
    },
  });

  let globalQuestionPosition = 1;
  for (const [sectionIndex, section] of sourceTest.sections.entries()) {
    const sectionId = stableEasyIeltsUuid(
      `${versionId}:section:${section.externalId}`,
    );
    const mediaObjectId =
      section.audioPath === null
        ? null
        : (input.mediaByPath.get(section.audioPath) ?? null);
    await tx.testSection.create({
      data: {
        id: sectionId,
        mediaObjectId,
        minimumWords: section.minimumWords,
        position: sectionIndex + 1,
        preparationSeconds: section.preparationSeconds,
        responseSeconds: section.responseSeconds,
        suggestedMinutes: section.suggestedMinutes,
        testVersionId: versionId,
      },
    });
    await tx.testSectionTranslation.create({
      data: {
        content: section.content,
        id: stableEasyIeltsUuid(`${sectionId}:translation:en`),
        instructions: section.instructions,
        language: Language.EN,
        testSectionId: sectionId,
        title: section.title,
      },
    });

    let blockPosition = 1;
    if (sourceTest.skill === TestSkill.READING && section.content !== null) {
      await createTextBlock(tx, {
        headingLevel: 2,
        id: stableEasyIeltsUuid(`${sectionId}:block:heading`),
        kind: TestSectionBlockKind.HEADING,
        position: blockPosition,
        sectionId,
        text: section.title,
      });
      blockPosition += 1;
      await createTextBlock(tx, {
        headingLevel: null,
        id: stableEasyIeltsUuid(`${sectionId}:block:content`),
        kind: TestSectionBlockKind.RICH_TEXT,
        position: blockPosition,
        sectionId,
        text: section.content,
      });
      blockPosition += 1;
    }
    if (mediaObjectId !== null) {
      const blockId = stableEasyIeltsUuid(`${sectionId}:block:audio`);
      await tx.testSectionBlock.create({
        data: {
          id: blockId,
          kind: TestSectionBlockKind.AUDIO,
          mediaObjectId,
          position: blockPosition,
          testSectionId: sectionId,
        },
      });
      await tx.testSectionBlockTranslation.create({
        data: {
          altText: `Listening audio for ${section.title}`,
          caption: section.title,
          id: stableEasyIeltsUuid(`${blockId}:translation:en`),
          language: Language.EN,
          testSectionBlockId: blockId,
        },
      });
      blockPosition += 1;
    }
    const questionGroupId = stableEasyIeltsUuid(`${sectionId}:block:questions`);
    await tx.testSectionBlock.create({
      data: {
        id: questionGroupId,
        kind: TestSectionBlockKind.QUESTION_GROUP,
        position: blockPosition,
        testSectionId: sectionId,
      },
    });

    for (const [questionIndex, question] of section.questions.entries()) {
      const questionId = stableEasyIeltsUuid(
        `${versionId}:question:${section.externalId}:${question.externalId}`,
      );
      await tx.question.create({
        data: {
          answerLimit: question.answerLimit,
          id: questionId,
          kind: question.kind,
          position: globalQuestionPosition,
          sectionId,
          testVersionId: versionId,
        },
      });
      globalQuestionPosition += 1;
      await tx.questionTranslation.create({
        data: {
          id: stableEasyIeltsUuid(`${questionId}:translation:en`),
          language: Language.EN,
          prompt: question.prompt,
          questionId,
        },
      });
      for (const [answerIndex, answer] of question.acceptedAnswers.entries()) {
        await tx.questionAcceptedAnswer.create({
          data: {
            displayValue: answer.displayValue,
            id: stableEasyIeltsUuid(
              `${questionId}:answer:${answer.normalizedValue}`,
            ),
            normalizedValue: answer.normalizedValue,
            position: answerIndex + 1,
            questionId,
          },
        });
      }
      for (const [optionIndex, option] of question.options.entries()) {
        const optionId = stableEasyIeltsUuid(
          `${questionId}:option:${option.externalValue}`,
        );
        await tx.answerOption.create({
          data: {
            id: optionId,
            isCorrect: option.isCorrect,
            position: optionIndex + 1,
            questionId,
          },
        });
        await tx.answerOptionTranslation.create({
          data: {
            answerOptionId: optionId,
            id: stableEasyIeltsUuid(`${optionId}:translation:en`),
            language: Language.EN,
            text: option.text,
          },
        });
      }
      await tx.testSectionBlockQuestion.create({
        data: {
          position: questionIndex + 1,
          questionId,
          testSectionBlockId: questionGroupId,
        },
      });
    }
  }

  await tx.testImportSource.create({
    data: {
      externalId: sourceTest.externalId,
      id: stableEasyIeltsUuid(
        `${input.groupId}:provenance:${sourceTest.externalId}`,
      ),
      sourcePath: sourceTest.sourcePath,
      sourceSha256: sourceTest.sourceSha256,
      sourceSystem: EASYIELTS_SOURCE_SYSTEM,
      targetGroupId: input.groupId,
      testVersionId: versionId,
    },
  });
  await tx.auditLog.create({
    data: {
      action: 'EASYIELTS_TEST_IMPORTED',
      actorId: input.teacherId,
      newValues: {
        externalId: sourceTest.externalId,
        sourceSha256: sourceTest.sourceSha256,
        sourceSystem: EASYIELTS_SOURCE_SYSTEM,
      },
      targetId: versionId,
      targetType: 'TEST_VERSION',
    },
  });
  return 'created';
}

async function createTextBlock(
  tx: Tx,
  input: {
    readonly headingLevel: number | null;
    readonly id: string;
    readonly kind:
      | typeof TestSectionBlockKind.HEADING
      | typeof TestSectionBlockKind.RICH_TEXT;
    readonly position: number;
    readonly sectionId: string;
    readonly text: string;
  },
): Promise<void> {
  await tx.testSectionBlock.create({
    data: {
      headingLevel: input.headingLevel,
      id: input.id,
      kind: input.kind,
      position: input.position,
      testSectionId: input.sectionId,
    },
  });
  await tx.testSectionBlockTranslation.create({
    data: {
      id: stableEasyIeltsUuid(`${input.id}:translation:en`),
      language: Language.EN,
      testSectionBlockId: input.id,
      text: input.text,
    },
  });
}

function assertMatchingProvenance(
  provenance: { readonly sourceSha256: string; readonly testVersionId: string },
  sourceTest: NormalizedTest,
  groupId: string,
): void {
  const expectedVersionId = stableEasyIeltsUuid(
    `${groupId}:version:${sourceTest.externalId}:1`,
  );
  if (
    provenance.sourceSha256 !== sourceTest.sourceSha256 ||
    provenance.testVersionId !== expectedVersionId
  ) {
    throw new Error(
      `Source drift detected for easyIELTS test ${sourceTest.externalId}`,
    );
  }
}

async function requireTarget(groupId: string, categoryId: string) {
  const group = await database.group.findFirst({
    where: { id: groupId, status: ContentStatus.ACTIVE },
    select: { category: true, id: true, teacherId: true },
  });
  if (group === null) throw new Error('Target active group was not found');
  if (group.category !== 'IELTS') throw new Error('Target group must be IELTS');
  const category = await database.testCategory.findFirst({
    where: { id: categoryId, teacherId: group.teacherId },
    select: { id: true },
  });
  if (category === null) {
    throw new Error('Target test category is not owned by the group Teacher');
  }
  return group;
}

async function validateMediaMap(
  mediaMap: Readonly<Record<string, string>>,
  teacherId: string,
): Promise<ReadonlyMap<string, string>> {
  const result = new Map<string, string>();
  for (const [sourcePath, mediaObjectId] of Object.entries(mediaMap)) {
    const media = await database.mediaObject.findFirst({
      where: {
        createdById: teacherId,
        id: mediaObjectId,
        malwareStatus: MediaMalwareStatus.CLEAN,
        mediaType: MediaType.AUDIO,
        status: MediaObjectStatus.READY,
      },
      select: { id: true },
    });
    if (media === null) {
      throw new Error(
        `Mapped audio is not a Teacher-owned READY + CLEAN object: ${sourcePath}`,
      );
    }
    result.set(sourcePath, media.id);
  }
  return result;
}

async function readMediaMap(
  mediaMapPath: string | undefined,
): Promise<Readonly<Record<string, string>>> {
  if (mediaMapPath === undefined) return {};
  const parsed: unknown = JSON.parse(await readFile(mediaMapPath, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('--media-map must contain a JSON object');
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'string' || !isUuid(value)) {
      throw new Error(`Invalid media UUID for ${key}`);
    }
    result[key] = value;
  }
  return result;
}

async function loadSourceValues(
  sourceDir: string,
): Promise<DatabasePackage.EasyIeltsSourceValue[]> {
  const values: DatabasePackage.EasyIeltsSourceValue[] = [];
  for (const source of sourceModules) {
    const absolutePath = resolve(sourceDir, source.relativePath);
    assertInsideSourceDir(sourceDir, absolutePath);
    const module: unknown = await import(pathToFileURL(absolutePath).href);
    if (typeof module !== 'object' || module === null) {
      throw new Error(`Could not load ${source.relativePath}`);
    }
    const exported = Reflect.get(module, source.exportName) as unknown;
    const tests = Array.isArray(exported) ? exported : [exported];
    for (const value of tests) {
      values.push({ sourcePath: source.relativePath, value });
    }
  }
  return values;
}

function assertInsideSourceDir(sourceDir: string, absolutePath: string): void {
  const root = resolve(sourceDir);
  const relativePath = relative(root, absolutePath);
  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error('easyIELTS source path escaped the configured directory');
  }
}

function assertExpectedCatalog(counts: NormalizedCountShape): void {
  for (const [key, expected] of Object.entries(expectedCounts)) {
    if (counts[key as keyof NormalizedCountShape] !== expected) {
      throw new Error(
        `easyIELTS ${key} count changed; expected ${String(expected)}`,
      );
    }
  }
}

interface NormalizedCountShape {
  readonly listening: number;
  readonly questions: number;
  readonly reading: number;
  readonly sections: number;
  readonly speaking: number;
  readonly writing: number;
}

function parseOptions(arguments_: readonly string[]): ImportOptions {
  const sourceDir =
    optionalOption(arguments_, '--source-dir') ??
    resolve(dirname(fileURLToPath(import.meta.url)), 'easyielts-source');
  const groupId = requiredUuidOption(arguments_, '--group-id');
  const categoryId = requiredUuidOption(arguments_, '--category-id');
  const startValue = optionalOption(arguments_, '--start-practice-number');
  const startPracticeNumber = startValue === undefined ? 1 : Number(startValue);
  if (!Number.isInteger(startPracticeNumber) || startPracticeNumber < 1) {
    throw new Error('--start-practice-number must be a positive integer');
  }
  return {
    apply: arguments_.includes('--apply'),
    categoryId,
    groupId,
    mediaMapPath: optionalOption(arguments_, '--media-map'),
    sourceDir,
    startPracticeNumber,
  };
}

function requiredUuidOption(
  arguments_: readonly string[],
  name: string,
): string {
  const value = requiredOption(arguments_, name);
  if (!isUuid(value)) throw new Error(`${name} must be a UUID`);
  return value;
}

function requiredOption(arguments_: readonly string[], name: string): string {
  const value = optionalOption(arguments_, name);
  if (value === undefined) throw new Error(`${name} is required`);
  return value;
}

function optionalOption(
  arguments_: readonly string[],
  name: string,
): string | undefined {
  const index = arguments_.indexOf(name);
  const value = index < 0 ? undefined : arguments_[index + 1];
  if (index >= 0 && (value === undefined || value.startsWith('--'))) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function assertLocalDevelopmentDatabase(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('easyIELTS import is disabled in production');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const host = new URL(databaseUrl).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error('easyIELTS import is limited to loopback PostgreSQL');
  }
}

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Unknown import error'}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => database.$disconnect());

import type { ContentStatus, Prisma } from '@best/database';
import type { TeacherTestObject } from '../../../schemas/tests/authoring/teacher-test.object';
import type { TeacherTestVersionObject } from '../../../schemas/tests/authoring/test-draft.object';
import { type VersionRecord } from './test-version-record';

export function mapTablePayload(value: Prisma.JsonValue | null): {
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

export function parseTableRows(
  value: Prisma.JsonValue | undefined,
): string[][] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is string[] =>
      Array.isArray(row) && row.every((cell) => typeof cell === 'string'),
  );
}

export function mapVersion(version: VersionRecord): TeacherTestVersionObject {
  return {
    updatedAt: version.updatedAt,
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

export function mapTest(test: {
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

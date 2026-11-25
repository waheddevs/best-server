import type { Language, Prisma, TestSkill } from '@best/database';
import { QuestionKind, TestSectionBlockKind } from '@best/database';
import { parseUuid } from '../../../libs/pagination/cursor-pagination';
import type {
  CreateTestSectionBlockInput,
  UpdateTestSectionBlockInput,
} from '../../../schemas/tests/authoring/test-section-block.input';
import type {
  CreateTestSectionInput,
  UpdateTestSectionInput,
} from '../../../schemas/tests/authoring/test-section.input';
import type {
  CreateTestQuestionInput,
  UpdateTestQuestionInput,
} from '../../../schemas/tests/authoring/test-question.input';
import type {
  TestTranslationInput,
  UpdateTestDraftSettingsInput,
} from '../../../schemas/tests/authoring/test-draft.input';
import { normalizeObjectiveText } from '@best/scoring';
import { validationError } from './test-authoring-errors';

export function parseSettings(input: UpdateTestDraftSettingsInput) {
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

export function parseSection(
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

export function parseSectionTranslations(
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

export function optionalPositiveInteger(
  value: number | null | undefined,
  field: string,
): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || value < 1)
    throw validationError(`${field} must be a positive whole number`);
  return value;
}

export async function requireCompleteOrderedIds(
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

export function parseTestTranslations(
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

export function parseSectionBlock(
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

export function parseSectionBlockTranslations(
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

export function parseTableRowInputs(
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

export function parseQuestion(
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

export async function createOptions(
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

export function requiredText(
  value: string,
  field: string,
  maximum: number,
): string {
  const text = value.trim();
  if (text.length === 0 || text.length > maximum)
    throw validationError(
      `${field} must contain between 1 and ${String(maximum)} characters`,
    );
  return text;
}

export function optionalText(
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

export function skillLabel(skill: TestSkill): string {
  return skill.charAt(0) + skill.slice(1).toLocaleLowerCase('en');
}

export const OPTION_QUESTION_KINDS = new Set<QuestionKind>([
  QuestionKind.MATCHING,
  QuestionKind.MULTIPLE_CHOICE,
  QuestionKind.SINGLE_CHOICE,
  QuestionKind.TRUE_FALSE_NOT_GIVEN,
  QuestionKind.YES_NO_NOT_GIVEN,
]);

export const SINGLE_CORRECT_QUESTION_KINDS = new Set<QuestionKind>([
  QuestionKind.SINGLE_CHOICE,
  QuestionKind.TRUE_FALSE_NOT_GIVEN,
  QuestionKind.YES_NO_NOT_GIVEN,
]);

export const MULTI_CORRECT_QUESTION_KINDS = new Set<QuestionKind>([
  QuestionKind.MATCHING,
  QuestionKind.MULTIPLE_CHOICE,
]);

export const TEXT_QUESTION_KINDS = new Set<QuestionKind>([
  QuestionKind.LONG_TEXT,
  QuestionKind.SHORT_TEXT,
]);

export const MEDIA_BLOCK_KINDS = new Set<TestSectionBlockKind>([
  TestSectionBlockKind.AUDIO,
  TestSectionBlockKind.IMAGE,
]);

export const TEXT_BLOCK_KINDS = new Set<TestSectionBlockKind>([
  TestSectionBlockKind.HEADING,
  TestSectionBlockKind.RICH_TEXT,
]);

export const CAPTION_BLOCK_KINDS = new Set<TestSectionBlockKind>([
  TestSectionBlockKind.AUDIO,
  TestSectionBlockKind.TABLE,
]);

export const READING_CONTENT_BLOCK_KINDS = new Set<TestSectionBlockKind>([
  TestSectionBlockKind.IMAGE,
  TestSectionBlockKind.RICH_TEXT,
  TestSectionBlockKind.TABLE,
]);

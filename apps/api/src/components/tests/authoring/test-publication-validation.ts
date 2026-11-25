import type { Language } from '@best/database';
import {
  MediaMalwareStatus,
  MediaObjectStatus,
  QuestionKind,
  TestSectionBlockKind,
} from '@best/database';
import { type VersionRecord } from './test-version-record';
import {
  OPTION_QUESTION_KINDS,
  SINGLE_CORRECT_QUESTION_KINDS,
  MULTI_CORRECT_QUESTION_KINDS,
  MEDIA_BLOCK_KINDS,
  TEXT_BLOCK_KINDS,
  CAPTION_BLOCK_KINDS,
  READING_CONTENT_BLOCK_KINDS,
} from './test-draft-parsing';
import { mapTablePayload } from './test-version-mapping';
import { validationError } from './test-authoring-errors';

export interface PublishValidationIssue {
  code: string;
  severity: 'ERROR';
  path: string;
  message: string;
}

export function addPublishIssue(
  issues: PublishValidationIssue[],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ code, severity: 'ERROR', path, message });
}

export function validatePublishable(version: VersionRecord): void {
  const [issue] = collectPublishValidationIssues(version);
  if (issue !== undefined) throw validationError(issue.message);
}

export function collectPublishValidationIssues(
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

export function collectPublishableQuestionIssues(
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

export function collectPublishableSectionIssues(
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

export function collectPublishableBlockIssues(
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

export function hasLanguage(
  translations: readonly { language: Language }[],
  language: Language,
): boolean {
  return translations.some((translation) => translation.language === language);
}

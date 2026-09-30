import { createHash } from 'node:crypto';

import { QuestionKind, TestSkill } from './generated/enums';

export const EASYIELTS_SOURCE_SYSTEM = 'easyielts-static-v1';

export interface EasyIeltsSourceValue {
  readonly sourcePath: string;
  readonly value: unknown;
}

export interface NormalizedEasyIeltsCatalog {
  readonly sourceTests: readonly NormalizedEasyIeltsTest[];
  readonly counts: {
    readonly listening: number;
    readonly questions: number;
    readonly reading: number;
    readonly sections: number;
    readonly speaking: number;
    readonly writing: number;
  };
}

export interface NormalizedEasyIeltsTest {
  readonly durationMinutes: number;
  readonly externalId: string;
  readonly sections: readonly NormalizedEasyIeltsSection[];
  readonly skill: TestSkill;
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly title: string;
}

export interface NormalizedEasyIeltsSection {
  readonly audioPath: string | null;
  readonly content: string | null;
  readonly externalId: string;
  readonly instructions: string;
  readonly minimumWords: number | null;
  readonly preparationSeconds: number | null;
  readonly questions: readonly NormalizedEasyIeltsQuestion[];
  readonly responseSeconds: number | null;
  readonly suggestedMinutes: number | null;
  readonly title: string;
}

export interface NormalizedEasyIeltsQuestion {
  readonly acceptedAnswers: readonly {
    readonly displayValue: string;
    readonly normalizedValue: string;
  }[];
  readonly answerLimit: number | null;
  readonly externalId: string;
  readonly kind: QuestionKind;
  readonly options: readonly {
    readonly externalValue: string;
    readonly isCorrect: boolean;
    readonly text: string;
  }[];
  readonly position: number;
  readonly prompt: string;
}

export function normalizeEasyIeltsCatalog(
  sources: readonly EasyIeltsSourceValue[],
): NormalizedEasyIeltsCatalog {
  const sourceTests = sources.map(({ sourcePath, value }) =>
    normalizeTest(sourcePath, value),
  );
  const ids = new Set<string>();
  for (const test of sourceTests) {
    if (ids.has(test.externalId)) {
      throw new Error(`Duplicate easyIELTS test id: ${test.externalId}`);
    }
    ids.add(test.externalId);
  }
  return {
    sourceTests,
    counts: {
      listening: sourceTests.filter(
        ({ skill }) => skill === TestSkill.LISTENING,
      ).length,
      questions: sourceTests.reduce(
        (total, test) =>
          total +
          test.sections.reduce(
            (sectionTotal, section) => sectionTotal + section.questions.length,
            0,
          ),
        0,
      ),
      reading: sourceTests.filter(({ skill }) => skill === TestSkill.READING)
        .length,
      sections: sourceTests.reduce(
        (total, test) => total + test.sections.length,
        0,
      ),
      speaking: sourceTests.filter(({ skill }) => skill === TestSkill.SPEAKING)
        .length,
      writing: sourceTests.filter(({ skill }) => skill === TestSkill.WRITING)
        .length,
    },
  };
}

export function stableEasyIeltsUuid(key: string): string {
  const bytes = createHash('sha256')
    .update(`${EASYIELTS_SOURCE_SYSTEM}:${key}`, 'utf8')
    .digest()
    .subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizeTest(
  sourcePath: string,
  value: unknown,
): NormalizedEasyIeltsTest {
  const record = requireRecord(value, sourcePath);
  const externalId = requiredString(record.id, `${sourcePath}.id`);
  const title = requiredString(record.title, `${sourcePath}.title`);
  const skill = requiredString(record.skill, `${sourcePath}.skill`);
  let normalized: Omit<NormalizedEasyIeltsTest, 'sourceSha256'>;

  if (skill === 'reading' || skill === 'listening') {
    const testSkill =
      skill === 'reading' ? TestSkill.READING : TestSkill.LISTENING;
    const durationMinutes = requiredPositiveInteger(
      record.timeMinutes,
      `${sourcePath}.timeMinutes`,
    );
    const sections = requireArray(
      record.sections,
      `${sourcePath}.sections`,
    ).map((section, sectionIndex) =>
      normalizeObjectiveSection(sourcePath, testSkill, section, sectionIndex),
    );
    normalized = {
      durationMinutes,
      externalId,
      sections,
      skill: testSkill,
      sourcePath,
      title,
    };
  } else if (skill === 'writing') {
    normalized = {
      durationMinutes: 60,
      externalId,
      sections: requireArray(record.tasks, `${sourcePath}.tasks`).map(
        (task, taskIndex) => normalizeWritingTask(sourcePath, task, taskIndex),
      ),
      skill: TestSkill.WRITING,
      sourcePath,
      title,
    };
  } else if (skill === 'speaking') {
    normalized = {
      durationMinutes: 14,
      externalId,
      sections: [normalizeSpeakingPart(sourcePath, record)],
      skill: TestSkill.SPEAKING,
      sourcePath,
      title,
    };
  } else {
    throw new Error(`Unsupported easyIELTS skill at ${sourcePath}: ${skill}`);
  }

  return {
    ...normalized,
    sourceSha256: createHash('sha256')
      .update(JSON.stringify(normalized), 'utf8')
      .digest('hex'),
  };
}

function normalizeObjectiveSection(
  sourcePath: string,
  skill: typeof TestSkill.LISTENING | typeof TestSkill.READING,
  value: unknown,
  sectionIndex: number,
): NormalizedEasyIeltsSection {
  const path = `${sourcePath}.sections[${String(sectionIndex)}]`;
  const record = requireRecord(value, path);
  const questions = requireArray(record.questions, `${path}.questions`).map(
    (question, questionIndex) =>
      normalizeObjectiveQuestion(path, question, questionIndex),
  );
  if (skill === TestSkill.READING) {
    const paragraphs = requireArray(
      record.passageParagraphs,
      `${path}.passageParagraphs`,
    ).map((paragraph, index) =>
      requiredString(paragraph, `${path}.passageParagraphs[${String(index)}]`),
    );
    return {
      audioPath: null,
      content: paragraphs.join('\n\n'),
      externalId: requiredString(record.id, `${path}.id`),
      instructions: 'Read the passage and answer all questions.',
      minimumWords: null,
      preparationSeconds: null,
      questions,
      responseSeconds: null,
      suggestedMinutes: null,
      title: requiredString(
        record.passageTitle ?? record.name,
        `${path}.passageTitle`,
      ),
    };
  }
  return {
    audioPath:
      record.audioUrl === undefined
        ? null
        : requiredString(record.audioUrl, `${path}.audioUrl`),
    content: requiredString(record.script, `${path}.script`),
    externalId: requiredString(record.id, `${path}.id`),
    instructions: 'Listen to the recording and answer all questions.',
    minimumWords: null,
    preparationSeconds: null,
    questions,
    responseSeconds: null,
    suggestedMinutes: null,
    title: requiredString(record.name, `${path}.name`),
  };
}

function normalizeObjectiveQuestion(
  sectionPath: string,
  value: unknown,
  questionIndex: number,
): NormalizedEasyIeltsQuestion {
  const path = `${sectionPath}.questions[${String(questionIndex)}]`;
  const record = requireRecord(value, path);
  const type = requiredString(record.type, `${path}.type`);
  const accepted = requireArray(record.accepted, `${path}.accepted`).map(
    (answer, index) => {
      const displayValue = requiredString(
        answer,
        `${path}.accepted[${String(index)}]`,
      );
      return {
        displayValue,
        normalizedValue: normalizeAnswer(displayValue),
      };
    },
  );
  const position = requiredPositiveInteger(record.number, `${path}.number`);
  const shared = {
    answerLimit:
      record.wordLimit === undefined
        ? null
        : requiredPositiveInteger(record.wordLimit, `${path}.wordLimit`),
    externalId: requiredString(record.id, `${path}.id`),
    position,
    prompt: requiredString(record.prompt, `${path}.prompt`),
  };

  if (type === 'sentence_completion' || type === 'short_answer') {
    return {
      ...shared,
      acceptedAnswers: uniqueAnswers(accepted),
      kind: QuestionKind.SHORT_TEXT,
      options: [],
    };
  }

  if (type === 'single_choice') {
    const options = requireArray(record.options, `${path}.options`).map(
      (option, optionIndex) => {
        const optionRecord = requireRecord(
          option,
          `${path}.options[${String(optionIndex)}]`,
        );
        const externalValue = requiredString(
          optionRecord.value,
          `${path}.options[${String(optionIndex)}].value`,
        );
        return {
          externalValue,
          isCorrect: accepted.some(
            ({ normalizedValue }) =>
              normalizedValue === normalizeAnswer(externalValue),
          ),
          text: requiredString(
            optionRecord.label,
            `${path}.options[${String(optionIndex)}].label`,
          ),
        };
      },
    );
    if (options.filter(({ isCorrect }) => isCorrect).length !== 1) {
      throw new Error(`${path} must identify exactly one correct option`);
    }
    return {
      ...shared,
      acceptedAnswers: [],
      kind: QuestionKind.SINGLE_CHOICE,
      options,
    };
  }

  if (type === 'true_false_notgiven' || type === 'yes_no_notgiven') {
    const definitions =
      type === 'true_false_notgiven'
        ? [
            ['true', 'True'],
            ['false', 'False'],
            ['not given', 'Not given'],
          ]
        : [
            ['yes', 'Yes'],
            ['no', 'No'],
            ['not given', 'Not given'],
          ];
    const options = definitions.map(([externalValue, text]) => ({
      externalValue: externalValue ?? '',
      isCorrect: accepted.some(
        ({ normalizedValue }) => normalizedValue === (externalValue ?? ''),
      ),
      text: text ?? '',
    }));
    if (options.filter(({ isCorrect }) => isCorrect).length !== 1) {
      throw new Error(`${path} must identify exactly one correct option`);
    }
    return {
      ...shared,
      acceptedAnswers: [],
      kind:
        type === 'true_false_notgiven'
          ? QuestionKind.TRUE_FALSE_NOT_GIVEN
          : QuestionKind.YES_NO_NOT_GIVEN,
      options,
    };
  }

  throw new Error(`Unsupported easyIELTS question type at ${path}: ${type}`);
}

function normalizeWritingTask(
  sourcePath: string,
  value: unknown,
  taskIndex: number,
): NormalizedEasyIeltsSection {
  const path = `${sourcePath}.tasks[${String(taskIndex)}]`;
  const record = requireRecord(value, path);
  const taskNumber = requiredPositiveInteger(
    record.taskNumber,
    `${path}.taskNumber`,
  );
  const instructions = requiredString(
    record.instructions,
    `${path}.instructions`,
  );
  const minimumWords = requiredPositiveInteger(
    record.minWords,
    `${path}.minWords`,
  );
  return {
    audioPath: null,
    content: null,
    externalId: `task-${String(taskNumber)}`,
    instructions,
    minimumWords,
    preparationSeconds: null,
    questions: [
      {
        acceptedAnswers: [],
        answerLimit: null,
        externalId: `task-${String(taskNumber)}-response`,
        kind: QuestionKind.LONG_TEXT,
        options: [],
        position: taskNumber,
        prompt: instructions,
      },
    ],
    responseSeconds: null,
    suggestedMinutes: taskNumber === 1 ? 20 : 40,
    title: `Task ${String(taskNumber)}`,
  };
}

function normalizeSpeakingPart(
  sourcePath: string,
  record: Readonly<Record<string, unknown>>,
): NormalizedEasyIeltsSection {
  const part = requiredString(record.part, `${sourcePath}.part`);
  if (part !== '1' && part !== '2' && part !== '3') {
    throw new Error(`Unsupported Speaking part at ${sourcePath}: ${part}`);
  }
  const topic = requiredString(record.topic, `${sourcePath}.topic`);
  return {
    audioPath: null,
    content: null,
    externalId: `part-${part}`,
    instructions: topic,
    minimumWords: null,
    preparationSeconds: part === '2' ? 60 : null,
    questions: [
      {
        acceptedAnswers: [],
        answerLimit: null,
        externalId: `part-${part}-response`,
        kind: QuestionKind.AUDIO_RESPONSE,
        options: [],
        position: 1,
        prompt: topic,
      },
    ],
    responseSeconds: part === '2' ? 120 : 300,
    suggestedMinutes: part === '2' ? 3 : 5,
    title: `Speaking Part ${part}`,
  };
}

function normalizeAnswer(value: string): string {
  return value.trim().toLocaleLowerCase('en').replaceAll(/\s+/g, ' ');
}

function uniqueAnswers(
  values: NormalizedEasyIeltsQuestion['acceptedAnswers'],
): NormalizedEasyIeltsQuestion['acceptedAnswers'] {
  const normalizedValues = new Set<string>();
  return values.filter(({ normalizedValue }) => {
    if (normalizedValues.has(normalizedValue)) return false;
    normalizedValues.add(normalizedValue);
    return true;
  });
}

function requireRecord(
  value: unknown,
  path: string,
): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function requireArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${path} must be a non-empty array`);
  }
  return value;
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value.trim();
}

function requiredPositiveInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new Error(`${path} must be a positive integer`);
  }
  return Number(value);
}

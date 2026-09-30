import assert from 'node:assert/strict';
import { test } from 'node:test';

import { QuestionKind, TestSkill } from '../src/generated/enums';
import {
  normalizeEasyIeltsCatalog,
  stableEasyIeltsUuid,
} from '../src/easyielts-import';

void test('normalizes objective easyIELTS content without leaking keys into prompts', () => {
  const catalog = normalizeEasyIeltsCatalog([
    {
      sourcePath: 'content/tests/reading/example.ts',
      value: {
        id: 'gt-reading-example',
        sections: [
          {
            id: 's1',
            name: 'Section 1',
            passageParagraphs: ['First paragraph.', 'Second paragraph.'],
            passageTitle: 'Example passage',
            questions: [
              {
                accepted: ['B'],
                id: 'q1',
                number: 1,
                options: [
                  { label: 'First option', value: 'A' },
                  { label: 'Second option', value: 'B' },
                ],
                prompt: 'Choose one.',
                type: 'single_choice',
              },
              {
                accepted: ['  Mixed   Case  '],
                id: 'q2',
                number: 2,
                prompt: 'Complete the answer.',
                type: 'short_answer',
                wordLimit: 2,
              },
            ],
          },
        ],
        skill: 'reading',
        timeMinutes: 20,
        title: 'Reading example',
        variant: 'general-training',
      },
    },
  ]);

  assert.deepEqual(catalog.counts, {
    listening: 0,
    questions: 2,
    reading: 1,
    sections: 1,
    speaking: 0,
    writing: 0,
  });
  const sourceTest = catalog.sourceTests[0];
  assert.ok(sourceTest);
  const section = sourceTest.sections[0];
  assert.ok(section);
  const firstQuestion = section.questions[0];
  const secondQuestion = section.questions[1];
  assert.ok(firstQuestion);
  assert.ok(secondQuestion);
  assert.equal(sourceTest.skill, TestSkill.READING);
  assert.equal(section.content, 'First paragraph.\n\nSecond paragraph.');
  assert.equal(firstQuestion.kind, QuestionKind.SINGLE_CHOICE);
  assert.deepEqual(
    firstQuestion.options.map(({ isCorrect, text }) => ({
      isCorrect,
      text,
    })),
    [
      { isCorrect: false, text: 'First option' },
      { isCorrect: true, text: 'Second option' },
    ],
  );
  assert.deepEqual(secondQuestion.acceptedAnswers, [
    {
      displayValue: 'Mixed   Case',
      normalizedValue: 'mixed case',
    },
  ]);
  assert.match(sourceTest.sourceSha256, /^[0-9a-f]{64}$/);
});

void test('normalizes Writing and standalone Speaking as reviewable drafts', () => {
  const catalog = normalizeEasyIeltsCatalog([
    {
      sourcePath: 'content/tests/writing/example.ts',
      value: {
        id: 'gt-writing-example',
        skill: 'writing',
        tasks: [
          { instructions: 'Write a letter.', minWords: 150, taskNumber: 1 },
          { instructions: 'Write an essay.', minWords: 250, taskNumber: 2 },
        ],
        title: 'Writing example',
      },
    },
    {
      sourcePath: 'content/tests/speaking/example.ts',
      value: {
        id: 'gt-speaking-example',
        part: '2',
        skill: 'speaking',
        title: 'Speaking example',
        topic: 'Describe a useful object.',
      },
    },
  ]);

  const writingTest = catalog.sourceTests[0];
  const speakingTest = catalog.sourceTests[1];
  assert.ok(writingTest);
  assert.ok(speakingTest);
  const writingSection = writingTest.sections[0];
  const speakingSection = speakingTest.sections[0];
  assert.ok(writingSection);
  assert.ok(speakingSection);
  const writingQuestion = writingSection.questions[0];
  const speakingQuestion = speakingSection.questions[0];
  assert.ok(writingQuestion);
  assert.ok(speakingQuestion);
  assert.equal(writingTest.sections.length, 2);
  assert.equal(writingQuestion.kind, QuestionKind.LONG_TEXT);
  assert.equal(speakingSection.preparationSeconds, 60);
  assert.equal(speakingSection.responseSeconds, 120);
  assert.equal(speakingQuestion.kind, QuestionKind.AUDIO_RESPONSE);
});

void test('stable easyIELTS UUIDs are deterministic and key-specific', () => {
  const first = stableEasyIeltsUuid('group-1:test:gt-reading-example');
  assert.equal(first, stableEasyIeltsUuid('group-1:test:gt-reading-example'));
  assert.notEqual(
    first,
    stableEasyIeltsUuid('group-2:test:gt-reading-example'),
  );
  assert.match(
    first,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});

void test('rejects duplicate external test ids and unsupported source kinds', () => {
  const source = {
    sourcePath: 'content/tests/reading/example.ts',
    value: {
      id: 'duplicate',
      sections: [
        {
          id: 's1',
          passageParagraphs: ['Text.'],
          passageTitle: 'Passage',
          questions: [
            {
              accepted: ['true'],
              id: 'q1',
              number: 1,
              prompt: 'Statement.',
              type: 'true_false_notgiven',
            },
          ],
        },
      ],
      skill: 'reading',
      timeMinutes: 20,
      title: 'Duplicate',
    },
  } as const;
  assert.throws(
    () => normalizeEasyIeltsCatalog([source, source]),
    /Duplicate easyIELTS test id/,
  );
  assert.throws(
    () =>
      normalizeEasyIeltsCatalog([
        {
          sourcePath: 'unsupported.ts',
          value: { id: 'x', skill: 'grammar', title: 'Unsupported' },
        },
      ]),
    /Unsupported easyIELTS skill/,
  );
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isObjectiveAnswerCorrect,
  normalizeObjectiveText,
  resolveObjectiveOptionIds,
  scoreObjective,
  type ObjectiveQuestionScoreInput,
} from '../src';

void test('scores option sets and normalized short text deterministically', () => {
  const score = scoreObjective({
    passingPercentage: 75,
    questions: [
      {
        correctOptionIds: ['a'],
        kind: 'SINGLE_CHOICE',
        questionId: 'q1',
        selectedOptionIds: ['a'],
      },
      {
        correctOptionIds: ['a', 'c'],
        kind: 'MULTIPLE_CHOICE',
        questionId: 'q2',
        selectedOptionIds: ['c', 'a'],
      },
      {
        acceptedTextValues: ['town centre', 'town center'],
        kind: 'SHORT_TEXT',
        questionId: 'q3',
        textValue: '  Town   Centre ',
      },
      {
        correctOptionIds: ['true'],
        kind: 'TRUE_FALSE_NOT_GIVEN',
        questionId: 'q4',
      },
    ],
  });

  assert.deepEqual(score, {
    correctAnswerCount: 3,
    passed: true,
    percentage: 75,
    questions: [
      { correct: true, questionId: 'q1' },
      { correct: true, questionId: 'q2' },
      { correct: true, questionId: 'q3' },
      { correct: false, questionId: 'q4' },
    ],
    scoringRuleVersion: 'objective-v2',
    totalQuestionCount: 4,
  });
});

void test('requires an exact option set', () => {
  const score = scoreObjective({
    passingPercentage: 0,
    questions: [
      {
        correctOptionIds: ['a', 'b'],
        kind: 'MATCHING',
        questionId: 'q1',
        selectedOptionIds: ['a'],
      },
    ],
  });

  assert.equal(score.correctAnswerCount, 0);
});

void test('normalizes case and repeated whitespace only', () => {
  assert.equal(
    normalizeObjectiveText('  Broadbeach\n Town  '),
    'broadbeach town',
  );
});

void test('an empty selections relation preserves a single selected option', () => {
  const selectedOptionIds = resolveObjectiveOptionIds('correct', []);
  assert.equal(
    scoreObjective({
      passingPercentage: 60,
      questions: [
        {
          kind: 'SINGLE_CHOICE',
          questionId: 'q1',
          correctOptionIds: ['correct'],
          selectedOptionIds,
        },
      ],
    }).percentage,
    100,
  );
  assert.deepEqual(resolveObjectiveOptionIds(null, ['b', 'a']), ['b', 'a']);
  assert.deepEqual(resolveObjectiveOptionIds(undefined, []), []);
  assert.deepEqual(resolveObjectiveOptionIds(null), []);
});

void test('rejects duplicate question identities', () => {
  assert.throws(
    () =>
      scoreObjective({
        passingPercentage: 60,
        questions: [
          {
            correctOptionIds: ['a'],
            kind: 'SINGLE_CHOICE',
            questionId: 'duplicate',
          },
          {
            acceptedTextValues: ['answer'],
            kind: 'SHORT_TEXT',
            questionId: 'duplicate',
          },
        ],
      }),
    /question identifiers must be unique/,
  );
});

void test('per-answer result checks agree with worker scoring for every objective kind', () => {
  const questions: ObjectiveQuestionScoreInput[] = [
    ...(
      [
        'SINGLE_CHOICE',
        'TRUE_FALSE_NOT_GIVEN',
        'YES_NO_NOT_GIVEN',
        'MATCHING',
        'MULTIPLE_CHOICE',
      ] as const
    ).flatMap((kind) => [
      {
        kind,
        questionId: `${kind}-correct`,
        correctOptionIds: ['a', 'b'],
        selectedOptionIds: ['b', 'a'],
      },
      {
        kind,
        questionId: `${kind}-partial`,
        correctOptionIds: ['a', 'b'],
        selectedOptionIds: ['a'],
      },
      {
        kind,
        questionId: `${kind}-duplicate`,
        correctOptionIds: ['a', 'b'],
        selectedOptionIds: ['a', 'a'],
      },
      { kind, questionId: `${kind}-missing`, correctOptionIds: ['a'] },
    ]),
    {
      kind: 'SHORT_TEXT',
      questionId: 'text-correct',
      acceptedTextValues: ['town centre'],
      textValue: '  TOWN\n Centre ',
    },
    {
      kind: 'SHORT_TEXT',
      questionId: 'text-incorrect',
      acceptedTextValues: ['town centre'],
      textValue: 'town-center',
    },
    {
      kind: 'SHORT_TEXT',
      questionId: 'text-missing',
      acceptedTextValues: ['town centre'],
    },
  ];
  const worker = scoreObjective({ passingPercentage: 60, questions });
  for (const [index, question] of questions.entries()) {
    assert.equal(
      isObjectiveAnswerCorrect(question),
      worker.questions[index]?.correct,
    );
    assert.equal(
      isObjectiveAnswerCorrect(question),
      question.questionId.endsWith('-correct'),
    );
  }
  assert.throws(
    () =>
      isObjectiveAnswerCorrect({
        kind: 'SINGLE_CHOICE',
        questionId: 'broken',
        correctOptionIds: [],
      }),
    /correct option data is required/,
  );
});

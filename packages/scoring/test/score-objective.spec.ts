import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeObjectiveText, scoreObjective } from '../src';

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
  assert.equal(normalizeObjectiveText('  Broadbeach\n Town  '), 'broadbeach town');
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

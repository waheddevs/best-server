import assert from 'node:assert/strict';
import { test } from 'node:test';

import { scoreSingleChoice } from '../src';

void test('scores correct, incorrect, and unanswered questions deterministically', () => {
  const score = scoreSingleChoice({
    passingPercentage: 60,
    questions: [
      {
        correctOptionId: 'q1-correct',
        questionId: 'q1',
        selectedOptionId: 'q1-correct',
      },
      {
        correctOptionId: 'q2-correct',
        questionId: 'q2',
        selectedOptionId: 'q2-wrong',
      },
      { correctOptionId: 'q3-correct', questionId: 'q3' },
    ],
  });

  assert.deepEqual(score, {
    correctAnswerCount: 1,
    passed: false,
    percentage: 33.33,
    scoringRuleVersion: 'single-choice-v1',
    totalQuestionCount: 3,
  });
});

void test('uses the stored passing threshold at its exact boundary', () => {
  const score = scoreSingleChoice({
    passingPercentage: 50,
    questions: [
      {
        correctOptionId: 'correct-1',
        questionId: 'question-1',
        selectedOptionId: 'correct-1',
      },
      {
        correctOptionId: 'correct-2',
        questionId: 'question-2',
        selectedOptionId: 'wrong-2',
      },
    ],
  });

  assert.equal(score.percentage, 50);
  assert.equal(score.passed, true);
});

void test('rejects duplicate question identities', () => {
  assert.throws(
    () =>
      scoreSingleChoice({
        passingPercentage: 60,
        questions: [
          { correctOptionId: 'correct-1', questionId: 'duplicate' },
          { correctOptionId: 'correct-2', questionId: 'duplicate' },
        ],
      }),
    /question identifiers must be unique/,
  );
});

void test('rejects an empty test', () => {
  assert.throws(
    () => scoreSingleChoice({ passingPercentage: 60, questions: [] }),
    /at least one question is required/,
  );
});

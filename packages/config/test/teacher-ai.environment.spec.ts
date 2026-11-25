import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTeacherAiEnvironment } from '../src/teacher-ai.environment';

// Fictional values: these tests never contact a provider or database.
const source = {
  TEACHER_AI_CHAT_ENABLED: 'true',
  OPENROUTER_API_KEY: 'fictional-test-key',
  AI_CHAT_MODEL: 'fictional/teacher:free',
  AI_CHAT_PROVIDER_ENDPOINT: 'fictional/eu',
  AI_CHAT_PRIVACY_REVIEWED: 'true',
  AI_CHAT_RETENTION_DAYS: '7',
  AI_CHAT_PROCESSING_NOTICE_VERSION: 'fictional-v1',
  AI_CHAT_PILOT_TEACHER_IDS: 'a07ecadd-32b6-40aa-8925-537447893bd7',
};

void test('AI is disabled without secrets and ignores unused AI configuration', () => {
  assert.deepEqual(parseTeacherAiEnvironment({}), { enabled: false });
  assert.deepEqual(
    parseTeacherAiEnvironment({
      TEACHER_AI_CHAT_ENABLED: 'false',
      AI_CHAT_MODEL: 'paid',
      AI_CHAT_RETENTION_DAYS: 'invalid',
    }),
    { enabled: false },
  );
  assert.throws(() =>
    parseTeacherAiEnvironment({ TEACHER_AI_CHAT_ENABLED: 'yes' }),
  );
});

void test('free pilot config stays within no-credit quotas with no positive budget', () => {
  const config = parseTeacherAiEnvironment(source);
  assert.ok(config.enabled);
  assert.equal(config.dailyBudgetUsd, '0');
  assert.equal(config.dailyRequestLimit, 40);
  assert.equal(config.teacherDailyRequestLimit, 10);
  assert.equal(config.requestsPerMinute, 10);
  assert.equal(config.concurrency, 1);
  assert.equal(config.retentionDays, 7);
});

void test('enabling AI requires every explicit activation decision', () => {
  for (const key of [
    'OPENROUTER_API_KEY',
    'AI_CHAT_MODEL',
    'AI_CHAT_PROVIDER_ENDPOINT',
    'AI_CHAT_PRIVACY_REVIEWED',
    'AI_CHAT_RETENTION_DAYS',
    'AI_CHAT_PROCESSING_NOTICE_VERSION',
    'AI_CHAT_PILOT_TEACHER_IDS',
  ]) {
    assert.throws(
      () => parseTeacherAiEnvironment({ ...source, [key]: '' }),
      Error,
      key,
    );
  }
});

void test('paid routing, quota overruns and inconsistent limits fail closed', () => {
  for (const [key, value] of [
    ['AI_CHAT_DAILY_BUDGET_USD', '0.01'],
    ['AI_CHAT_DAILY_BUDGET_USD', '-1'],
    ['AI_CHAT_MODEL', 'fictional/paid'],
    ['AI_CHAT_MODEL', 'openrouter/free'],
    ['AI_CHAT_PROVIDER_ENDPOINT', 'https://example.test'],
    ['AI_CHAT_DAILY_REQUEST_LIMIT', '51'],
    ['AI_CHAT_REQUESTS_PER_MINUTE', '21'],
    ['AI_CHAT_CONCURRENCY', '3'],
    ['AI_CHAT_RETENTION_DAYS', '0'],
    ['AI_CHAT_RETENTION_DAYS', '1.5'],
    ['AI_CHAT_MAX_INPUT_CHARACTERS', 'Infinity'],
    ['AI_CHAT_TEACHER_DAILY_REQUEST_LIMIT', '41'],
    ['AI_CHAT_MAX_OUTPUT_TOKENS', '4096'],
    ['AI_CHAT_PILOT_TEACHER_IDS', 'someone@example.test'],
    [
      'AI_CHAT_PILOT_TEACHER_IDS',
      `${source.AI_CHAT_PILOT_TEACHER_IDS},${source.AI_CHAT_PILOT_TEACHER_IDS}`,
    ],
  ]) {
    assert.ok(key !== undefined && value !== undefined);
    assert.throws(
      () => parseTeacherAiEnvironment({ ...source, [key]: value }),
      Error,
      key,
    );
  }
});

void test('validation messages never echo the provider secret', () => {
  const secret = 'fictional-secret\ninvalid';
  assert.throws(
    () => parseTeacherAiEnvironment({ ...source, OPENROUTER_API_KEY: secret }),
    (error: unknown) =>
      error instanceof Error && !error.message.includes('fictional-secret'),
  );
});

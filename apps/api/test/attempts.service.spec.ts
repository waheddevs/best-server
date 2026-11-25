import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { AttemptStatus, Language, QuestionKind } from '@best/database';
import { Test } from '@nestjs/testing';

import { AttemptsService } from '../src/components/attempts/attempts.service';
import { AttemptReadService } from '../src/components/attempts/attempt-read.service';
import { AttemptLifecycleService } from '../src/components/attempts/attempt-lifecycle.service';
import { AttemptMediaService } from '../src/components/attempts/attempt-media.service';
import { DatabaseService } from '../src/database/database.service';
import { ApplicationError } from '../src/libs/errors/application.error';
import { ErrorCode } from '../src/libs/enums/error-code.enum';
import type { StudentAttemptSaveState } from '../src/schemas/attempts/student-attempt.object';

const studentId = '00000000-0000-4000-8000-000000000001';
const attemptId = '00000000-0000-4000-8000-000000000002';
const questionId = '00000000-0000-4000-8000-000000000003';
const sectionId = '00000000-0000-4000-8000-000000000004';
const versionId = '00000000-0000-4000-8000-000000000005';

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function fixture(context: TestContext) {
  let status: AttemptStatus = AttemptStatus.IN_PROGRESS;
  let expiresAt: Date | null = null;
  let kind: QuestionKind = QuestionKind.LONG_TEXT;
  let answerLimit: number | null = null;
  let writes = 0;
  let lock: () => Promise<void> = () => Promise.resolve();
  const state: StudentAttemptSaveState = {
    id: attemptId,
    status: AttemptStatus.IN_PROGRESS,
    serverTime: new Date(),
    answers: [],
    notes: [],
  };
  const transaction = {
    $queryRaw: async (
      query: TemplateStringsArray,
      ...parameters: unknown[]
    ) => {
      assert.match(query.join('?'), /FOR UPDATE/);
      assert.deepEqual(parameters, [attemptId, studentId]);
      await lock();
      return [];
    },
    attempt: {
      findFirst: () =>
        Promise.resolve({
          id: attemptId,
          status,
          expiresAt,
          testVersionId: versionId,
          testVersion: { id: versionId, availabilityEndsAt: null },
        }),
      updateMany: () => {
        status = AttemptStatus.SUBMITTED;
        return Promise.resolve({ count: 1 });
      },
    },
    question: {
      findFirst: () =>
        Promise.resolve({ kind, answerLimit, maxSelections: null }),
    },
    testSection: { findFirst: () => Promise.resolve({ id: sectionId }) },
    attemptAnswer: {
      upsert: () => {
        writes++;
        return Promise.resolve({});
      },
    },
    attemptSectionNote: {
      upsert: () => {
        writes++;
        return Promise.resolve({});
      },
      deleteMany: () => {
        writes++;
        return Promise.resolve({ count: 1 });
      },
    },
    outboxEvent: { create: () => Promise.resolve({}) },
  };
  const module = await Test.createTestingModule({
    providers: [
      AttemptsService,
      { provide: AttemptLifecycleService, useValue: {} },
      { provide: AttemptMediaService, useValue: {} },
      {
        provide: DatabaseService,
        useValue: {
          $transaction: (work: (tx: typeof transaction) => Promise<unknown>) =>
            work(transaction),
        },
      },
      {
        provide: AttemptReadService,
        useValue: {
          ensureAttemptTranslation: () => Promise.resolve(),
          loadStudentAttempt: () => {
            throw new Error('Autosave must not read full test content');
          },
          loadStudentAttemptSaveState: () => Promise.resolve(state),
        },
      },
    ],
  }).compile();
  context.after(() => module.close());
  return {
    service: module.get(AttemptsService),
    state,
    writes: () => writes,
    setStatus: (value: AttemptStatus) => {
      status = value;
    },
    setExpiresAt: (value: Date) => {
      expiresAt = value;
    },
    setKind: (value: QuestionKind) => {
      kind = value;
    },
    setAnswerLimit: (value: number) => {
      answerLimit = value;
    },
    setLock: (value: typeof lock) => {
      lock = value;
    },
  };
}

const hasCode = (code: ErrorCode) => (error: unknown) =>
  error instanceof ApplicationError && error.code === code;

void test('autosave returns saved state without loading questions or sections', async (context) => {
  const f = await fixture(context);
  const answer = await f.service.saveAttemptAnswer(
    studentId,
    { attemptId, questionId, textValue: 'Fictional answer' },
    undefined,
    Language.EN,
    false,
  );
  assert.equal(answer, f.state);
  const note = await f.service.saveAttemptSectionNote(
    studentId,
    { attemptId, sectionId, text: 'Fictional note' },
    Language.EN,
    false,
  );
  assert.equal(note, f.state);
  assert.equal(f.writes(), 2);
});

void test('answers and notes recheck status after acquiring the attempt lock', async (context) => {
  for (const saveNote of [false, true]) {
    const f = await fixture(context);
    const entered = deferred();
    const release = deferred();
    context.after(release.resolve);
    f.setLock(async () => {
      entered.resolve();
      await release.promise;
    });
    const pending = saveNote
      ? f.service.saveAttemptSectionNote(
          studentId,
          { attemptId, sectionId, text: 'Fictional note' },
          Language.EN,
          false,
        )
      : f.service.saveAttemptAnswer(
          studentId,
          { attemptId, questionId, textValue: 'Fictional answer' },
          undefined,
          Language.EN,
          false,
        );
    const rejection = assert.rejects(
      pending,
      hasCode(ErrorCode.ATTEMPT_NOT_ACTIVE),
    );
    await entered.promise;
    assert.equal(f.writes(), 0);
    f.setStatus(AttemptStatus.SUBMITTED);
    release.resolve();
    await rejection;
    assert.equal(f.writes(), 0);
  }
});

void test('expiry uses the clock after lock wait, not the request arrival time', async (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 0, 1) });
  const f = await fixture(context);
  f.setExpiresAt(new Date(Date.now() + 1_000));
  f.setLock(() => {
    context.mock.timers.tick(2_000);
    return Promise.resolve();
  });
  await assert.rejects(
    f.service.saveAttemptAnswer(
      studentId,
      { attemptId, questionId, textValue: 'Fictional answer' },
      undefined,
      Language.EN,
      false,
    ),
    hasCode(ErrorCode.ATTEMPT_EXPIRED),
  );
  assert.equal(f.writes(), 0);
});

void test('raw long answers and notes enforce exact size boundaries before trimming', async (context) => {
  const f = await fixture(context);
  await f.service.saveAttemptAnswer(
    studentId,
    { attemptId, questionId, textValue: 'x'.repeat(20_000) },
    undefined,
    Language.EN,
    false,
  );
  await assert.rejects(
    f.service.saveAttemptAnswer(
      studentId,
      { attemptId, questionId, textValue: ' '.repeat(20_001) },
      undefined,
      Language.EN,
      false,
    ),
    hasCode(ErrorCode.BAD_USER_INPUT),
  );
  await f.service.saveAttemptSectionNote(
    studentId,
    { attemptId, sectionId, text: 'x'.repeat(4_000) },
    Language.EN,
    false,
  );
  await assert.rejects(
    f.service.saveAttemptSectionNote(
      studentId,
      { attemptId, sectionId, text: ' '.repeat(4_001) },
      Language.EN,
      false,
    ),
    hasCode(ErrorCode.BAD_USER_INPUT),
  );
  assert.equal(f.writes(), 2);
});

void test('short-answer character and question word limits are both enforced', async (context) => {
  const f = await fixture(context);
  f.setKind(QuestionKind.SHORT_TEXT);
  await f.service.saveAttemptAnswer(
    studentId,
    { attemptId, questionId, textValue: 'x'.repeat(1_000) },
    undefined,
    Language.EN,
    false,
  );
  await assert.rejects(
    f.service.saveAttemptAnswer(
      studentId,
      { attemptId, questionId, textValue: 'x'.repeat(1_001) },
      undefined,
      Language.EN,
      false,
    ),
    hasCode(ErrorCode.BAD_USER_INPUT),
  );
  f.setAnswerLimit(2);
  await assert.rejects(
    f.service.saveAttemptAnswer(
      studentId,
      { attemptId, questionId, textValue: 'one two three' },
      undefined,
      Language.EN,
      false,
    ),
    hasCode(ErrorCode.BAD_USER_INPUT),
  );
  assert.equal(f.writes(), 1);
});

void test('saved-state reads remain owner scoped and preserve answers and notes', async (context) => {
  let query: unknown;
  let found = true;
  const savedAt = new Date();
  const module = await Test.createTestingModule({
    providers: [
      AttemptReadService,
      {
        provide: DatabaseService,
        useValue: {
          attempt: {
            findFirst: (input: unknown) => {
              query = input;
              return Promise.resolve(
                found
                  ? {
                      id: attemptId,
                      status: AttemptStatus.IN_PROGRESS,
                      answers: [
                        {
                          questionId,
                          textValue: 'Fictional',
                          savedAt,
                          selectedOptionId: null,
                          responseMediaObjectId: null,
                          selections: [],
                        },
                      ],
                      sectionNotes: [
                        { sectionId, text: 'Fictional note', savedAt },
                      ],
                    }
                  : null,
              );
            },
          },
        },
      },
    ],
  }).compile();
  context.after(() => module.close());
  const service = module.get(AttemptReadService);
  const result = await service.loadStudentAttemptSaveState(
    studentId,
    attemptId,
  );
  assert.ok(
    typeof query === 'object' &&
      query !== null &&
      'where' in query &&
      'select' in query,
  );
  assert.deepEqual(query.where, { id: attemptId, studentId });
  assert.ok(typeof query.select === 'object' && query.select !== null);
  assert.equal('testVersion' in query.select, false);
  assert.equal(result.answers[0]?.textValue, 'Fictional');
  assert.equal(result.notes[0]?.text, 'Fictional note');
  found = false;
  await assert.rejects(
    service.loadStudentAttemptSaveState(studentId, attemptId),
    hasCode(ErrorCode.NOT_FOUND),
  );
});

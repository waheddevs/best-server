import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { TestVersionStatus, type Prisma } from '@best/database';
import { Test } from '@nestjs/testing';
import { TestDraftAccessService } from '../src/components/tests/authoring/test-draft-access.service';
import { DatabaseService } from '../src/database/database.service';
import { ApplicationError } from '../src/libs/errors/application.error';
import { ErrorCode } from '../src/libs/enums/error-code.enum';

const teacherId = '00000000-0000-4000-8000-000000000001';
const versionId = '00000000-0000-4000-8000-000000000002';
const testId = '00000000-0000-4000-8000-000000000003';
const revision = new Date('2026-11-01T00:00:00Z');
const hasCode = (code: ErrorCode) => (error: unknown) =>
  error instanceof ApplicationError && error.code === code;

async function draftFixture(context: TestContext) {
  let updatedAt = revision;
  let status: TestVersionStatus = TestVersionStatus.DRAFT;
  let owned = true;
  let active = true;
  let lock: () => Promise<void> = () => Promise.resolve();
  const events: string[] = [];
  const queries: Prisma.TestVersionFindFirstArgs[] = [];
  const transaction = {
    $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
      assert.match(sql.join('?'), /FOR UPDATE OF t/);
      assert.deepEqual(values, [versionId, teacherId]);
      events.push('lock');
      await lock();
      return owned ? [{ id: testId }] : [];
    },
    testVersion: {
      findFirst: (query: Prisma.TestVersionFindFirstArgs) => {
        events.push(query.select ? 'reference' : 'snapshot');
        queries.push(query);
        return Promise.resolve(
          owned ? { id: versionId, testId, status, updatedAt } : null,
        );
      },
      update: (query: Prisma.TestVersionUpdateArgs) => {
        const value = query.data.updatedAt;
        assert.ok(value instanceof Date);
        updatedAt = value;
        events.push('revision');
        return Promise.resolve({});
      },
    },
    test: { count: () => Promise.resolve(active ? 1 : 0) },
  };
  const module = await Test.createTestingModule({
    providers: [
      TestDraftAccessService,
      {
        provide: DatabaseService,
        useValue: {
          $transaction: (work: (tx: typeof transaction) => Promise<unknown>) =>
            work(transaction),
        },
      },
    ],
  }).compile();
  context.after(() => module.close());
  return {
    service: module.get(TestDraftAccessService),
    transaction,
    events,
    queries,
    setRevision: (date: Date) => {
      updatedAt = date;
    },
    setStatus: (value: TestVersionStatus) => {
      status = value;
    },
    notOwned: () => {
      owned = false;
    },
    archived: () => {
      active = false;
    },
    setLock: (value: typeof lock) => {
      lock = value;
    },
  };
}

void test('draft edits lock the owned test before loading content and advance one aggregate revision', async (context) => {
  const f = await draftFixture(context);
  context.mock.method(Date, 'now', () => revision.getTime());
  const result = await f.service.withDraft(
    teacherId,
    { id: versionId },
    revision,
    (tx, version) => {
      assert.equal(tx, f.transaction);
      f.events.push('write');
      return Promise.resolve(version.updatedAt);
    },
  );
  assert.equal(result.getTime(), revision.getTime() + 1);
  assert.deepEqual(f.events, [
    'reference',
    'lock',
    'snapshot',
    'revision',
    'write',
  ]);
  assert.deepEqual(f.queries[0]?.where, {
    AND: [{ id: versionId }, { test: { group: { teacherId } } }],
  });
  await assert.rejects(
    f.service.withDraft(teacherId, { id: versionId }, revision, () => {
      throw new Error('Stale write ran');
    }),
    hasCode(ErrorCode.CONFLICT),
  );
});

void test('draft edits re-read the version after waiting for the lock', async (context) => {
  const f = await draftFixture(context);
  f.setLock(() => {
    f.setRevision(new Date(revision.getTime() + 1));
    return Promise.resolve();
  });
  await assert.rejects(
    f.service.withDraft(teacherId, { id: versionId }, revision, () => {
      throw new Error('Stale write ran');
    }),
    hasCode(ErrorCode.CONFLICT),
  );
  assert.deepEqual(f.events, ['reference', 'lock', 'snapshot']);
});

void test('published and archived versions cannot enter the draft mutation callback', async (context) => {
  const f = await draftFixture(context);
  const write = () => {
    throw new Error('Immutable write ran');
  };
  f.setStatus(TestVersionStatus.PUBLISHED);
  await assert.rejects(
    f.service.withDraft(teacherId, { id: versionId }, revision, write),
    hasCode(ErrorCode.CONFLICT),
  );
  f.setStatus(TestVersionStatus.DRAFT);
  f.archived();
  await assert.rejects(
    f.service.withDraft(teacherId, { id: versionId }, revision, write),
    hasCode(ErrorCode.CONFLICT),
  );
});

void test('child-reference mutations still require server-owned Teacher ownership', async (context) => {
  const f = await draftFixture(context);
  f.notOwned();
  await assert.rejects(
    f.service.withDraft(
      teacherId,
      { questions: { some: { id: versionId } } },
      revision,
      () => {
        throw new Error('Unauthorized write ran');
      },
    ),
    hasCode(ErrorCode.NOT_FOUND),
  );
  assert.deepEqual(f.events, ['reference']);
});

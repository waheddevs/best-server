import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { AttemptStatus, Prisma, TestSkill } from '@best/database';
import { Test } from '@nestjs/testing';
import { TeacherReviewService } from '../src/components/results/review/teacher-review.service';
import { AssetsService } from '../src/components/assets/assets.service';
import { DatabaseService } from '../src/database/database.service';
import { ApplicationError } from '../src/libs/errors/application.error';
import { ErrorCode } from '../src/libs/enums/error-code.enum';

const teacherId = '00000000-0000-4000-8000-000000000001';
const attemptId = '00000000-0000-4000-8000-000000000002';
const revision = new Date('2026-11-01T00:00:00Z');
const input = {
  attemptId,
  fluencyCoherence: 6,
  grammaticalRangeAccuracy: 6,
  lexicalResource: 6,
  pronunciation: 6,
  practiceBand: 6,
  release: false,
};
const hasCode = (code: ErrorCode) => (error: unknown) =>
  error instanceof ApplicationError && error.code === code;

async function fixture(context: TestContext) {
  let previous: { updatedAt: Date } | null = null;
  let found = true;
  let updateCount = 1;
  let databaseError: Error | undefined;
  const reads: Prisma.AttemptFindFirstArgs[] = [];
  const creates: Prisma.AttemptReviewCreateArgs[] = [];
  const updates: Prisma.AttemptReviewUpdateManyArgs[] = [];
  const releases: Prisma.AttemptUpdateArgs[] = [];
  const audits: Prisma.AuditLogCreateArgs[] = [];
  const transaction = {
    attempt: {
      findFirst: (query: Prisma.AttemptFindFirstArgs) => {
        reads.push(query);
        return Promise.resolve(
          found
            ? {
                review: previous,
                testVersion: {
                  passingPercentage: 60,
                  _count: { questions: 3 },
                },
              }
            : null,
        );
      },
      update: (query: Prisma.AttemptUpdateArgs) => {
        releases.push(query);
        return Promise.resolve({});
      },
    },
    attemptReview: {
      create: (query: Prisma.AttemptReviewCreateArgs) => {
        if (databaseError) throw databaseError;
        creates.push(query);
        return Promise.resolve({});
      },
      updateMany: (query: Prisma.AttemptReviewUpdateManyArgs) => {
        if (databaseError) throw databaseError;
        updates.push(query);
        return Promise.resolve({ count: updateCount });
      },
    },
    auditLog: {
      create: (query: Prisma.AuditLogCreateArgs) => {
        audits.push(query);
        return Promise.resolve({});
      },
    },
  };
  const module = await Test.createTestingModule({
    providers: [
      TeacherReviewService,
      { provide: AssetsService, useValue: {} },
      {
        provide: DatabaseService,
        useValue: {
          $transaction: (work: (tx: typeof transaction) => Promise<void>) =>
            work(transaction),
        },
      },
    ],
  }).compile();
  context.after(() => module.close());
  return {
    service: module.get(TeacherReviewService),
    reads,
    creates,
    updates,
    releases,
    audits,
    existing: () => {
      previous = { updatedAt: revision };
    },
    missing: () => {
      found = false;
    },
    loseRace: () => {
      updateCount = 0;
    },
    fail: (code: string) => {
      databaseError = new Prisma.PrismaClientKnownRequestError(
        'Fictional race',
        { code, clientVersion: 'test' },
      );
    },
  };
}

void test('Speaking first draft is owner scoped, private, and audited', async (context) => {
  const f = await fixture(context);
  await f.service.saveSpeakingAttemptReview(teacherId, input);
  assert.deepEqual(f.reads[0]?.where, {
    groupMembership: { group: { teacherId } },
    id: attemptId,
    status: { in: [AttemptStatus.SUBMITTED, AttemptStatus.REVIEW_REQUIRED] },
    testVersion: { test: { skill: TestSkill.SPEAKING } },
  });
  assert.equal(f.creates[0]?.data.releasedAt, null);
  assert.equal(f.releases.length, 0);
  assert.equal(f.audits[0]?.data.action, 'SPEAKING_REVIEW_SAVED');
});

void test('Speaking rejects missing and stale revisions before writing or releasing', async (context) => {
  const f = await fixture(context);
  f.existing();
  for (const expectedUpdatedAt of [
    undefined,
    new Date(revision.getTime() - 1),
  ]) {
    await assert.rejects(
      f.service.saveSpeakingAttemptReview(teacherId, {
        ...input,
        release: true,
        ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
      }),
      hasCode(ErrorCode.CONFLICT),
    );
  }
  assert.equal(f.updates.length, 0);
  assert.equal(f.releases.length, 0);
  assert.equal(f.audits.length, 0);
});

void test('Speaking advances its revision and releases only with a matching version', async (context) => {
  const f = await fixture(context);
  f.existing();
  context.mock.method(Date, 'now', () => revision.getTime());
  await f.service.saveSpeakingAttemptReview(teacherId, {
    ...input,
    expectedUpdatedAt: revision,
    release: true,
  });
  assert.deepEqual(f.updates[0]?.where, { attemptId, updatedAt: revision });
  const updatedAt = f.updates[0].data.updatedAt;
  assert.ok(updatedAt instanceof Date && updatedAt > revision);
  assert.equal(f.releases[0]?.data.status, AttemptStatus.SCORED);
  assert.equal(f.audits[0]?.data.action, 'SPEAKING_REVIEW_RELEASED');
});

void test('Speaking concurrent update loser cannot release or audit a result', async (context) => {
  const f = await fixture(context);
  f.existing();
  f.loseRace();
  await assert.rejects(
    f.service.saveSpeakingAttemptReview(teacherId, {
      ...input,
      expectedUpdatedAt: revision,
      release: true,
    }),
    hasCode(ErrorCode.CONFLICT),
  );
  assert.equal(f.releases.length, 0);
  assert.equal(f.audits.length, 0);
});

void test('Speaking maps concurrent insert and serialization failures to conflict', async (context) => {
  const f = await fixture(context);
  for (const code of ['P2002', 'P2034']) {
    f.fail(code);
    await assert.rejects(
      f.service.saveSpeakingAttemptReview(teacherId, input),
      hasCode(ErrorCode.CONFLICT),
    );
  }
  assert.equal(f.releases.length, 0);
  assert.equal(f.audits.length, 0);
});

void test('Speaking rejects invalid bands and inaccessible attempts without writes', async (context) => {
  const f = await fixture(context);
  await assert.rejects(
    f.service.saveSpeakingAttemptReview(teacherId, {
      ...input,
      pronunciation: 6.2,
    }),
    hasCode(ErrorCode.BAD_USER_INPUT),
  );
  assert.equal(f.reads.length, 0);
  f.missing();
  await assert.rejects(
    f.service.saveSpeakingAttemptReview(teacherId, input),
    hasCode(ErrorCode.NOT_FOUND),
  );
  assert.equal(f.creates.length, 0);
  assert.equal(f.audits.length, 0);
});

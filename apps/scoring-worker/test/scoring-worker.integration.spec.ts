import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';

import { loadInfrastructureEnvironment } from '@best/config';
import {
  AttemptStatus,
  createDatabaseClient,
  type DatabaseClient,
  Language,
  OutboxEventType,
  TestSkill,
  TestVersionStatus,
  UserRole,
} from '@best/database';
import { getQueueToken } from '@nestjs/bullmq';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { Pool } from 'pg';

import { ScoringWorkerModule } from '../src/scoring-worker.module';
import { TEST_SCORING_QUEUE } from '../src/scoring/scoring.constants';
import { ScoringService } from '../src/scoring/scoring.service';

const databaseName = `best_scoring_test_${randomUUID().replaceAll('-', '')}`;
const originalDatabaseUrl = process.env.DATABASE_URL;
const environment = loadInfrastructureEnvironment();
const adminPool = new Pool({ connectionString: environment.postgres.url });
const testDatabaseUrl = createTestDatabaseUrl(
  environment.postgres.url,
  databaseName,
);

let app: INestApplicationContext | undefined;
let database: DatabaseClient | undefined;
let queue: Queue | undefined;

before(async () => {
  await adminPool.query(`CREATE DATABASE "${databaseName}"`);
  await applyMigrations(testDatabaseUrl);
  process.env.DATABASE_URL = testDatabaseUrl;
  database = createDatabaseClient();
  await database.$connect();
});

after(async () => {
  if (queue !== undefined && database !== undefined) {
    const events = await database.outboxEvent.findMany({
      select: { id: true },
    });

    for (const event of events) {
      await queue.remove(event.id);
    }
  }

  if (app !== undefined) {
    await app.close();
  }

  if (database !== undefined) {
    await database.$disconnect();
  }

  await adminPool.query(
    `SELECT pg_terminate_backend("pid")
     FROM "pg_stat_activity"
     WHERE "datname" = $1
       AND "pid" <> pg_backend_pid()`,
    [databaseName],
  );
  await adminPool.query(`DROP DATABASE "${databaseName}"`);
  await adminPool.end();

  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

void test('outbox relay scores submitted and expired fake attempts exactly once', async () => {
  if (database === undefined) {
    throw new Error('Test database was not initialized');
  }

  const fixture = await createScoringFixture(database);
  app = await NestFactory.createApplicationContext(ScoringWorkerModule, {
    abortOnError: false,
    logger: false,
  });
  queue = app.get<Queue>(getQueueToken(TEST_SCORING_QUEUE));

  await waitForScoredAttempts(database, [
    fixture.submittedAttemptId,
    fixture.expiredAttemptId,
  ]);

  const attempts = await database.attempt.findMany({
    where: {
      id: { in: [fixture.submittedAttemptId, fixture.expiredAttemptId] },
    },
    orderBy: { attemptNumber: 'asc' },
  });
  const submitted = attempts[0];
  const expired = attempts[1];

  assert.equal(submitted?.status, AttemptStatus.SCORED);
  assert.equal(submitted?.correctAnswerCount, 1);
  assert.equal(submitted?.percentage?.toNumber(), 100);
  assert.equal(submitted?.passed, true);
  assert.equal(expired?.status, AttemptStatus.SCORED);
  assert.equal(expired?.correctAnswerCount, 0);
  assert.equal(expired?.submissionReason, 'DURATION_EXPIRED');

  const outboxEvents = await database.outboxEvent.findMany({
    where: {
      aggregateId: {
        in: [fixture.submittedAttemptId, fixture.expiredAttemptId],
      },
    },
  });
  assert.equal(outboxEvents.length, 2);
  assert.equal(
    outboxEvents.every(({ publishedAt }) => publishedAt !== null),
    true,
  );

  const scoringService = app.get(ScoringService);
  await scoringService.scoreAttempt(fixture.submittedAttemptId, randomUUID());
  const auditCount = await database.auditLog.count({
    where: {
      action: 'TEST_ATTEMPT_SCORED',
      targetId: { in: [fixture.submittedAttemptId, fixture.expiredAttemptId] },
    },
  });
  assert.equal(auditCount, 2);

  const manualTestId = randomUUID();
  const manualPaperId = randomUUID();
  const manualVersionId = randomUUID();
  const manualAttemptId = randomUUID();
  await database.testPaper.create({
    data: {
      id: manualPaperId,
      groupId: fixture.groupId,
      createdById: fixture.teacherId,
      practiceNumber: 1,
      slug: 'reserved-writing-review',
      academicYear: 2026,
      title: 'Reserved writing review',
      sourceLabel: 'Integration test fixture',
    },
  });
  await database.test.create({
    data: {
      id: manualTestId,
      categoryId: fixture.categoryId,
      groupId: fixture.groupId,
      paperId: manualPaperId,
      skill: TestSkill.WRITING,
    },
  });
  await database.testVersion.create({
    data: {
      id: manualVersionId,
      testId: manualTestId,
      version: 1,
      primaryLanguage: Language.EN,
      scoringRuleVersion: 'manual-rubric-v1',
      status: TestVersionStatus.PUBLISHED,
      publishedAt: new Date(),
    },
  });
  await database.attempt.create({
    data: {
      id: manualAttemptId,
      attemptNumber: 1,
      groupMembershipId: fixture.membershipId,
      studentId: fixture.studentId,
      testVersionId: manualVersionId,
      status: AttemptStatus.SUBMITTED,
      submissionReason: 'MANUAL',
      submittedAt: new Date(),
    },
  });
  await scoringService.scoreAttempt(manualAttemptId, randomUUID());
  await scoringService.scoreAttempt(manualAttemptId, randomUUID());
  const reviewNotifications = await database.notification.findMany({
    where: { recipientId: fixture.teacherId, eventKey: `review-required:${manualAttemptId}` },
  });
  assert.equal(reviewNotifications.length, 1);
  assert.equal(reviewNotifications[0]?.kind, 'REVIEW_REQUIRED');
  assert.deepEqual(reviewNotifications[0]?.payload, {
    attemptId: manualAttemptId,
    groupId: fixture.groupId,
    studentId: fixture.studentId,
  });
});

async function createScoringFixture(databaseClient: DatabaseClient): Promise<{
  categoryId: string;
  expiredAttemptId: string;
  groupId: string;
  membershipId: string;
  studentId: string;
  submittedAttemptId: string;
  teacherId: string;
}> {
  const teacherId = randomUUID();
  const studentId = randomUUID();
  const groupId = randomUUID();
  const membershipId = randomUUID();
  const categoryId = randomUUID();
  const testId = randomUUID();
  const versionId = randomUUID();
  const questionId = randomUUID();
  const correctOptionId = randomUUID();
  const wrongOptionId = randomUUID();
  const submittedAttemptId = randomUUID();
  const expiredAttemptId = randomUUID();

  await databaseClient.user.createMany({
    data: [
      {
        displayName: 'Fake Scoring Teacher',
        id: teacherId,
        role: UserRole.TEACHER,
      },
      {
        displayName: 'Fake Scoring Student',
        id: studentId,
        role: UserRole.STUDENT,
      },
    ],
  });
  await databaseClient.group.create({
    data: {
      id: groupId,
      name: 'Fake Scoring Group',
      paymentDeadlineDay: 10,
      slug: `fake-scoring-${groupId}`,
      teacherId,
    },
  });
  await databaseClient.groupMembership.create({
    data: { groupId, id: membershipId, studentId },
  });
  await databaseClient.testCategory.create({
    data: { id: categoryId, name: 'Scoring', teacherId },
  });
  await databaseClient.test.create({
    data: { categoryId, groupId, id: testId },
  });
  await databaseClient.testVersion.create({
    data: {
      attemptLimit: 2,
      id: versionId,
      passingPercentage: 60,
      primaryLanguage: Language.UZ,
      testId,
      version: 1,
    },
  });
  await databaseClient.testTranslation.create({
    data: {
      language: Language.UZ,
      testVersionId: versionId,
      title: 'Fake scoring test',
    },
  });
  await databaseClient.question.create({
    data: { id: questionId, position: 1, testVersionId: versionId },
  });
  await databaseClient.questionTranslation.create({
    data: {
      language: Language.UZ,
      prompt: 'Fake scoring question',
      questionId,
    },
  });
  await databaseClient.answerOption.createMany({
    data: [
      {
        id: correctOptionId,
        isCorrect: true,
        position: 1,
        questionId,
      },
      {
        id: wrongOptionId,
        isCorrect: false,
        position: 2,
        questionId,
      },
    ],
  });
  await databaseClient.answerOptionTranslation.createMany({
    data: [
      {
        answerOptionId: correctOptionId,
        language: Language.UZ,
        text: 'Correct',
      },
      {
        answerOptionId: wrongOptionId,
        language: Language.UZ,
        text: 'Wrong',
      },
    ],
  });
  await databaseClient.testVersion.update({
    where: { id: versionId },
    data: { publishedAt: new Date(), status: TestVersionStatus.PUBLISHED },
  });
  await databaseClient.attempt.create({
    data: {
      attemptNumber: 1,
      groupMembershipId: membershipId,
      id: submittedAttemptId,
      studentId,
      testVersionId: versionId,
    },
  });
  await databaseClient.attemptAnswer.create({
    data: {
      attemptId: submittedAttemptId,
      questionId,
      selectedOptionId: correctOptionId,
    },
  });
  await databaseClient.attempt.update({
    where: { id: submittedAttemptId },
    data: {
      status: AttemptStatus.SUBMITTED,
      submissionReason: 'MANUAL',
      submittedAt: new Date(),
    },
  });
  await databaseClient.outboxEvent.create({
    data: {
      aggregateId: submittedAttemptId,
      eventType: OutboxEventType.ATTEMPT_SUBMITTED,
      payload: { attemptId: submittedAttemptId },
    },
  });

  const startedAt = new Date(Date.now() - 120_000);
  await databaseClient.attempt.create({
    data: {
      attemptNumber: 2,
      expiresAt: new Date(Date.now() - 60_000),
      groupMembershipId: membershipId,
      id: expiredAttemptId,
      startedAt,
      studentId,
      testVersionId: versionId,
    },
  });
  await databaseClient.attemptAnswer.create({
    data: {
      attemptId: expiredAttemptId,
      questionId,
      selectedOptionId: wrongOptionId,
    },
  });

  return {
    categoryId,
    expiredAttemptId,
    groupId,
    membershipId,
    studentId,
    submittedAttemptId,
    teacherId,
  };
}

async function waitForScoredAttempts(
  databaseClient: DatabaseClient,
  attemptIds: readonly string[],
): Promise<void> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const scoredCount = await databaseClient.attempt.count({
      where: { id: { in: [...attemptIds] }, status: AttemptStatus.SCORED },
    });

    if (scoredCount === attemptIds.length) {
      return;
    }

    await new Promise<void>((resolvePromise) => {
      setTimeout(resolvePromise, 100);
    });
  }

  throw new Error('Timed out waiting for scoring worker');
}

async function applyMigrations(connectionString: string): Promise<void> {
  const migrationPool = new Pool({ connectionString });
  const root = resolve(__dirname, '../../../packages/database/prisma/migrations');

  try {
    const migrations = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const migrationName of migrations) {
      const sql = await readFile(resolve(root, migrationName, 'migration.sql'), 'utf8');
      await migrationPool.query(sql);
    }
  } finally {
    await migrationPool.end();
  }
}

function createTestDatabaseUrl(baseUrl: string, database: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${database}`;
  url.searchParams.delete('options');
  url.searchParams.set('schema', 'public');
  return url.toString();
}

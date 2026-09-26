import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';

import { loadInfrastructureEnvironment } from '@best/config';
import {
  AttemptStatus,
  createDatabaseClient,
  type DatabaseClient,
  Language,
  OutboxEventType,
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
});

async function createScoringFixture(databaseClient: DatabaseClient): Promise<{
  expiredAttemptId: string;
  submittedAttemptId: string;
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

  return { expiredAttemptId, submittedAttemptId };
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

  try {
    for (const migrationName of [
      '20260901000000_initial_domain_schema',
      '20260901010000_auth_identity_accounts',
      '20260901020000_scoring_outbox',
      '20260901030000_media_object_lifecycle',
      '20260901031000_media_object_updated_at_default',
      '20260901040000_media_malware_scan',
      '20260901041000_fix_media_attachment_trigger',
      '20260904010000_user_profiles',
      '20260904020000_groups_memberships_transfers',
      '20260904030000_learning_public_notifications',
      '20260904040000_vocabulary_import_pilot',
      '20260905090000_public_website_content',
      '20260907010000_credential_email_code_login',
      '20260915010000_teacher_group_category',
      '20260915020000_teacher_group_soft_delete',
      '20260915021000_teacher_group_deleted_archive_constraint',
      '20260916010000_group_membership_participation_status',
      '20260916020000_credential_refresh_sessions',
      '20260923010000_teacher_student_soft_delete',
      '20260923020000_teacher_lesson_plans',
      '20260923030000_media_archive_type',
      '20260923040000_best_lc_academic_tests',
      '20260923041000_best_lc_academic_publish_rules',
    ]) {
      const sql = await readFile(
        resolve(
          __dirname,
          `../../../packages/database/prisma/migrations/${migrationName}/migration.sql`,
        ),
        'utf8',
      );
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

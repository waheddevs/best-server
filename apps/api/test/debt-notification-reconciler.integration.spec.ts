import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';

import { loadInfrastructureEnvironment } from '@best/config';
import { UserRole } from '@best/database';
import { Pool } from 'pg';

import { DebtNotificationReconcilerService } from '../src/components/notifications/debt-notification-reconciler.service';
import { DatabaseService } from '../src/database/database.service';

const databaseName = `best_notifications_test_${randomUUID().replaceAll('-', '')}`;
const originalDatabaseUrl = process.env.DATABASE_URL;
const environment = loadInfrastructureEnvironment();
const adminPool = new Pool({ connectionString: environment.postgres.url });
const testDatabaseUrl = createTestDatabaseUrl(environment.postgres.url, databaseName);

let database: DatabaseService | undefined;

before(async () => {
  await adminPool.query(`CREATE DATABASE "${databaseName}"`);
  await applyMigrations(testDatabaseUrl);
  process.env.DATABASE_URL = testDatabaseUrl;
  database = new DatabaseService();
  await database.$connect();
});

after(async () => {
  await database?.$disconnect();
  await adminPool.query(
    `SELECT pg_terminate_backend("pid") FROM "pg_stat_activity"
     WHERE "datname" = $1 AND "pid" <> pg_backend_pid()`,
    [databaseName],
  );
  await adminPool.query(`DROP DATABASE "${databaseName}"`);
  await adminPool.end();
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

void test('overdue teacher notification is persisted once, with no task created', async () => {
  if (database === undefined) throw new Error('Test database was not initialized');
  const teacherId = randomUUID();
  const studentId = randomUUID();
  const groupId = randomUUID();
  const membershipId = randomUUID();
  const chargeId = randomUUID();
  await database.user.createMany({
    data: [
      { id: teacherId, role: UserRole.TEACHER, displayName: 'Fictional Teacher' },
      { id: studentId, role: UserRole.STUDENT, displayName: 'Fictional Student' },
    ],
  });
  await database.group.create({
    data: {
      id: groupId,
      teacherId,
      slug: `notification-test-${groupId}`,
      name: 'Fictional Group',
      paymentDeadlineDay: 10,
    },
  });
  await database.groupMembership.create({
    data: { id: membershipId, groupId, studentId },
  });
  await database.tuitionCharge.create({
    data: {
      id: chargeId,
      studentId,
      groupMembershipId: membershipId,
      billingMonth: new Date('2026-09-01T00:00:00.000Z'),
      dueDate: new Date('2026-09-10T00:00:00.000Z'),
      amountUzs: 300_000n,
    },
  });
  const service = new DebtNotificationReconcilerService(database);
  const now = new Date('2026-10-04T12:00:00.000Z');
  await service.reconcile(now);
  await service.reconcile(now);

  const notifications = await database.notification.findMany({
    where: { recipientId: teacherId, eventKey: `debt-follow-up:${chargeId}` },
  });
  assert.equal(notifications.length, 1);
  const notice = notifications[0];
  assert.ok(notice);
  assert.equal(notice.kind, 'DEBT_FOLLOW_UP');
  assert.deepEqual(notice.payload, { chargeId, groupId, studentId });
  assert.equal(await database.teacherTask.count({ where: { teacherId } }), 0);

  const payment = await database.payment.create({
    data: {
      studentId,
      recordedById: teacherId,
      amountUzs: 300_000n,
      method: 'CASH',
      paidAt: now,
    },
  });
  await database.paymentAllocation.create({
    data: { paymentId: payment.id, chargeId, amountUzs: 300_000n },
  });
  await service.reconcile(now);
  assert.equal(
    await database.notification.count({ where: { recipientId: teacherId } }),
    1,
  );
});

async function applyMigrations(connectionString: string): Promise<void> {
  const migrationPool = new Pool({ connectionString });
  const root = resolve(__dirname, '../../../packages/database/prisma/migrations');
  try {
    const migrations = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const name of migrations) {
      const sql = await readFile(resolve(root, name, 'migration.sql'), 'utf8');
      await migrationPool.query(sql);
    }
  } finally {
    await migrationPool.end();
  }
}

function createTestDatabaseUrl(baseUrl: string, name: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  url.searchParams.delete('options');
  url.searchParams.set('schema', 'public');
  return url.toString();
}

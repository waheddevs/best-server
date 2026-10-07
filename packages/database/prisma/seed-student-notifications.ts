import { createRequire } from 'node:module';

import type * as DatabasePackage from '../src/index.ts';

const require = createRequire(import.meta.url);
const { createDatabaseClient, UserRole, UserStatus } =
  require('../dist/src/index.js') as typeof DatabasePackage;

const database = createDatabaseClient();

const samples = [
  {
    eventKey: 'demo:student-notification:group',
    kind: 'DEMO_STUDENT_GROUP',
    title: 'Demo: Class time updated',
    body: 'The lesson time in a sample group has changed.',
    hoursAgo: 1,
    read: false,
  },
  {
    eventKey: 'demo:student-notification:library',
    kind: 'DEMO_STUDENT_LIBRARY',
    title: 'Demo: New study guide',
    body: 'A sample study guide is available in the Library.',
    hoursAgo: 25,
    read: false,
  },
  {
    eventKey: 'demo:student-notification:test',
    kind: 'DEMO_STUDENT_TEST',
    title: 'Demo: Practice test available',
    body: 'A sample practice test is ready in Tests.',
    hoursAgo: 50,
    read: false,
  },
  {
    eventKey: 'demo:student-notification:result',
    kind: 'DEMO_STUDENT_RESULT',
    title: 'Demo: Test result ready',
    body: 'A fictional test result is ready in Results.',
    hoursAgo: 74,
    read: true,
  },
  {
    eventKey: 'demo:student-notification:progress',
    kind: 'DEMO_STUDENT_PROGRESS',
    title: 'Demo: Weekly progress summary',
    body: 'A fictional learning summary is ready in Progress.',
    hoursAgo: 120,
    read: true,
  },
] as const;

async function main(): Promise<void> {
  assertLocalDevelopmentDatabase();
  const studentEmail =
    process.env.BEST_FIXTURE_STUDENT_EMAIL?.trim().toLowerCase();
  if (!studentEmail) {
    throw new Error(
      'BEST_FIXTURE_STUDENT_EMAIL is required for demo notifications',
    );
  }
  const student = await database.user.findFirst({
    select: { id: true },
    where: {
      email: studentEmail,
      role: UserRole.STUDENT,
      status: UserStatus.ACTIVE,
    },
  });
  if (student === null)
    throw new Error('Active fixture Student account was not found');

  const existing = await database.notification.findMany({
    select: { eventKey: true },
    where: {
      recipientId: student.id,
      eventKey: { in: samples.map(({ eventKey }) => eventKey) },
    },
  });
  process.stdout.write(
    `${JSON.stringify({ existing: existing.length, toCreate: samples.length - existing.length })}\n`,
  );
  if (!process.argv.includes('--apply')) {
    process.stdout.write(
      'Dry run only. Pass --apply to seed local demo notifications.\n',
    );
    return;
  }

  const now = Date.now();
  for (const sample of samples) {
    const createdAt = new Date(now - sample.hoursAgo * 3_600_000);
    await database.notification.upsert({
      where: {
        recipientId_eventKey: {
          recipientId: student.id,
          eventKey: sample.eventKey,
        },
      },
      create: {
        recipientId: student.id,
        eventKey: sample.eventKey,
        kind: sample.kind,
        title: sample.title,
        body: sample.body,
        createdAt,
        readAt: sample.read ? createdAt : null,
        payload: { demo: true },
      },
      update: {},
    });
  }
  const persisted = await database.notification.count({
    where: {
      recipientId: student.id,
      eventKey: { in: samples.map(({ eventKey }) => eventKey) },
    },
  });
  if (persisted !== samples.length)
    throw new Error('Demo notification seed verification failed');
  process.stdout.write(`${JSON.stringify({ persisted })}\n`);
}

function assertLocalDevelopmentDatabase(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo notifications cannot be seeded in production');
  }
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('Demo notifications require loopback PostgreSQL');
  }
}

void main()
  .finally(() => database.$disconnect())
  .catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Unknown seed error'}\n`,
    );
    process.exitCode = 1;
  });

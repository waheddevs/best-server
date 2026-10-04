import { createRequire } from 'node:module';

import type * as DatabasePackage from '../src/index.ts';

const require = createRequire(import.meta.url);
const { createDatabaseClient, UserRole } =
  require('../dist/src/index.js') as typeof DatabasePackage;

const database = createDatabaseClient();

const samples = [
  {
    eventKey: 'demo:teacher-notification:review',
    title: 'Demo: Writing review is waiting',
    body: 'Sample notification — a student test would appear here after submission.',
  },
  {
    eventKey: 'demo:teacher-notification:debt',
    title: 'Demo: Follow up on an overdue balance',
    body: 'Sample notification — this is not a real student debt.',
  },
] as const;

async function main(): Promise<void> {
  assertLocalDevelopmentDatabase();
  const teacherEmail = process.env.BEST_FIXTURE_TEACHER_EMAIL?.trim().toLowerCase();
  if (!teacherEmail) {
    throw new Error('BEST_FIXTURE_TEACHER_EMAIL is required for demo notifications');
  }
  const teacher = await database.user.findFirst({
    select: { id: true },
    where: { email: teacherEmail, role: UserRole.TEACHER },
  });
  if (teacher === null) throw new Error('Fixture Teacher account was not found');

  const existing = await database.notification.findMany({
    select: { eventKey: true },
    where: {
      recipientId: teacher.id,
      eventKey: { in: samples.map(({ eventKey }) => eventKey) },
    },
  });
  process.stdout.write(
    `${JSON.stringify({ existing: existing.length, toCreate: samples.length - existing.length })}\n`,
  );
  if (!process.argv.includes('--apply')) {
    process.stdout.write('Dry run only. Pass --apply to seed local demo notifications.\n');
    return;
  }

  for (const sample of samples) {
    await database.notification.upsert({
      where: {
        recipientId_eventKey: {
          recipientId: teacher.id,
          eventKey: sample.eventKey,
        },
      },
      create: {
        ...sample,
        kind: 'DEMO',
        recipientId: teacher.id,
        payload: { demo: true },
      },
      update: {},
    });
  }
  const persisted = await database.notification.count({
    where: {
      recipientId: teacher.id,
      eventKey: { in: samples.map(({ eventKey }) => eventKey) },
    },
  });
  if (persisted !== samples.length) throw new Error('Demo notification seed verification failed');
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

import { createRequire } from 'node:module';

import type * as DatabasePackage from '../src/index.ts';

const require = createRequire(import.meta.url);
const { createDatabaseClient, UserRole } =
  require('../dist/src/index.js') as typeof DatabasePackage;

const database = createDatabaseClient();
const snapshots = [
  {
    activeGroups: 6,
    activeLearners: 118,
    attendanceRate: '89.40',
    expectedAmountUzs: 28_400_000n,
    expensesUzs: 14_200_000n,
    incomeUzs: 21_850_000n,
    month: 8,
    penaltiesUzs: 0n,
    year: 2026,
  },
  {
    activeGroups: 6,
    activeLearners: 116,
    attendanceRate: '91.20',
    expectedAmountUzs: 27_600_000n,
    expensesUzs: 13_900_000n,
    incomeUzs: 25_400_000n,
    month: 7,
    penaltiesUzs: 0n,
    year: 2026,
  },
  {
    activeGroups: 6,
    activeLearners: 112,
    attendanceRate: '88.70',
    expectedAmountUzs: 26_800_000n,
    expensesUzs: 13_200_000n,
    incomeUzs: 23_650_000n,
    month: 6,
    penaltiesUzs: 140_000n,
    year: 2026,
  },
] as const;

async function main(): Promise<void> {
  assertLocalDevelopmentDatabase();
  const teacherEmail = (
    process.env.BEST_FIXTURE_TEACHER_EMAIL ?? 'ibrohim_gaffarov@gmail.com'
  )
    .trim()
    .toLowerCase();
  const teacher = await database.user.findFirst({
    select: { id: true },
    where: { email: teacherEmail, role: UserRole.TEACHER },
  });
  if (teacher === null)
    throw new Error('Fixture Teacher account was not found');

  for (const snapshot of snapshots) {
    await database.teacherFinanceSnapshot.upsert({
      create: { ...snapshot, teacherId: teacher.id },
      update: snapshot,
      where: {
        teacherId_year_month: {
          month: snapshot.month,
          teacherId: teacher.id,
          year: snapshot.year,
        },
      },
    });
  }
  const persistedCount = await database.teacherFinanceSnapshot.count({
    where: {
      OR: snapshots.map(({ month, year }) => ({
        month,
        teacherId: teacher.id,
        year,
      })),
    },
  });
  if (persistedCount !== snapshots.length) {
    throw new Error('Teacher finance seed verification failed');
  }
}

function assertLocalDevelopmentDatabase(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Teacher finance seed is disabled in production');
  }
  const value = process.env.DATABASE_URL ?? '';
  const url = new URL(value);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('Teacher finance seed is limited to loopback PostgreSQL');
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

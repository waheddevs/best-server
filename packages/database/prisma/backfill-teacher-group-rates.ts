import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import type * as DatabasePackage from '../src/index.ts';

const require = createRequire(
  resolve(
    process.cwd(),
    'packages/database/prisma/backfill-teacher-group-rates.ts',
  ),
);
const { ContentStatus, createDatabaseClient, UserRole } =
  require('../dist/src/index.js') as typeof DatabasePackage;

const MONTHLY_TUITION_UZS = 300000n;

function tashkentDate(): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
  }).formatToParts(new Date());
  const part = (type: string): number =>
    Number(parts.find((value) => value.type === type)?.value);
  return new Date(Date.UTC(part('year'), part('month') - 1, part('day')));
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (
    url === undefined ||
    !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)
  ) {
    throw new Error(
      'This backfill is limited to a configured loopback database',
    );
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Do not run this local backfill in production');
  }

  const database = createDatabaseClient();
  try {
    const eligibleGroups = await database.group.findMany({
      where: {
        status: ContentStatus.ACTIVE,
        tuitionRates: { none: { effectiveTo: null } },
      },
      select: { id: true },
    });
    if (!process.argv.includes('--apply')) {
      process.stdout.write(
        `Dry run: ${String(eligibleGroups.length)} active groups need a tuition rate.\n`,
      );
      return;
    }

    const admin = await database.user.findFirst({
      where: { role: UserRole.ADMIN },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (admin === null)
      throw new Error(
        'An operational Admin record is required for rate provenance',
      );

    let inserted = 0;
    for (const group of eligibleGroups) {
      await database.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM groups WHERE id = ${group.id}::uuid FOR UPDATE`;
        const existing = await transaction.groupTuitionRate.findFirst({
          where: { effectiveTo: null, groupId: group.id },
          select: { id: true },
        });
        if (existing !== null) return;
        await transaction.groupTuitionRate.create({
          data: {
            amountUzs: MONTHLY_TUITION_UZS,
            createdById: admin.id,
            effectiveFrom: tashkentDate(),
            groupId: group.id,
          },
        });
        await transaction.auditLog.create({
          data: {
            action: 'GROUP_TUITION_RATE_BACKFILLED',
            newValues: { monthlyTuitionUzs: MONTHLY_TUITION_UZS.toString() },
            reason: 'User-requested local 300000 UZS group-price backfill',
            targetId: group.id,
            targetType: 'GROUP',
          },
        });
        inserted += 1;
      });
    }
    process.stdout.write(`Backfilled ${String(inserted)} active groups.\n`);
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Backfill failed'}\n`,
  );
  process.exitCode = 1;
});

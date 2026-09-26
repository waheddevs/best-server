import { createRequire } from 'node:module';

import type * as DatabasePackage from '../src/index.ts';

const require = createRequire(import.meta.url);
const { createDatabaseClient, Language, UserRole } =
  require('../dist/src/index.js') as typeof DatabasePackage;

const database = createDatabaseClient();
const lessonNames = [
  'Reading: Matching headings',
  'Writing Task 2 structure',
  'Speaking Part 2',
] as const;

async function main(): Promise<void> {
  assertLocalDevelopmentDatabase();
  const apply = process.argv.includes('--apply');
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

  const groups = await database.group.findMany({
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      endsAtMinutes: true,
      id: true,
      name: true,
      room: true,
      startsAtMinutes: true,
    },
    where: { category: 'IELTS', status: 'ACTIVE', teacherId: teacher.id },
  });
  const pending: Array<{ groupId: string; groupName: string; name: string }> =
    [];
  for (const group of groups) {
    const existing = await database.lessonTranslation.findMany({
      select: { title: true },
      where: { lesson: { groupId: group.id }, title: { in: [...lessonNames] } },
    });
    const titles = new Set(existing.map(({ title }) => title));
    for (const name of lessonNames) {
      if (!titles.has(name))
        pending.push({ groupId: group.id, groupName: group.name, name });
    }
  }

  process.stdout.write(
    `${JSON.stringify({ groups: groups.length, pendingLessonPlans: pending.length }, null, 2)}\n`,
  );
  if (!apply) {
    process.stdout.write(
      'Dry run only. Pass --apply to write local lesson plans.\n',
    );
    return;
  }

  for (const group of groups) {
    const plans = pending.filter(({ groupId }) => groupId === group.id);
    if (plans.length === 0) continue;
    await database.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${group.id}))`;
      const sequence = await transaction.lesson.aggregate({
        where: { groupId: group.id },
        _max: { lessonNumber: true },
      });
      const baseNumber = sequence._max.lessonNumber ?? 0;
      for (const [index, plan] of plans.entries()) {
        const startsAt = futureLessonDate(
          index + 1,
          group.startsAtMinutes ?? 9 * 60,
        );
        const duration =
          group.startsAtMinutes !== null && group.endsAtMinutes !== null
            ? group.endsAtMinutes - group.startsAtMinutes
            : 90;
        await transaction.lesson.create({
          data: {
            createdById: teacher.id,
            endsAt: new Date(startsAt.getTime() + duration * 60_000),
            groupId: group.id,
            lessonNumber: baseNumber + index + 1,
            room: group.room,
            startsAt,
            translations: {
              createMany: {
                data: [Language.UZ, Language.RU, Language.EN].map(
                  (language) => ({
                    language,
                    title: plan.name,
                  }),
                ),
              },
            },
          },
        });
      }
    });
  }
  process.stdout.write(`Imported ${pending.length} fictional lesson plans.\n`);
}

function futureLessonDate(dayOffset: number, minutes: number): Date {
  const tashkentNow = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const utc = Date.UTC(
    tashkentNow.getUTCFullYear(),
    tashkentNow.getUTCMonth(),
    tashkentNow.getUTCDate() + dayOffset,
    Math.floor(minutes / 60) - 5,
    minutes % 60,
  );
  return new Date(utc);
}

function assertLocalDevelopmentDatabase(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Teacher lesson fixtures are disabled in production');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const host = new URL(databaseUrl).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(
      'Teacher lesson fixtures are limited to loopback PostgreSQL',
    );
  }
}

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Unknown import error'}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => database.$disconnect());

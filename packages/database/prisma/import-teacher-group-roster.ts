import { createRequire } from 'node:module';

import type * as DatabasePackage from '../src/index.ts';

const require = createRequire(import.meta.url);
const { createDatabaseClient, GroupMembershipStatus, UserRole, UserStatus } =
  require('../dist/src/index.js') as typeof DatabasePackage;

interface FictionalLearner {
  readonly displayName: string;
  readonly emailLocalPart: string;
  readonly status: 'ACTIVE' | 'PAUSED' | 'DEBTOR' | 'DEPARTED';
}

const FICTIONAL_LEARNERS: readonly FictionalLearner[] = [
  {
    displayName: 'Aziza Karimova',
    emailLocalPart: 'aziza.karimova',
    status: 'ACTIVE',
  },
  {
    displayName: 'Bekzod Rahimov',
    emailLocalPart: 'bekzod.rahimov',
    status: 'ACTIVE',
  },
  {
    displayName: 'Dilnoza Ergasheva',
    emailLocalPart: 'dilnoza.ergasheva',
    status: 'ACTIVE',
  },
  {
    displayName: 'Farrux Tursunov',
    emailLocalPart: 'farrux.tursunov',
    status: 'ACTIVE',
  },
  {
    displayName: 'Gulnoza Sobirova',
    emailLocalPart: 'gulnoza.sobirova',
    status: 'ACTIVE',
  },
  {
    displayName: 'Humoyun Abdullayev',
    emailLocalPart: 'humoyun.abdullayev',
    status: 'ACTIVE',
  },
  {
    displayName: 'Iroda Yusupova',
    emailLocalPart: 'iroda.yusupova',
    status: 'ACTIVE',
  },
  {
    displayName: 'Jasur Qodirov',
    emailLocalPart: 'jasur.qodirov',
    status: 'ACTIVE',
  },
  {
    displayName: 'Kamola Raxmatova',
    emailLocalPart: 'kamola.raxmatova',
    status: 'PAUSED',
  },
  {
    displayName: 'Laziz Mirzayev',
    emailLocalPart: 'laziz.mirzayev',
    status: 'DEBTOR',
  },
  {
    displayName: 'Madina Usmonova',
    emailLocalPart: 'madina.usmonova',
    status: 'DEBTOR',
  },
  {
    displayName: 'Nodir Xolmatov',
    emailLocalPart: 'nodir.xolmatov',
    status: 'DEPARTED',
  },
];

const database = createDatabaseClient();

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Teacher roster fixture import is disabled in production');
  }

  const target = parseTarget(process.argv.slice(2));
  if (target === undefined) {
    const groups = await database.group.findMany({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: {
        _count: { select: { memberships: { where: { endedAt: null } } } },
        id: true,
        name: true,
        slug: true,
        status: true,
        teacher: { select: { displayName: true } },
      },
      where: { status: { not: 'DELETED' } },
    });
    process.stdout.write(
      `${JSON.stringify(
        groups.map((group) => ({
          currentStudents: group._count.memberships,
          id: group.id,
          name: group.name,
          slug: group.slug,
          status: group.status,
          teacher: group.teacher.displayName,
        })),
        null,
        2,
      )}\n`,
    );
    return;
  }

  const group = await database.group.findFirst({
    select: { id: true, name: true, slug: true, teacherId: true },
    where:
      target.kind === 'id'
        ? { id: target.value, status: { not: 'DELETED' } }
        : { slug: target.value, status: { not: 'DELETED' } },
  });
  if (group === null)
    throw new Error('The requested target group was not found');

  const namespace = group.slug.replaceAll(/[^a-z0-9-]/gi, '-').toLowerCase();
  const result = await database.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT id FROM groups WHERE id = ${group.id}::uuid FOR UPDATE`;
    const fixtureEmails = FICTIONAL_LEARNERS.map(
      (learner) => `${learner.emailLocalPart}.${namespace}@example.com`,
    );
    const existingFixtureUsers = await transaction.user.findMany({
      select: { id: true },
      where: { email: { in: fixtureEmails } },
    });
    const fixtureUserIds = existingFixtureUsers.map((user) => user.id);
    const otherCurrentCount = await transaction.groupMembership.count({
      where: {
        endedAt: null,
        groupId: group.id,
        ...(fixtureUserIds.length === 0
          ? {}
          : { studentId: { notIn: fixtureUserIds } }),
      },
    });
    const importedCurrentCount = FICTIONAL_LEARNERS.filter(
      (learner) => learner.status !== 'DEPARTED',
    ).length;
    if (otherCurrentCount + importedCurrentCount > 15) {
      throw new Error('Import would exceed the group capacity of 15 learners');
    }

    const billingMonth = startOfCurrentUtcMonth();
    const dueDate = new Date(Date.now() - 86_400_000);
    const departedAt = new Date(Date.now() - 86_400_000);
    const departedStartedAt = new Date(Date.now() - 30 * 86_400_000);
    for (const learner of FICTIONAL_LEARNERS) {
      const email = `${learner.emailLocalPart}.${namespace}@example.com`;
      const student = await transaction.user.upsert({
        create: {
          displayName: learner.displayName,
          email,
          role: UserRole.STUDENT,
          status: UserStatus.ACTIVE,
        },
        update: {
          displayName: learner.displayName,
          status: UserStatus.ACTIVE,
        },
        where: { email },
      });
      const currentMembership = await transaction.groupMembership.findFirst({
        select: { groupId: true, id: true },
        where: { endedAt: null, studentId: student.id },
      });
      if (
        currentMembership !== null &&
        currentMembership.groupId !== group.id
      ) {
        throw new Error(
          `${email} already has a current membership in another group`,
        );
      }
      const latestTargetMembership =
        await transaction.groupMembership.findFirst({
          orderBy: { startedAt: 'desc' },
          select: { endedAt: true, id: true },
          where: { groupId: group.id, studentId: student.id },
        });

      if (learner.status === 'DEPARTED') {
        if (latestTargetMembership === null) {
          await transaction.groupMembership.create({
            data: {
              endedAt: departedAt,
              groupId: group.id,
              startedAt: departedStartedAt,
              studentId: student.id,
            },
          });
        } else if (latestTargetMembership.endedAt === null) {
          await transaction.groupMembership.update({
            data: { endedAt: new Date() },
            where: { id: latestTargetMembership.id },
          });
        }
        continue;
      }

      const participationStatus =
        learner.status === 'PAUSED'
          ? GroupMembershipStatus.PAUSED
          : GroupMembershipStatus.ACTIVE;
      const membership =
        currentMembership === null
          ? await transaction.groupMembership.create({
              data: {
                groupId: group.id,
                participationStatus,
                studentId: student.id,
              },
            })
          : await transaction.groupMembership.update({
              data: { participationStatus },
              where: { id: currentMembership.id },
            });

      if (learner.status === 'DEBTOR') {
        const existingCharge = await transaction.tuitionCharge.findUnique({
          select: { id: true },
          where: {
            studentId_billingMonth: {
              billingMonth,
              studentId: student.id,
            },
          },
        });
        if (existingCharge === null) {
          await transaction.tuitionCharge.create({
            data: {
              amountUzs: 1_000_000n,
              billingMonth,
              dueDate,
              groupMembershipId: membership.id,
              studentId: student.id,
            },
          });
        }
      }
    }

    const existingAudit = await transaction.auditLog.findFirst({
      select: { id: true },
      where: {
        action: 'TEACHER_GROUP_ROSTER_IMPORTED',
        correlationId: 'local-teacher-roster-v1',
        targetId: group.id,
      },
    });
    if (existingAudit === null) {
      await transaction.auditLog.create({
        data: {
          action: 'TEACHER_GROUP_ROSTER_IMPORTED',
          actorId: group.teacherId,
          correlationId: 'local-teacher-roster-v1',
          newValues: {
            active: 8,
            currentTotal: 11,
            debtors: 2,
            departed: 1,
            historicalTotal: 12,
            paused: 1,
          },
          targetId: group.id,
          targetType: 'GROUP',
        },
      });
    }

    return {
      currentTotal: await transaction.groupMembership.count({
        where: { endedAt: null, groupId: group.id },
      }),
      historicalTotal: await transaction.groupMembership.count({
        where: { groupId: group.id },
      }),
    };
  });

  process.stdout.write(
    `${JSON.stringify({ group: { id: group.id, name: group.name, slug: group.slug }, ...result }, null, 2)}\n`,
  );
}

function parseTarget(
  arguments_: readonly string[],
): { readonly kind: 'id' | 'slug'; readonly value: string } | undefined {
  const idIndex = arguments_.indexOf('--group-id');
  if (idIndex >= 0) {
    const value = arguments_[idIndex + 1]?.trim();
    if (value === undefined || value.length === 0) {
      throw new Error('--group-id requires a UUID');
    }
    return { kind: 'id', value };
  }
  const slugIndex = arguments_.indexOf('--group-slug');
  if (slugIndex >= 0) {
    const value = arguments_[slugIndex + 1]?.trim();
    if (value === undefined || value.length === 0) {
      throw new Error('--group-slug requires a value');
    }
    return { kind: 'slug', value };
  }
  return undefined;
}

function startOfCurrentUtcMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

main()
  .catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : 'Unknown import error';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => database.$disconnect());

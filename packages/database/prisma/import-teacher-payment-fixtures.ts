import { createRequire } from 'node:module';

import type * as DatabasePackage from '../src/index.ts';

const require = createRequire(import.meta.url);
const { createDatabaseClient, UserRole, UserStatus } =
  require('../dist/src/index.js') as typeof DatabasePackage;

const database = createDatabaseClient();
const DEBTOR_PAYMENT_AMOUNTS = [
  50_000n,
  75_000n,
  100_000n,
  125_000n,
  150_000n,
  175_000n,
  200_000n,
  225_000n,
  250_000n,
] as const;
const FULL_PAYMENT_AMOUNT = 300_000n;
const FIXTURE_REFERENCE_PREFIX = 'best-local-payment-v1';

async function main(): Promise<void> {
  assertLocalDevelopmentDatabase();
  const apply = process.argv.includes('--apply');
  const teacherEmail = (
    process.env.BEST_FIXTURE_TEACHER_EMAIL ?? 'ibrohim_gaffarov@gmail.com'
  )
    .trim()
    .toLowerCase();
  const teacher = await database.user.findFirst({
    select: { displayName: true, id: true },
    where: { email: teacherEmail, role: UserRole.TEACHER },
  });
  if (teacher === null)
    throw new Error('Fixture Teacher account was not found');

  const now = new Date();
  const billingMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const dueDate = new Date(
    Math.min(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 5),
      now.getTime() - 86_400_000,
    ),
  );
  const memberships = await database.groupMembership.findMany({
    orderBy: [{ groupId: 'asc' }, { studentId: 'asc' }],
    select: {
      group: { select: { id: true, name: true } },
      id: true,
      student: { select: { displayName: true, id: true } },
      tuitionCharges: {
        select: {
          allocations: {
            select: {
              amountUzs: true,
              payment: { select: { id: true, transactionReference: true } },
            },
          },
          amountUzs: true,
          billingMonth: true,
          dueDate: true,
          id: true,
        },
      },
    },
    where: {
      endedAt: null,
      group: { status: { not: 'DELETED' }, teacherId: teacher.id },
      student: { status: { not: UserStatus.DELETED } },
    },
  });
  const duplicateStudents = memberships.filter(
    (membership, index) =>
      memberships.findIndex(
        (candidate) => candidate.student.id === membership.student.id,
      ) !== index,
  );
  if (duplicateStudents.length > 0) {
    throw new Error('A fixture Student has more than one current membership');
  }

  let debtorIndex = 0;
  const plan = memberships.map((membership, index) => {
    const outstanding = membership.tuitionCharges.reduce((total, charge) => {
      if (charge.dueDate.getTime() >= now.getTime()) return total;
      const allocated = charge.allocations.reduce(
        (sum, allocation) => sum + allocation.amountUzs,
        0n,
      );
      const chargeOutstanding = charge.amountUzs - allocated;
      return chargeOutstanding > 0n ? total + chargeOutstanding : total;
    }, 0n);
    const isDebtor = outstanding > 0n;
    const targetPaidAmount = isDebtor
      ? DEBTOR_PAYMENT_AMOUNTS[debtorIndex++ % DEBTOR_PAYMENT_AMOUNTS.length]
      : FULL_PAYMENT_AMOUNT;
    const currentCharge = membership.tuitionCharges.find(
      (charge) => charge.billingMonth.getTime() === billingMonth.getTime(),
    );
    const currentAllocated =
      currentCharge?.allocations.reduce(
        (sum, allocation) => sum + allocation.amountUzs,
        0n,
      ) ?? 0n;
    const reference = `${FIXTURE_REFERENCE_PREFIX}:${membership.id}`;
    const alreadyImported = membership.tuitionCharges.some((charge) =>
      charge.allocations.some(
        (allocation) => allocation.payment.transactionReference === reference,
      ),
    );
    if (!alreadyImported && currentAllocated > targetPaidAmount) {
      throw new Error(
        `${membership.student.displayName} already has more current-month payment than the fixture target`,
      );
    }
    return {
      alreadyImported,
      currentCharge,
      index,
      isDebtor,
      membership,
      paymentAmount: targetPaidAmount - currentAllocated,
      reference,
      targetPaidAmount,
    };
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        apply,
        debtors: plan.filter((item) => item.isDebtor).length,
        paid: plan.filter((item) => !item.isDebtor).length,
        pendingImports: plan.filter((item) => !item.alreadyImported).length,
        preview: plan.slice(0, 12).map((item) => ({
          amountUzs: item.targetPaidAmount.toString(),
          group: item.membership.group.name,
          student: item.membership.student.displayName,
          type: item.isDebtor ? 'DEBTOR' : 'PAID',
        })),
        teacher: teacher.displayName,
      },
      null,
      2,
    )}\n`,
  );
  if (!apply) {
    process.stdout.write(
      'Dry run only. Pass --apply to write local fixture payments.\n',
    );
    return;
  }

  for (const item of plan) {
    if (item.alreadyImported) continue;
    if (item.paymentAmount <= 0n) continue;
    await database.$transaction(async (transaction) => {
      const charge =
        item.currentCharge ??
        (await transaction.tuitionCharge.create({
          data: {
            amountUzs: FULL_PAYMENT_AMOUNT,
            billingMonth,
            dueDate,
            groupMembershipId: item.membership.id,
            studentId: item.membership.student.id,
          },
          select: { amountUzs: true, id: true },
        }));
      if (charge.amountUzs < item.targetPaidAmount) {
        throw new Error(
          'Current charge is smaller than the fixture payment target',
        );
      }
      const paidAt = new Date(now.getTime() - (item.index % 20) * 86_400_000);
      const payment = await transaction.payment.create({
        data: {
          amountUzs: item.paymentAmount,
          method: 'CASH',
          note: 'Fictional local-development payment fixture.',
          paidAt,
          recordedById: teacher.id,
          studentId: item.membership.student.id,
          transactionReference: item.reference,
        },
        select: { id: true },
      });
      await transaction.paymentAllocation.create({
        data: {
          amountUzs: item.paymentAmount,
          chargeId: charge.id,
          paymentId: payment.id,
        },
      });
    });
  }

  process.stdout.write(
    `Imported fictional payment history for ${plan.filter((item) => !item.alreadyImported).length} Students.\n`,
  );
}

function assertLocalDevelopmentDatabase(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Teacher payment fixtures are disabled in production');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const host = new URL(databaseUrl).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(
      'Teacher payment fixtures are limited to loopback PostgreSQL',
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

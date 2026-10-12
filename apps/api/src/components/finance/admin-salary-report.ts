import type { Prisma } from '@best/database';
import type { DatabaseService } from '../../database/database.service';
import {
  directoryError,
  directoryInput,
  directoryPage,
} from '../../libs/pagination/admin-directory';
import { AdminDirectoryInput } from '../../schemas/groups/admin-directory.input';

// Read-only revenue attribution. No salary statement, payout or ledger writes.
const allocationInclude = {
  payment: { select: { paidAt: true, note: true } },
  charge: {
    select: {
      student: { select: { id: true, displayName: true } },
      groupMembership: {
        select: {
          group: {
            select: {
              id: true,
              name: true,
              teacher: { select: { id: true, displayName: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.PaymentAllocationInclude;

export function salarySplit(amount: bigint) {
  const teacher = (amount * 70n) / 100n;
  return { teacher, center: amount - teacher };
}
export function salaryMonth(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
  }).format(date);
}
export function salaryMonthRange(month: string) {
  const start = new Date(`${month}-01T00:00:00+05:00`);
  if (!Number.isFinite(start.getTime())) throw directoryError('Invalid month');
  const next = new Date(`${month}-01T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return {
    gte: start,
    lt: new Date(`${next.toISOString().slice(0, 7)}-01T00:00:00+05:00`),
  };
}
function previousMonth(month: string) {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}
async function allocations(
  database: DatabaseService,
  input: AdminDirectoryInput,
  month?: string,
) {
  return database.paymentAllocation.findMany({
    where: {
      amountUzs: { gt: 0n },
      ...(month ? { payment: { paidAt: salaryMonthRange(month) } } : {}),
      charge: {
        groupMembership: {
          group: {
            ...(input.groupId ? { id: input.groupId } : {}),
            teacher: {
              ...(input.teacherId ? { id: input.teacherId } : {}),
              ...(input.search
                ? {
                    displayName: {
                      contains: input.search,
                      mode: 'insensitive',
                    },
                  }
                : {}),
            },
          },
        },
      },
    },
    include: allocationInclude,
    orderBy: [{ payment: { paidAt: 'desc' } }, { id: 'asc' }],
  });
}
type Allocation = Awaited<ReturnType<typeof allocations>>[number];
function totals(rows: Allocation[]) {
  let received = 0n,
    teacher = 0n,
    center = 0n;
  for (const row of rows) {
    const split = salarySplit(row.amountUzs);
    received += row.amountUzs;
    teacher += split.teacher;
    center += split.center;
  }
  return {
    receivedUzs: received.toString(),
    teacherUzs: teacher.toString(),
    centerUzs: center.toString(),
  };
}
function validate(raw: AdminDirectoryInput) {
  const input = directoryInput(Object.assign(new AdminDirectoryInput(), raw));
  if (input.status || input.studentId || input.from || input.to)
    throw directoryError('Unsupported salary filter');
  if (input.month && !/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(input.month))
    throw directoryError('Invalid salary month');
  return input;
}
export async function adminSalaryReport(
  database: DatabaseService,
  raw: AdminDirectoryInput,
) {
  const input = validate(raw);
  const rows = await allocations(database, input, input.month);
  const buckets = new Map<string, Allocation[]>();
  for (const row of rows) {
    const key = `${row.charge.groupMembership.group.teacher.id}:${salaryMonth(row.payment.paidAt)}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(row);
    buckets.set(key, bucket);
  }
  const mapped = [...buckets.entries()]
    .map(([id, entries]) => {
      const first = entries[0];
      if (!first) throw directoryError('Empty salary group');
      const teacher = first.charge.groupMembership.group.teacher;
      return {
        id,
        teacherId: teacher.id,
        teacherName: teacher.displayName,
        month: salaryMonth(first.payment.paidAt),
        ...totals(entries),
        groupCount: new Set(
          entries.map((r) => r.charge.groupMembership.group.id),
        ).size,
        studentCount: new Set(entries.map((r) => r.charge.student.id)).size,
        paymentCount: entries.length,
      };
    })
    .sort(
      (a, b) =>
        (a.teacherName.localeCompare(b.teacherName) ||
          b.month.localeCompare(a.month) ||
          a.id.localeCompare(b.id)) * (input.descending ? -1 : 1),
    );
  const previous = input.month ? previousMonth(input.month) : null;
  return {
    ...directoryPage(mapped, input),
    ...totals(rows),
    previousMonth: previous,
    previousReceivedUzs: previous
      ? totals(await allocations(database, input, previous)).receivedUzs
      : null,
  };
}
export async function adminSalaryHistory(
  database: DatabaseService,
  raw: AdminDirectoryInput,
) {
  const input = validate(raw);
  if (!input.teacherId || !input.month)
    throw directoryError('Teacher and month required');
  const rows = await allocations(database, input, input.month);
  const groups = new Map<string, Allocation[]>();
  for (const row of rows) {
    const key = row.charge.groupMembership.group.id;
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }
  return {
    ...directoryPage(
      rows.map((row) => {
        const split = salarySplit(row.amountUzs);
        return {
          id: row.id,
          studentName: row.charge.student.displayName,
          groupName: row.charge.groupMembership.group.name,
          paidAt: row.payment.paidAt.toISOString(),
          receivedUzs: row.amountUzs.toString(),
          teacherUzs: split.teacher.toString(),
          centerUzs: split.center.toString(),
          note: row.payment.note,
        };
      }),
      input,
    ),
    groups: [...groups.entries()]
      .map(([id, entries]) => {
        const first = entries[0];
        if (!first) throw directoryError('Empty salary group');
        return {
          id,
          name: first.charge.groupMembership.group.name,
          ...totals(entries),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

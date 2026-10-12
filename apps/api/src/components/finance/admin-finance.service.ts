import { adminSalaryReport, adminSalaryHistory } from './admin-salary-report';
import { ContentStatus, Prisma, UserRole, UserStatus } from '@best/database';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  directoryInput,
  directoryPage,
  directoryError,
  directoryEnum,
  wholeUzs,
} from '../../libs/pagination/admin-directory';
import { parseUuid } from '../../libs/pagination/cursor-pagination';
import type { AdminDirectoryInput } from '../../schemas/groups/admin-directory.input';
import type { AdminSaveSalaryInput } from '../../schemas/finance/admin-salary.input';
import { TuitionLedgerStatus } from '../../schemas/finance/tuition-ledger.object';
import { mapLedgerCharge } from './finance.service';
const salaryInclude = {
  teacher: {
    include: {
      ownedGroups: {
        where: { status: ContentStatus.ACTIVE },
        select: {
          _count: { select: { memberships: { where: { endedAt: null } } } },
        },
      },
    },
  },
} satisfies Prisma.TeacherSalaryStatementInclude;
const paymentInclude = {
  adjustments: true,
  allocations: { include: { payment: true } },
  groupMembership: { include: { group: true } },
  student: { select: { id: true, displayName: true } },
} satisfies Prisma.TuitionChargeInclude;
function paymentRow(
  row: Prisma.TuitionChargeGetPayload<{ include: typeof paymentInclude }>,
) {
  const ledger = mapLedgerCharge(row, new Date());
  return {
    id: row.id,
    studentId: row.studentId,
    studentName: row.student.displayName,
    groupId: ledger.groupId,
    groupName: ledger.groupName,
    month: row.billingMonth.toISOString().slice(0, 7),
    dueDate: row.dueDate.toISOString(),
    amountUzs: ledger.amountUzs,
    paidUzs: ledger.allocatedAmountUzs,
    balanceUzs: ledger.outstandingAmountUzs,
    adjustmentUzs: ledger.adjustmentAmountUzs,
    status: ledger.status === TuitionLedgerStatus.PAID ? 'PAID' : 'UNPAID',
    events: [
      ...row.allocations.map((a) => ({
        id: a.id,
        kind: 'PAYMENT',
        amountUzs: a.amountUzs.toString(),
        date: a.payment.paidAt.toISOString(),
        note: a.payment.note,
      })),
      ...row.adjustments.map((a) => ({
        id: a.id,
        kind: a.kind,
        amountUzs: a.amountUzs.toString(),
        date: a.createdAt.toISOString(),
        note: a.reason,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
function salaryRow(
  row: Prisma.TeacherSalaryStatementGetPayload<{
    include: typeof salaryInclude;
  }>,
) {
  return {
    id: row.id,
    teacherId: row.teacherId,
    teacherName: row.teacher.displayName,
    month: row.month,
    baseUzs: row.baseUzs.toString(),
    bonusUzs: row.bonusUzs.toString(),
    deductionUzs: row.deductionUzs.toString(),
    netUzs: (row.baseUzs + row.bonusUzs - row.deductionUzs).toString(),
    note: row.note,
    version: row.version,
    status: row.finalizedAt ? 'FINALIZED' : 'DRAFT',
    groupCount: row.teacher.ownedGroups.length,
    studentCount: row.teacher.ownedGroups.reduce(
      (n, g) => n + g._count.memberships,
      0,
    ),
  };
}
@Injectable()
export class AdminFinanceService {
  constructor(private readonly database: DatabaseService) {}
  salaryReport(input: AdminDirectoryInput) {
    return adminSalaryReport(this.database, input);
  }
  salaryHistory(input: AdminDirectoryInput) {
    return adminSalaryHistory(this.database, input);
  }
  async payments(raw: AdminDirectoryInput) {
    const input = directoryInput(raw);
    const status = directoryEnum(input.status, ['PAID', 'UNPAID']);
    const rows = await this.database.tuitionCharge.findMany({
      where: {
        ...(input.studentId ? { studentId: input.studentId } : {}),
        ...(input.groupId
          ? { groupMembership: { groupId: input.groupId } }
          : {}),
        ...(input.month
          ? { billingMonth: new Date(input.month + '-01T00:00:00Z') }
          : {}),
        ...(input.search
          ? {
              OR: [
                {
                  student: {
                    displayName: {
                      contains: input.search,
                      mode: 'insensitive',
                    },
                  },
                },
                {
                  groupMembership: {
                    group: {
                      name: { contains: input.search, mode: 'insensitive' },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      include: paymentInclude,
      orderBy: [
        { billingMonth: input.descending ? 'asc' : 'desc' },
        { id: 'asc' },
      ],
    });
    const mapped = rows
      .map(paymentRow)
      .filter((r) => !status || r.status === status)
      .sort(
        (a, b) =>
          (a.studentName.localeCompare(b.studentName) ||
            a.id.localeCompare(b.id)) * (input.descending ? -1 : 1),
      );
    const sum = (
      key: 'amountUzs' | 'paidUzs' | 'balanceUzs' | 'adjustmentUzs',
    ) => mapped.reduce((n, r) => n + BigInt(r[key]), 0n);
    const total = sum('amountUzs') + sum('adjustmentUzs'),
      paid = sum('paidUzs');
    return {
      ...directoryPage(mapped, input),
      metrics: [
        { key: 'billed', value: total.toString() },
        { key: 'paid', value: paid.toString() },
        {
          key: 'UNPAID',
          value: String(mapped.filter((r) => r.status === 'UNPAID').length),
        },
        { key: 'outstanding', value: sum('balanceUzs').toString() },
        {
          key: 'collection',
          value: total > 0n ? String(Number((paid * 1000n) / total) / 10) : '0',
        },
      ],
    };
  }
  async payment(idInput: string) {
    const id = parseUuid(idInput, 'chargeId');
    const row = await this.database.tuitionCharge.findUnique({
      where: { id },
      include: paymentInclude,
    });
    if (!row) throw directoryError('Charge not found');
    return paymentRow(row);
  }
  async salaries(raw: AdminDirectoryInput) {
    const input = directoryInput(raw);
    const status = directoryEnum(input.status, ['DRAFT', 'FINALIZED']);
    const rows = await this.database.teacherSalaryStatement.findMany({
      where: {
        ...(input.teacherId ? { teacherId: input.teacherId } : {}),
        ...(input.month ? { month: input.month } : {}),
        ...(status
          ? { finalizedAt: status === 'DRAFT' ? null : { not: null } }
          : {}),
        ...(input.search
          ? {
              teacher: {
                displayName: { contains: input.search, mode: 'insensitive' },
              },
            }
          : {}),
      },
      include: salaryInclude,
      orderBy: [{ month: input.descending ? 'asc' : 'desc' }, { id: 'asc' }],
    });
    const sum = (key: 'baseUzs' | 'bonusUzs' | 'deductionUzs') =>
      rows.reduce((n, r) => n + r[key], 0n);
    return {
      ...directoryPage(
        rows
          .map(salaryRow)
          .sort(
            (a, b) =>
              (a.teacherName.localeCompare(b.teacherName) ||
                a.id.localeCompare(b.id)) * (input.descending ? -1 : 1),
          ),
        input,
      ),
      metrics: [
        {
          key: 'payable',
          value: (
            sum('baseUzs') +
            sum('bonusUzs') -
            sum('deductionUzs')
          ).toString(),
        },
        {
          key: 'FINALIZED',
          value: String(rows.filter((r) => r.finalizedAt).length),
        },
        {
          key: 'DRAFT',
          value: String(rows.filter((r) => !r.finalizedAt).length),
        },
        { key: 'bonus', value: sum('bonusUzs').toString() },
        { key: 'deduction', value: sum('deductionUzs').toString() },
      ],
    };
  }
  async saveSalary(
    actorId: string,
    input: AdminSaveSalaryInput,
    correlationId?: string,
  ) {
    const teacherId = parseUuid(input.teacherId, 'teacherId');
    directoryInput({
      page: 1,
      pageSize: 15,
      descending: false,
      month: input.month,
    });
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(input.month))
      throw directoryError('Invalid salary month');
    const baseUzs = wholeUzs(input.baseUzs),
      bonusUzs = wholeUzs(input.bonusUzs),
      deductionUzs = wholeUzs(input.deductionUzs);
    if (deductionUzs > baseUzs + bonusUzs || (input.note?.length ?? 0) > 1000)
      throw directoryError('Invalid salary amounts or note');
    const id = input.id ? parseUuid(input.id, 'id') : undefined;
    return this.database.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('salary-statement'),hashtext(${teacherId + input.month}))`;
      if (
        !(await tx.user.count({
          where: {
            id: teacherId,
            role: UserRole.TEACHER,
            status: { not: UserStatus.DELETED },
          },
        }))
      )
        throw directoryError('Teacher unavailable');
      const data = {
        baseUzs,
        bonusUzs,
        deductionUzs,
        note: input.note?.trim() ? input.note.trim() : null,
      };
      let result;
      if (id) {
        if (input.version === undefined || !Number.isInteger(input.version))
          throw directoryError('Version required');
        const updated = await tx.teacherSalaryStatement.updateMany({
          where: {
            id,
            teacherId,
            month: input.month,
            finalizedAt: null,
            version: input.version,
          },
          data: { ...data, version: { increment: 1 } },
        });
        if (updated.count !== 1)
          throw directoryError(
            'Statement changed or finalized; reload before saving',
            true,
          );
        result = await tx.teacherSalaryStatement.findUniqueOrThrow({
          where: { id },
          include: salaryInclude,
        });
      } else {
        if (
          await tx.teacherSalaryStatement.count({
            where: { teacherId, month: input.month },
          })
        )
          throw directoryError(
            'A statement already exists for this month',
            true,
          );
        result = await tx.teacherSalaryStatement.create({
          data: {
            ...data,
            teacherId,
            month: input.month,
            createdById: actorId,
          },
          include: salaryInclude,
        });
      }
      await tx.auditLog.create({
        data: {
          actorId,
          action: id ? 'SALARY_UPDATED' : 'SALARY_CREATED',
          targetId: result.id,
          targetType: 'SALARY',
          correlationId: correlationId ?? null,
          newValues: {
            baseUzs: input.baseUzs,
            bonusUzs: input.bonusUzs,
            deductionUzs: input.deductionUzs,
            month: input.month,
          },
        },
      });
      return salaryRow(result);
    });
  }
  async finalize(
    actorId: string,
    idInput: string,
    version: number,
    correlationId?: string,
  ) {
    const id = parseUuid(idInput, 'id');
    return this.database.$transaction(async (tx) => {
      const result = await tx.teacherSalaryStatement.updateMany({
        where: { id, version, finalizedAt: null },
        data: { finalizedAt: new Date(), version: { increment: 1 } },
      });
      if (result.count !== 1)
        throw directoryError('Statement changed or already finalized', true);
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'SALARY_FINALIZED',
          targetId: id,
          targetType: 'SALARY',
          correlationId: correlationId ?? null,
        },
      });
      return salaryRow(
        await tx.teacherSalaryStatement.findUniqueOrThrow({
          where: { id },
          include: salaryInclude,
        }),
      );
    });
  }
}

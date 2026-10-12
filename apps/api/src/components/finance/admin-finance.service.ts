import { adminSalaryReport, adminSalaryHistory } from './admin-salary-report';
import { Prisma } from '@best/database';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  directoryInput,
  directoryPage,
  directoryError,
  directoryEnum,
} from '../../libs/pagination/admin-directory';
import { parseUuid } from '../../libs/pagination/cursor-pagination';
import type { AdminDirectoryInput } from '../../schemas/groups/admin-directory.input';
import { TuitionLedgerStatus } from '../../schemas/finance/tuition-ledger.object';
import { mapLedgerCharge } from './finance.service';
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
}

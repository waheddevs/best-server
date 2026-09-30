import { FinanceAdjustmentKind } from '@best/database';
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import { ErrorCode } from '../../libs/enums/error-code.enum';
import { ApplicationError } from '../../libs/errors/application.error';
import {
  decodeCursor,
  encodeCursor,
  parsePageSize,
} from '../../libs/pagination/cursor-pagination';
import {
  TuitionLedgerStatus,
  type TuitionLedgerConnectionObject,
} from '../../schemas/finance/tuition-ledger.object';
import type {
  TeacherFinanceSnapshotObject,
  TeacherFinanceYearObject,
} from '../../schemas/finance/teacher-finance.object';

interface LedgerScope {
  studentId?: string;
}

interface LedgerCharge {
  adjustments: readonly { amountUzs: bigint; kind: FinanceAdjustmentKind }[];
  allocations: readonly { amountUzs: bigint }[];
  amountUzs: bigint;
  billingMonth: Date;
  dueDate: Date;
  groupMembership: { group: { id: string; name: string } };
  id: string;
  student: { displayName: string; id: string };
}

@Injectable()
export class FinanceService {
  constructor(private readonly database: DatabaseService) {}

  getStudentLedger(
    studentId: string,
    first: number | undefined,
    after: string | undefined,
  ): Promise<TuitionLedgerConnectionObject> {
    return this.getLedger({ studentId }, first, after);
  }

  getAdminLedger(
    studentId: string | undefined,
    first: number | undefined,
    after: string | undefined,
  ): Promise<TuitionLedgerConnectionObject> {
    return this.getLedger(
      studentId === undefined ? {} : { studentId },
      first,
      after,
    );
  }

  async getTeacherFinanceYear(
    teacherId: string,
    year: number,
  ): Promise<TeacherFinanceYearObject> {
    const currentYear = new Date().getUTCFullYear();
    if (!Number.isInteger(year) || year < 2018 || year > currentYear) {
      throw new ApplicationError(
        ErrorCode.BAD_USER_INPUT,
        `Year must be between 2018 and ${String(currentYear)}`,
        400,
      );
    }
    const snapshots = await this.database.teacherFinanceSnapshot.findMany({
      orderBy: { month: 'desc' },
      where: { teacherId, year },
    });
    return {
      snapshots: snapshots.map(mapTeacherFinanceSnapshot),
      year,
    };
  }

  private async getLedger(
    scope: LedgerScope,
    first: number | undefined,
    after: string | undefined,
  ): Promise<TuitionLedgerConnectionObject> {
    const pageSize = parsePageSize(first);
    const afterId = decodeCursor(after);
    const charges = await this.database.tuitionCharge.findMany({
      include: {
        adjustments: { select: { amountUzs: true, kind: true } },
        allocations: { select: { amountUzs: true } },
        groupMembership: {
          select: { group: { select: { id: true, name: true } } },
        },
        student: { select: { displayName: true, id: true } },
      },
      orderBy: { id: 'asc' },
      take: pageSize + 1,
      where: {
        ...(afterId === undefined ? {} : { id: { gt: afterId } }),
        ...(scope.studentId === undefined
          ? {}
          : { studentId: scope.studentId }),
      },
    });
    const hasNextPage = charges.length > pageSize;
    const page = hasNextPage ? charges.slice(0, pageSize) : charges;
    const now = new Date();
    const edges = page.map((charge) => ({
      cursor: encodeCursor(charge.id),
      node: mapLedgerCharge(charge, now),
    }));

    return {
      edges,
      pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
    };
  }
}

export function mapTeacherFinanceSnapshot(snapshot: {
  activeGroups: number;
  activeLearners: number;
  attendanceRate: { toString(): string };
  expectedAmountUzs: bigint;
  expensesUzs: bigint;
  incomeUzs: bigint;
  month: number;
  penaltiesUzs: bigint;
  year: number;
}): TeacherFinanceSnapshotObject {
  const debt =
    snapshot.expectedAmountUzs > snapshot.incomeUzs
      ? snapshot.expectedAmountUzs - snapshot.incomeUzs
      : 0n;
  const paymentRate =
    snapshot.expectedAmountUzs === 0n
      ? 0
      : Number((snapshot.incomeUzs * 1_000n) / snapshot.expectedAmountUzs) / 10;
  return {
    activeGroups: snapshot.activeGroups,
    activeLearners: snapshot.activeLearners,
    attendanceRate: Number(snapshot.attendanceRate.toString()),
    debtUzs: debt.toString(),
    expectedAmountUzs: snapshot.expectedAmountUzs.toString(),
    expensesUzs: snapshot.expensesUzs.toString(),
    incomeUzs: snapshot.incomeUzs.toString(),
    month: snapshot.month,
    paymentRate,
    penaltiesUzs: snapshot.penaltiesUzs.toString(),
    year: snapshot.year,
  };
}

export function mapLedgerCharge(charge: LedgerCharge, now: Date) {
  const allocatedAmount = charge.allocations.reduce(
    (total, allocation) => total + allocation.amountUzs,
    0n,
  );
  const adjustmentAmount = charge.adjustments.reduce((total, adjustment) => {
    const direction =
      adjustment.kind === FinanceAdjustmentKind.DEBIT ? 1n : -1n;
    return total + adjustment.amountUzs * direction;
  }, 0n);
  const adjustedAmount = charge.amountUzs + adjustmentAmount;
  const outstandingAmount =
    adjustedAmount > allocatedAmount ? adjustedAmount - allocatedAmount : 0n;
  const status =
    outstandingAmount === 0n
      ? TuitionLedgerStatus.PAID
      : charge.dueDate.getTime() < now.getTime()
        ? TuitionLedgerStatus.OVERDUE
        : TuitionLedgerStatus.DUE;

  return {
    adjustmentAmountUzs: adjustmentAmount.toString(),
    allocatedAmountUzs: allocatedAmount.toString(),
    amountUzs: charge.amountUzs.toString(),
    billingMonth: charge.billingMonth,
    chargeId: charge.id,
    dueDate: charge.dueDate,
    groupId: charge.groupMembership.group.id,
    groupName: charge.groupMembership.group.name,
    outstandingAmountUzs: outstandingAmount.toString(),
    status,
    studentDisplayName: charge.student.displayName,
    studentId: charge.student.id,
  };
}

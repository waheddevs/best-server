import {
  ContentStatus,
  FinanceAdjustmentKind,
  UserStatus,
} from '@best/database';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';

const POLL_INTERVAL_MS = 60 * 60 * 1_000;
const BATCH_SIZE = 100;

@Injectable()
export class DebtNotificationReconcilerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(DebtNotificationReconcilerService.name);
  private interval: NodeJS.Timeout | undefined;
  private running = false;

  constructor(private readonly database: DatabaseService) {}

  onModuleInit(): void {
    void this.reconcile().catch(() => {
      this.logger.error('Debt notification reconciliation failed');
    });
    this.interval = setInterval(() => {
      void this.reconcile().catch(() => {
        this.logger.error('Debt notification reconciliation failed');
      });
    }, POLL_INTERVAL_MS);
    this.interval.unref();
  }

  onModuleDestroy(): void {
    if (this.interval !== undefined) clearInterval(this.interval);
  }

  async reconcile(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const today = tashkentDateStart(now);
      let cursor: string | undefined;
      let hasMore = true;
      while (hasMore) {
        const charges = await this.database.tuitionCharge.findMany({
          where: {
            dueDate: { lt: today },
            groupMembership: {
              endedAt: null,
              group: { status: ContentStatus.ACTIVE },
            },
            student: { status: UserStatus.ACTIVE },
          },
          orderBy: { id: 'asc' },
          take: BATCH_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          select: { id: true },
        });
        for (const charge of charges) await this.reconcileCharge(charge.id);
        hasMore = charges.length === BATCH_SIZE;
        cursor = charges.at(-1)?.id;
      }
    } finally {
      this.running = false;
    }
  }

  private async reconcileCharge(chargeId: string): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${chargeId}))`;
      const charge = await transaction.tuitionCharge.findUnique({
        where: { id: chargeId },
        select: {
          amountUzs: true,
          groupMembershipId: true,
          id: true,
          studentId: true,
        },
      });
      if (charge === null) return;
      const membership = await transaction.groupMembership.findUnique({
        where: { id: charge.groupMembershipId },
        select: { endedAt: true, groupId: true },
      });
      if (membership?.endedAt !== null) return;
      const group = await transaction.group.findUnique({
        where: { id: membership.groupId },
        select: { id: true, status: true, teacherId: true },
      });
      if (group?.status !== ContentStatus.ACTIVE) return;
      const student = await transaction.user.findUnique({
        where: { id: charge.studentId },
        select: { status: true },
      });
      if (student?.status !== UserStatus.ACTIVE) return;
      const adjustments = await transaction.financeAdjustment.findMany({
        where: { chargeId: charge.id },
        select: { amountUzs: true, kind: true },
      });
      const allocations = await transaction.paymentAllocation.findMany({
        where: { chargeId: charge.id },
        select: { amountUzs: true },
      });

      const teacherId = group.teacherId;
      const eventKey = `debt-follow-up:${charge.id}`;
      const existing = await transaction.notification.findUnique({
        where: { recipientId_eventKey: { recipientId: teacherId, eventKey } },
        select: { id: true },
      });
      const outstanding = overdueBalance({
        adjustments,
        allocations,
        amountUzs: charge.amountUzs,
      });
      if (outstanding <= 0n || existing !== null) return;
      await transaction.notification.create({
        data: {
          recipientId: teacherId,
          eventKey,
          kind: 'DEBT_FOLLOW_UP',
          title: 'Overdue balance needs follow-up',
          body: 'A student in your group has an overdue tuition balance.',
          payload: {
            chargeId: charge.id,
            groupId: group.id,
            studentId: charge.studentId,
          },
        },
      });
    });
  }
}

function overdueBalance(charge: {
  amountUzs: bigint;
  adjustments: readonly { amountUzs: bigint; kind: FinanceAdjustmentKind }[];
  allocations: readonly { amountUzs: bigint }[];
}): bigint {
  const adjusted = charge.adjustments.reduce(
    (total, adjustment) =>
      total +
      (adjustment.kind === FinanceAdjustmentKind.DEBIT
        ? adjustment.amountUzs
        : -adjustment.amountUzs),
    charge.amountUzs,
  );
  return (
    adjusted -
    charge.allocations.reduce(
      (total, allocation) => total + allocation.amountUzs,
      0n,
    )
  );
}

function tashkentDateStart(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const field = (type: string) =>
    parts.find((part) => part.type === type)?.value;
  const year = Number(field('year'));
  const month = Number(field('month'));
  const day = Number(field('day'));
  return new Date(Date.UTC(year, month - 1, day));
}

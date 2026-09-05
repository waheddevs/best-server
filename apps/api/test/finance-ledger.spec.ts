import assert from 'node:assert/strict';
import test from 'node:test';

import { FinanceAdjustmentKind } from '@best/database';

import { mapLedgerCharge } from '../src/components/finance/finance.service';
import { TuitionLedgerStatus } from '../src/schemas/finance/tuition-ledger.object';

const baseCharge = {
  adjustments: [],
  allocations: [],
  amountUzs: 1_200_000n,
  billingMonth: new Date('2026-09-01T00:00:00.000Z'),
  dueDate: new Date('2026-09-15T00:00:00.000Z'),
  groupMembership: { group: { id: 'group-1', name: 'B2-04' } },
  id: 'charge-1',
  student: { displayName: 'Preview Student', id: 'student-1' },
};

void test('marks a fully allocated charge as paid', () => {
  const ledger = mapLedgerCharge(
    { ...baseCharge, allocations: [{ amountUzs: 1_200_000n }] },
    new Date('2026-09-10T00:00:00.000Z'),
  );

  assert.equal(ledger.outstandingAmountUzs, '0');
  assert.equal(ledger.status, TuitionLedgerStatus.PAID);
});

void test('applies credits and debits without exposing mutable payment actions', () => {
  const ledger = mapLedgerCharge(
    {
      ...baseCharge,
      adjustments: [
        { amountUzs: 100_000n, kind: FinanceAdjustmentKind.CREDIT },
        { amountUzs: 50_000n, kind: FinanceAdjustmentKind.DEBIT },
      ],
      allocations: [{ amountUzs: 900_000n }],
    },
    new Date('2026-09-10T00:00:00.000Z'),
  );

  assert.equal(ledger.adjustmentAmountUzs, '-50000');
  assert.equal(ledger.outstandingAmountUzs, '250000');
  assert.equal(ledger.status, TuitionLedgerStatus.DUE);
});

void test('marks unpaid past-due charges as overdue', () => {
  const ledger = mapLedgerCharge(
    baseCharge,
    new Date('2026-10-01T00:00:00.000Z'),
  );
  assert.equal(ledger.status, TuitionLedgerStatus.OVERDUE);
});

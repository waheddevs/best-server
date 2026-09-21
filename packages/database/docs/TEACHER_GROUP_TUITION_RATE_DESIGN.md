# Teacher group tuition rate

The Teacher group form now accepts a monthly course price in whole Uzbek som, defaulting to 300,000 UZS. The price is stored in the existing `group_tuition_rates` table, not in a new column or model. No schema migration is required.

- Creating a group writes the group and its initial rate in one transaction. Only the authenticated owner can create or edit a Teacher group.
- Editing a price leaves historical rates intact. A previous open rate ends before the new effective date; a same-day correction updates that day's rate. An unchanged price does not create another row.
- Existing active groups without a rate receive a one-time, idempotent 300,000 UZS backfill through `prisma/backfill-teacher-group-rates.ts`. Deleted groups are excluded; any existing rate is preserved. The script requires `--apply`, refuses non-loopback databases, and writes audit rows. Legacy groups without a rate remain nullable in API reads until backfilled or edited.
- The rate is not itself a receivable or a payment. The existing `TuitionCharge`, `Payment`, and `PaymentAllocation` records remain the financial source of truth. Roster outstanding balance and debtor status are derived from overdue charges, while the displayed paid amount comes from allocations to the current month's charge.
- Student payment collection and charge generation are deferred to the separately approved Student payment workflow. Do not mark a learner as paid or indebted merely because a group rate exists.

Rollback: remove the group-form input and GraphQL fields while retaining the additive rate rows. Never delete historical charges or payments as part of this UI rollback.

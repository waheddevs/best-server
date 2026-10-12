# Admin salary revenue report — 2026-10-13

Owner approved automatic, read-only revenue sharing: 70% teacher / 30% center.
This replaces the manual statement UI, without deleting historical statements.
No migration or money movement is involved. Unused manual statement queries,
mutations, input/output types and frontend branches were retired during the
pre-deployment cleanup. Historical TeacherSalaryStatement records and migrations
remain intact; the Salary page only reads payment allocation reports.

Source: positive PaymentAllocation amounts linked to TuitionCharge membership,
group and teacher. Unallocated receipts, tuition rates, unpaid charges, credit/
debit adjustments and old salary statements are not revenue. A split payment is
counted once per allocation, never once per full receipt per charge.

Month uses Payment.paidAt in Asia/Tashkent, not billing month. Group ownership
uses the persisted Group.teacherId; the schema does not store ownership history.
Reassigning a group therefore changes attribution of its historical receipts.
Archived groups/memberships are included to preserve recorded revenue.

All math uses bigint. Per allocation, teacher = floor(amount * 70 / 100), center
= amount - teacher; the sub-UZS remainder goes to the center. Totals always
reconcile, including partial payments. This rounding policy is disclosed in UI.

Admin-only queries share existing AuthGuard/RolesGuard. Report rows paginate by
teacher/month; history paginates allocations, with group totals for the entire
selected teacher/month. Summary and previous-calendar-month revenue use the same
teacher/group/search filters, before pagination. All-month selection omits the
comparison. Current month is explicitly marked as in progress in the frontend.
No payout-paid/unpaid state is inferred from calculated teacher shares.

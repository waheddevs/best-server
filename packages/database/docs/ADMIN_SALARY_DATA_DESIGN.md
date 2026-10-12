# Admin operations and salary statements

Approved by the owner on 2026-10-11 together with Groups, Schedule, Payments and Settings.
Salary records are administrative statements, not payroll execution. A statement belongs to
one teacher and calendar month. Base + bonus - deduction is computed on the server in whole
UZS and must be non-negative. Drafts can be edited; finalized records are immutable.
Optimistic version checks and a transaction prevent stale updates and double finalization.
Teacher/month uniqueness prevents duplicate statements. All writes include an Admin audit
event in the same transaction. No payment, payout or provider action is introduced.

TeacherFinanceSnapshot remains an independent tuition reporting projection; its income is
never interpreted as salary. Group/learner counts are informational current counts.
Admin roles are checked by AuthGuard/RolesGuard against the current database identity.

Deploy the additive migration before the API and web. Rollback deploys the old API/web and
leaves this table intact. No existing records are rewritten or removed. Fictional fixtures
are created only by isolated integration tests. Currency uses BIGINT, exposed as strings.

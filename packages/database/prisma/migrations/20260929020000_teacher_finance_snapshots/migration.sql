-- Read-only monthly reporting projection for Teacher finance surfaces.
CREATE TABLE "teacher_finance_snapshots" (
  "id" UUID NOT NULL,
  "teacher_id" UUID NOT NULL,
  "year" SMALLINT NOT NULL,
  "month" SMALLINT NOT NULL,
  "income_uzs" BIGINT NOT NULL,
  "expected_amount_uzs" BIGINT NOT NULL,
  "expenses_uzs" BIGINT NOT NULL,
  "penalties_uzs" BIGINT NOT NULL,
  "active_learners" INTEGER NOT NULL,
  "active_groups" INTEGER NOT NULL,
  "attendance_rate" DECIMAL(5,2) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "teacher_finance_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "teacher_finance_snapshots_year_check" CHECK ("year" >= 2018),
  CONSTRAINT "teacher_finance_snapshots_month_check" CHECK ("month" BETWEEN 1 AND 12),
  CONSTRAINT "teacher_finance_snapshots_income_check" CHECK ("income_uzs" >= 0),
  CONSTRAINT "teacher_finance_snapshots_expected_check" CHECK ("expected_amount_uzs" >= 0),
  CONSTRAINT "teacher_finance_snapshots_expenses_check" CHECK ("expenses_uzs" >= 0),
  CONSTRAINT "teacher_finance_snapshots_penalties_check" CHECK ("penalties_uzs" >= 0),
  CONSTRAINT "teacher_finance_snapshots_learners_check" CHECK ("active_learners" >= 0),
  CONSTRAINT "teacher_finance_snapshots_groups_check" CHECK ("active_groups" >= 0),
  CONSTRAINT "teacher_finance_snapshots_attendance_check" CHECK ("attendance_rate" BETWEEN 0 AND 100),
  CONSTRAINT "teacher_finance_snapshots_teacher_id_fkey"
    FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "teacher_finance_snapshots_teacher_id_year_month_key"
  ON "teacher_finance_snapshots"("teacher_id", "year", "month");

CREATE INDEX "teacher_finance_snapshots_teacher_id_year_month_idx"
  ON "teacher_finance_snapshots"("teacher_id", "year", "month");

CREATE TABLE "teacher_salary_statements" (
 "id" UUID NOT NULL, "teacher_id" UUID NOT NULL, "month" VARCHAR(7) NOT NULL,
 "base_uzs" BIGINT NOT NULL, "bonus_uzs" BIGINT NOT NULL DEFAULT 0,
 "deduction_uzs" BIGINT NOT NULL DEFAULT 0, "note" VARCHAR(1000),
 "finalized_at" TIMESTAMPTZ(3), "version" INTEGER NOT NULL DEFAULT 1,
 "created_by_id" UUID NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "teacher_salary_statements_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "salary_teacher_fk" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT,
 CONSTRAINT "salary_creator_fk" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT,
 CONSTRAINT "salary_month_check" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 CONSTRAINT "salary_amounts_check" CHECK ("base_uzs" >= 0 AND "bonus_uzs" >= 0 AND "deduction_uzs" >= 0 AND "base_uzs" + "bonus_uzs" >= "deduction_uzs"),
 CONSTRAINT "salary_version_check" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "teacher_salary_statements_teacher_id_month_key" ON "teacher_salary_statements"("teacher_id", "month");
CREATE INDEX "teacher_salary_statements_month_finalized_at_idx" ON "teacher_salary_statements"("month", "finalized_at");

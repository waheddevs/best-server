import { Injectable } from '@nestjs/common';
import { Prisma } from '@best/database';
import { DatabaseService } from '../../../database/database.service';
import { emptyProgress, type ProgressMetrics } from './progress-metrics';

type ProgressGrouping = 'membership' | 'test' | 'all';

interface ProgressRow {
  key: string;
  attemptCount: number;
  averagePercentage: number | null;
  awaitingScoreCount: number;
  completedCount: number;
  failedCount: number;
  hasInProgressAttempt: boolean;
  highestPercentage: number | null;
  latestActivityAt: Date | null;
  lowestPercentage: number | null;
  passedCount: number;
  scoredCount: number;
}

@Injectable()
export class ResultsProgressService {
  constructor(private readonly database: DatabaseService) {}

  async getProgress(
    membershipIds: readonly string[],
    testIds: readonly string[],
    grouping: ProgressGrouping,
  ): Promise<Map<string, ProgressMetrics>> {
    if (membershipIds.length === 0 || testIds.length === 0) return new Map();
    const key =
      grouping === 'membership'
        ? Prisma.sql`p.membership_id::text`
        : grouping === 'test'
          ? Prisma.sql`p.test_id::text`
          : Prisma.sql`'all'::text`;
    const rows = await this.database.$queryRaw<ProgressRow[]>(Prisma.sql`
      WITH scoped_attempts AS (
        SELECT a.group_membership_id AS membership_id, v.test_id,
               a.status, a.percentage, a.passed, a.updated_at
        FROM attempts a
        JOIN test_versions v ON v.id = a.test_version_id
        WHERE a.group_membership_id IN (${Prisma.join(membershipIds.map((id) => Prisma.sql`${id}::uuid`))})
          AND v.test_id IN (${Prisma.join(testIds.map((id) => Prisma.sql`${id}::uuid`))})
      ), assignment_progress AS (
        SELECT membership_id, test_id, count(*)::int AS attempt_count,
               bool_or(status IN ('SUBMITTED', 'REVIEW_REQUIRED', 'SCORED')) AS completed,
               bool_or(status IN ('SUBMITTED', 'REVIEW_REQUIRED')) AS awaiting_score,
               bool_or(status = 'IN_PROGRESS') AS in_progress,
               max(updated_at) AS latest_activity_at
        FROM scoped_attempts
        GROUP BY membership_id, test_id
      ), best_scores AS (
        SELECT DISTINCT ON (membership_id, test_id)
               membership_id, test_id, percentage, passed
        FROM scoped_attempts
        WHERE status = 'SCORED' AND percentage IS NOT NULL AND passed IS NOT NULL
        ORDER BY membership_id, test_id, percentage DESC, passed DESC
      )
      SELECT ${key} AS key,
             sum(p.attempt_count)::int AS "attemptCount",
             round(avg(b.percentage), 2)::double precision AS "averagePercentage",
             count(*) FILTER (WHERE p.awaiting_score)::int AS "awaitingScoreCount",
             count(*) FILTER (WHERE p.completed)::int AS "completedCount",
             count(*) FILTER (WHERE b.passed = false)::int AS "failedCount",
             bool_or(p.in_progress) AS "hasInProgressAttempt",
             max(b.percentage)::double precision AS "highestPercentage",
             max(p.latest_activity_at) AS "latestActivityAt",
             min(b.percentage)::double precision AS "lowestPercentage",
             count(*) FILTER (WHERE b.passed)::int AS "passedCount",
             count(b.percentage)::int AS "scoredCount"
      FROM assignment_progress p
      LEFT JOIN best_scores b USING (membership_id, test_id)
      GROUP BY 1
    `);
    const assignedCount =
      grouping === 'all'
        ? membershipIds.length * testIds.length
        : grouping === 'membership'
          ? testIds.length
          : membershipIds.length;
    return new Map(
      rows.map(({ key: rowKey, ...row }) => [
        rowKey,
        {
          ...emptyProgress(assignedCount),
          ...row,
          remainingCount: assignedCount - row.completedCount,
          completionPercentage:
            Math.round((row.completedCount / assignedCount) * 10_000) / 100,
        },
      ]),
    );
  }

  async getStudentHighestPercentages(
    studentId: string,
    testIds: readonly string[],
  ): Promise<Map<string, number>> {
    if (testIds.length === 0) return new Map();
    const rows = await this.database.$queryRaw<
      { testId: string; percentage: number }[]
    >(Prisma.sql`
      SELECT v.test_id AS "testId",
             max(a.percentage)::double precision AS percentage
      FROM attempts a
      JOIN test_versions v ON v.id = a.test_version_id
      WHERE a.student_id = ${studentId}::uuid AND a.status = 'SCORED'
        AND a.percentage IS NOT NULL
        AND v.test_id IN (${Prisma.join(testIds.map((id) => Prisma.sql`${id}::uuid`))})
      GROUP BY v.test_id
    `);
    return new Map(rows.map(({ testId, percentage }) => [testId, percentage]));
  }
}

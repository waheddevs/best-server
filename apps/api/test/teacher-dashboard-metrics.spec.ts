import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ContentStatus,
  GroupMembershipStatus,
  UserStatus,
} from '@best/database';

import { calculateTeacherDashboardMetrics } from '../src/components/notifications/teacher-dashboard-metrics';

const now = new Date('2026-09-23T08:00:00.000Z');
const teacherCreatedAt = new Date('2024-05-20T09:00:00.000Z');

function membership(
  studentId: string,
  startedAt: string,
  options: {
    endedAt?: string;
    participationStatus?: GroupMembershipStatus;
    groupStatus?: ContentStatus;
    studentStatus?: UserStatus;
  } = {},
) {
  return {
    studentId,
    startedAt: new Date(startedAt),
    endedAt: options.endedAt ? new Date(options.endedAt) : null,
    participationStatus:
      options.participationStatus ?? GroupMembershipStatus.ACTIVE,
    group: { status: options.groupStatus ?? ContentStatus.ACTIVE },
    student: { status: options.studentStatus ?? UserStatus.ACTIVE },
  };
}

void test('counts unique new and active learners across teacher groups', () => {
  const metrics = calculateTeacherDashboardMetrics(
    [
      membership('new', '2026-09-01T00:30:00.000Z'),
      membership('new', '2026-09-10T10:00:00.000Z'),
      membership('existing', '2026-08-10T10:00:00.000Z'),
      membership('paused', '2026-09-12T10:00:00.000Z', {
        participationStatus: GroupMembershipStatus.PAUSED,
      }),
      membership('archived', '2026-09-13T10:00:00.000Z', {
        groupStatus: ContentStatus.ARCHIVED,
      }),
      membership('inactive', '2026-09-14T10:00:00.000Z', {
        studentStatus: UserStatus.INACTIVE,
      }),
    ],
    teacherCreatedAt,
    now,
  );

  assert.equal(metrics.newLearnersThisMonth, 4);
  assert.equal(metrics.totalActiveLearners, 2);
  assert.equal(metrics.monthsWithBest, 28);
});

void test('does not mark an internal transfer as departed', () => {
  const metrics = calculateTeacherDashboardMetrics(
    [
      membership('transferred', '2026-07-01T10:00:00.000Z', {
        endedAt: '2026-09-04T10:00:00.000Z',
      }),
      membership('transferred', '2026-09-04T10:01:00.000Z'),
      membership('departed', '2026-07-01T10:00:00.000Z', {
        endedAt: '2026-09-08T10:00:00.000Z',
      }),
      membership('old-departure', '2026-07-01T10:00:00.000Z', {
        endedAt: '2026-08-31T18:59:59.000Z',
      }),
    ],
    teacherCreatedAt,
    now,
  );

  assert.equal(metrics.departedThisMonth, 1);
  assert.equal(metrics.newLearnersThisMonth, 0);
});

void test('soft-deleted students do not inflate departed learners', () => {
  const metrics = calculateTeacherDashboardMetrics(
    [
      membership('deleted', '2026-07-01T10:00:00.000Z', {
        endedAt: '2026-09-21T10:00:00.000Z',
        studentStatus: UserStatus.DELETED,
      }),
    ],
    teacherCreatedAt,
    now,
  );

  assert.equal(metrics.departedThisMonth, 0);
  assert.equal(metrics.totalActiveLearners, 0);
});

void test('uses Asia/Tashkent month boundaries and completed account months', () => {
  const metrics = calculateTeacherDashboardMetrics(
    [membership('boundary', '2026-08-31T19:00:00.000Z')],
    new Date('2026-08-25T00:00:00.000Z'),
    now,
  );

  assert.equal(metrics.newLearnersThisMonth, 1);
  assert.equal(metrics.monthsWithBest, 0);
});

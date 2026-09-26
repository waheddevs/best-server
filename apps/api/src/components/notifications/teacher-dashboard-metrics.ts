import {
  ContentStatus,
  GroupMembershipStatus,
  UserStatus,
} from '@best/database';

interface DashboardMembership {
  studentId: string;
  startedAt: Date;
  endedAt: Date | null;
  participationStatus: GroupMembershipStatus;
  group: { status: ContentStatus };
  student: { status: UserStatus };
}

const TASHKENT_UTC_OFFSET_MILLISECONDS = 5 * 60 * 60 * 1000;

function tashkentDateParts(date: Date) {
  const local = new Date(date.getTime() + TASHKENT_UTC_OFFSET_MILLISECONDS);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth(),
    day: local.getUTCDate(),
  };
}

export function calculateTeacherDashboardMetrics(
  memberships: readonly DashboardMembership[],
  teacherCreatedAt: Date,
  now: Date,
) {
  const current = tashkentDateParts(now);
  const created = tashkentDateParts(teacherCreatedAt);
  const monthStart =
    Date.UTC(current.year, current.month, 1) - TASHKENT_UTC_OFFSET_MILLISECONDS;
  const nextMonthStart =
    Date.UTC(current.year, current.month + 1, 1) -
    TASHKENT_UTC_OFFSET_MILLISECONDS;
  const active = new Set<string>();
  const currentMembers = new Set<string>();
  const departed = new Set<string>();
  const firstJoinByStudent = new Map<string, number>();

  for (const membership of memberships) {
    const startedAt = membership.startedAt.getTime();
    const firstJoin = firstJoinByStudent.get(membership.studentId);
    if (firstJoin === undefined || startedAt < firstJoin) {
      firstJoinByStudent.set(membership.studentId, startedAt);
    }
    if (membership.endedAt === null) {
      currentMembers.add(membership.studentId);
      if (
        membership.group.status === ContentStatus.ACTIVE &&
        membership.participationStatus === GroupMembershipStatus.ACTIVE &&
        membership.student.status === UserStatus.ACTIVE
      ) {
        active.add(membership.studentId);
      }
    } else if (
      membership.student.status !== UserStatus.DELETED &&
      membership.endedAt.getTime() >= monthStart &&
      membership.endedAt.getTime() < nextMonthStart
    ) {
      departed.add(membership.studentId);
    }
  }

  const calendarMonths =
    (current.year - created.year) * 12 + current.month - created.month;

  return {
    newLearnersThisMonth: [...firstJoinByStudent.values()].filter(
      (startedAt) => startedAt >= monthStart && startedAt < nextMonthStart,
    ).length,
    totalActiveLearners: active.size,
    departedThisMonth: [...departed].filter(
      (studentId) => !currentMembers.has(studentId),
    ).length,
    monthsWithBest: Math.max(
      0,
      calendarMonths - (current.day < created.day ? 1 : 0),
    ),
  };
}

import {
  AssignmentStatus,
  ContentStatus,
  SubmissionStatus,
  TeacherTaskKind,
  TeacherTaskStatus,
  UserRole,
  UserStatus,
} from '@best/database';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import type { AdminAssignTeacherTaskInput } from '../../schemas/notifications/notification.input';
import { ErrorCode } from '../../libs/enums/error-code.enum';
import { ApplicationError } from '../../libs/errors/application.error';
import {
  decodeCursor,
  encodeCursor,
  parsePageSize,
  parseUuid,
} from '../../libs/pagination/cursor-pagination';
import type {
  NotificationConnectionObject,
  NotificationObject,
  TeacherDashboardObject,
  TeacherTaskConnectionObject,
  TeacherTaskObject,
} from '../../schemas/notifications/notification.object';
import { calculateTeacherDashboardMetrics } from './teacher-dashboard-metrics';
@Injectable()
export class NotificationsService {
  constructor(private readonly db: DatabaseService) {}
  async dashboard(teacherId: string): Promise<TeacherDashboardObject> {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const [
      activeGroupCount,
      activeStudentCount,
      lessonsToday,
      openTaskCount,
      pendingSubmissionCount,
      unreadNotificationCount,
      teacher,
      memberships,
    ] = await Promise.all([
      this.db.group.count({
        where: { teacherId, status: ContentStatus.ACTIVE },
      }),
      this.db.groupMembership.count({
        where: {
          endedAt: null,
          group: { teacherId, status: ContentStatus.ACTIVE },
        },
      }),
      this.db.lesson.count({
        where: {
          group: { teacherId },
          startsAt: { gte: start, lt: end },
          status: { not: 'CANCELLED' },
        },
      }),
      this.db.teacherTask.count({
        where: { teacherId, status: TeacherTaskStatus.OPEN },
      }),
      this.db.assignmentSubmission.count({
        where: {
          status: SubmissionStatus.SUBMITTED,
          assignment: {
            status: AssignmentStatus.PUBLISHED,
            group: { teacherId },
          },
        },
      }),
      this.db.notification.count({
        where: { recipientId: teacherId, readAt: null },
      }),
      this.db.user.findUniqueOrThrow({
        where: { id: teacherId },
        select: { createdAt: true },
      }),
      this.db.groupMembership.findMany({
        where: { group: { teacherId } },
        select: {
          studentId: true,
          startedAt: true,
          endedAt: true,
          participationStatus: true,
          group: { select: { status: true } },
          student: { select: { status: true } },
        },
      }),
    ]);
    return {
      activeGroupCount,
      activeStudentCount,
      lessonsToday,
      openTaskCount,
      pendingSubmissionCount,
      unreadNotificationCount,
      ...calculateTeacherDashboardMetrics(memberships, teacher.createdAt, now),
    };
  }
  async tasks(
    teacherId: string,
    first?: number,
    after?: string,
    status?: TeacherTaskStatus,
    kind?: TeacherTaskKind,
  ): Promise<TeacherTaskConnectionObject> {
    const size = parsePageSize(first);
    const afterId = decodeCursor(after);
    const rows = await this.db.teacherTask.findMany({
      where: {
        teacherId,
        ...(status === undefined ? {} : { status }),
        ...(kind === undefined ? {} : { kind }),
        ...(afterId === undefined ? {} : { id: { gt: afterId } }),
      },
      orderBy: { id: 'asc' },
      take: size + 1,
    });
    return connection(rows, size);
  }
  async assignTask(
    adminId: string,
    input: AdminAssignTeacherTaskInput,
    correlationId?: string,
  ): Promise<TeacherTaskObject> {
    const teacherId = parseUuid(input.teacherId, 'teacherId');
    const taskId = parseUuid(input.requestId, 'requestId');
    const title = input.title.trim();
    if (title.length === 0 || title.length > 240) {
      throw new ApplicationError(
        ErrorCode.BAD_USER_INPUT,
        'Invalid task title',
        400,
      );
    }
    const existing = await this.db.teacherTask.findUnique({
      where: { id: taskId },
    });
    if (existing !== null) {
      if (existing.teacherId !== teacherId || existing.title !== title) {
        throw notFound('task');
      }
      return existing;
    }
    const teacher = await this.db.user.findFirst({
      where: {
        id: teacherId,
        role: UserRole.TEACHER,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (teacher === null) throw notFound('teacher');
    const groupId = input.groupId ? parseUuid(input.groupId, 'groupId') : null;
    if (groupId !== null) {
      const group = await this.db.group.findFirst({
        where: { id: groupId, teacherId },
        select: { id: true },
      });
      if (group === null) throw notFound('group');
    }
    return this.db.$transaction(async (tx) => {
      const task = await tx.teacherTask.create({
        data: {
          id: taskId,
          teacherId,
          groupId,
          title,
          kind: input.kind,
          dueAt: input.dueAt ?? null,
        },
      });
      await tx.notification.create({
        data: {
          recipientId: teacherId,
          eventKey: `teacher-task:${task.id}`,
          kind: 'TEACHER_TASK',
          title,
          payload: { taskId: task.id },
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'TEACHER_TASK_ASSIGNED',
          actorId: adminId,
          correlationId: correlationId ?? null,
          targetId: task.id,
          targetType: 'TEACHER_TASK',
        },
      });
      return task;
    });
  }
  async completeTask(
    teacherId: string,
    taskIdInput: string,
    correlationId?: string,
  ): Promise<TeacherTaskObject> {
    const id = parseUuid(taskIdInput, 'taskId');
    const existing = await this.db.teacherTask.findFirst({
      where: { id, teacherId },
    });
    if (existing === null) throw notFound('task');
    if (existing.status === TeacherTaskStatus.COMPLETED) return existing;
    return this.db.$transaction(async (tx) => {
      const row = await tx.teacherTask.update({
        where: { id },
        data: { completedAt: new Date(), status: TeacherTaskStatus.COMPLETED },
      });
      await tx.auditLog.create({
        data: {
          action: 'TEACHER_TASK_COMPLETED',
          actorId: teacherId,
          correlationId: correlationId ?? null,
          targetId: id,
          targetType: 'TEACHER_TASK',
        },
      });
      return row;
    });
  }
  async notifications(
    userId: string,
    first?: number,
    after?: string,
    unreadOnly = false,
  ): Promise<NotificationConnectionObject> {
    const size = parsePageSize(first);
    const afterId = decodeCursor(after);
    const rows = await this.db.notification.findMany({
      where: {
        recipientId: userId,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      ...(afterId === undefined ? {} : { cursor: { id: afterId }, skip: 1 }),
      select: {
        body: true,
        createdAt: true,
        id: true,
        kind: true,
        payload: true,
        readAt: true,
        title: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: size + 1,
    });
    const hasNextPage = rows.length > size;
    const page = hasNextPage ? rows.slice(0, size) : rows;
    const edges = page.map((row) => ({
      cursor: encodeCursor(row.id),
      node: notificationObject(row),
    }));
    return {
      edges,
      pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
    };
  }
  unreadCount(userId: string): Promise<number> {
    return this.db.notification.count({
      where: { recipientId: userId, readAt: null },
    });
  }
  async markRead(userId: string, idInput: string): Promise<NotificationObject> {
    const id = parseUuid(idInput, 'notificationId');
    const existing = await this.db.notification.findFirst({
      where: { id, recipientId: userId },
      select: {
        body: true,
        createdAt: true,
        id: true,
        kind: true,
        payload: true,
        readAt: true,
        title: true,
      },
    });
    if (existing === null) throw notFound('notification');
    if (existing.readAt !== null) return notificationObject(existing);
    const updated = await this.db.notification.update({
      where: { id },
      data: { readAt: new Date() },
      select: {
        body: true,
        createdAt: true,
        id: true,
        kind: true,
        payload: true,
        readAt: true,
        title: true,
      },
    });
    return notificationObject(updated);
  }
  async markAllRead(userId: string): Promise<number> {
    return (
      await this.db.notification.updateMany({
        where: { recipientId: userId, readAt: null },
        data: { readAt: new Date() },
      })
    ).count;
  }
}
function notificationObject(row: {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  payload: unknown;
  readAt: Date | null;
  createdAt: Date;
}): NotificationObject {
  const payload = row.payload;
  const taskId =
    payload !== null &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    'taskId' in payload &&
    typeof payload.taskId === 'string'
      ? payload.taskId
      : null;
  const attemptId = notificationPayloadId(payload, 'attemptId');
  const groupId = notificationPayloadId(payload, 'groupId');
  const studentId = notificationPayloadId(payload, 'studentId');
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    taskId,
    attemptId,
    groupId,
    studentId,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}
function notificationPayloadId(payload: unknown, key: string): string | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const value: unknown = Reflect.get(payload, key);
  return typeof value === 'string' ? value : null;
}
function connection(
  rows: TeacherTaskObject[],
  size: number,
): TeacherTaskConnectionObject {
  const hasNextPage = rows.length > size;
  const page = hasNextPage ? rows.slice(0, size) : rows;
  const edges = page.map((node) => ({ cursor: encodeCursor(node.id), node }));
  return {
    edges,
    pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
  };
}
function notFound(name: string) {
  return new ApplicationError(
    ErrorCode.NOT_FOUND,
    `The requested ${name} was not found`,
    404,
  );
}

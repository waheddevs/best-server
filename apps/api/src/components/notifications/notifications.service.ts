import {
  AssignmentStatus,
  ContentStatus,
  SubmissionStatus,
  TeacherTaskKind,
  TeacherTaskStatus,
} from '@best/database';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
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
@Injectable()
export class NotificationsService {
  constructor(private readonly db: DatabaseService) {}
  async dashboard(teacherId: string): Promise<TeacherDashboardObject> {
    const start = new Date();
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
    ]);
    return {
      activeGroupCount,
      activeStudentCount,
      lessonsToday,
      openTaskCount,
      pendingSubmissionCount,
      unreadNotificationCount,
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
        ...(afterId === undefined ? {} : { id: { gt: afterId } }),
      },
      select: {
        body: true,
        createdAt: true,
        id: true,
        kind: true,
        readAt: true,
        title: true,
      },
      orderBy: { id: 'asc' },
      take: size + 1,
    });
    const hasNextPage = rows.length > size;
    const page = hasNextPage ? rows.slice(0, size) : rows;
    const edges = page.map((node) => ({ cursor: encodeCursor(node.id), node }));
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
        readAt: true,
        title: true,
      },
    });
    if (existing === null) throw notFound('notification');
    if (existing.readAt !== null) return existing;
    return this.db.notification.update({
      where: { id },
      data: { readAt: new Date() },
      select: {
        body: true,
        createdAt: true,
        id: true,
        kind: true,
        readAt: true,
        title: true,
      },
    });
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

import { LessonStatus, Prisma } from '@best/database';
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
import type { AdminLocationSummaryObject } from '../../schemas/lessons/admin-location-summary.object';
import type { LessonConnectionObject } from '../../schemas/lessons/lesson-connection.object';
import type {
  CreateLessonInput,
  LessonAttendanceEntryInput,
  UpdateLessonInput,
} from '../../schemas/lessons/lesson.input';
import type {
  LessonAttendanceObject,
  LessonObject,
} from '../../schemas/lessons/lesson.object';

const include = {
  translations: { orderBy: { language: 'asc' } },
} satisfies Prisma.LessonInclude;
type LessonRecord = Prisma.LessonGetPayload<{ include: typeof include }>;

@Injectable()
export class LessonsService {
  constructor(private readonly database: DatabaseService) {}

  async getAdminSchedule(from: Date, to: Date): Promise<LessonObject[]> {
    validateRange(from, to);
    const rows = await this.database.lesson.findMany({
      where: {
        archivedAt: null,
        startsAt: { gte: from, lt: to },
        status: { not: LessonStatus.CANCELLED },
      },
      include,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(mapLesson);
  }

  async getAdminAttendance(
    lessonIdInput: string,
  ): Promise<LessonAttendanceObject[]> {
    const lessonId = parseUuid(lessonIdInput, 'lessonId');
    const exists = await this.database.lesson.count({
      where: { id: lessonId },
    });
    if (exists !== 1) throw notFound();
    return this.getAttendanceRows(lessonId);
  }

  async getAdminLocations(): Promise<AdminLocationSummaryObject[]> {
    const now = new Date();
    const groups = await this.database.group.findMany({
      where: { room: { not: null }, status: 'ACTIVE' },
      select: { room: true },
    });
    const lessons = await this.database.lesson.findMany({
      where: {
        archivedAt: null,
        group: { room: { not: null } },
        startsAt: { gte: now },
        status: LessonStatus.SCHEDULED,
      },
      orderBy: { startsAt: 'asc' },
      select: { group: { select: { room: true } }, startsAt: true },
    });
    const rooms = new Map<string, AdminLocationSummaryObject>();

    for (const group of groups) {
      if (group.room === null) continue;
      const current = rooms.get(group.room);
      rooms.set(group.room, {
        activeGroupCount: (current?.activeGroupCount ?? 0) + 1,
        nextLessonAt: current?.nextLessonAt ?? null,
        room: group.room,
        scheduledLessonCount: current?.scheduledLessonCount ?? 0,
      });
    }

    for (const lesson of lessons) {
      const room = lesson.group.room;
      if (room === null) continue;
      const current = rooms.get(room) ?? {
        activeGroupCount: 0,
        nextLessonAt: null,
        room,
        scheduledLessonCount: 0,
      };
      rooms.set(room, {
        activeGroupCount: current.activeGroupCount,
        nextLessonAt: current.nextLessonAt ?? lesson.startsAt,
        room: current.room,
        scheduledLessonCount: current.scheduledLessonCount + 1,
      });
    }

    return [...rooms.values()].sort((left, right) =>
      left.room.localeCompare(right.room),
    );
  }

  async getTeacherSchedule(
    teacherId: string,
    from: Date,
    to: Date,
  ): Promise<LessonObject[]> {
    validateRange(from, to);
    const rows = await this.database.lesson.findMany({
      where: {
        archivedAt: null,
        group: { teacherId },
        startsAt: { gte: from, lt: to },
        status: { not: LessonStatus.CANCELLED },
      },
      include,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(mapLesson);
  }

  async getTeacherLessons(
    teacherId: string,
    groupIdInput: string,
    first?: number,
    after?: string,
    status?: LessonStatus,
  ): Promise<LessonConnectionObject> {
    const groupId = parseUuid(groupIdInput, 'groupId');
    await this.requireGroup(teacherId, groupId);
    return this.getConnection(
      {
        archivedAt: null,
        groupId,
        ...(status === undefined ? {} : { status }),
      },
      first,
      after,
    );
  }

  async getTeacherLesson(
    teacherId: string,
    lessonIdInput: string,
  ): Promise<LessonObject> {
    return mapLesson(await this.findOwnedLesson(teacherId, lessonIdInput));
  }

  async getStudentSchedule(
    studentId: string,
    from: Date,
    to: Date,
  ): Promise<LessonObject[]> {
    validateRange(from, to);
    const rows = await this.database.lesson.findMany({
      where: {
        archivedAt: null,
        group: { memberships: { some: { studentId, endedAt: null } } },
        startsAt: { gte: from, lt: to },
        status: { in: [LessonStatus.SCHEDULED, LessonStatus.COMPLETED] },
      },
      include,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(mapLesson);
  }

  async getStudentLesson(
    studentId: string,
    lessonIdInput: string,
  ): Promise<LessonObject> {
    const id = parseUuid(lessonIdInput, 'lessonId');
    const row = await this.database.lesson.findFirst({
      where: {
        archivedAt: null,
        id,
        status: { in: [LessonStatus.SCHEDULED, LessonStatus.COMPLETED] },
        group: { memberships: { some: { studentId, endedAt: null } } },
      },
      include,
    });
    if (row === null) throw notFound();
    return mapLesson(row);
  }

  async getAttendance(
    teacherId: string,
    lessonIdInput: string,
  ): Promise<LessonAttendanceObject[]> {
    const lesson = await this.findOwnedLesson(teacherId, lessonIdInput);
    return this.getAttendanceRows(lesson.id);
  }

  private async getAttendanceRows(
    lessonId: string,
  ): Promise<LessonAttendanceObject[]> {
    const rows = await this.database.lessonAttendance.findMany({
      where: { lessonId },
      include: { student: { select: { displayName: true } } },
      orderBy: [{ student: { displayName: 'asc' } }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      note: row.note,
      recordedAt: row.recordedAt,
      status: row.status,
      studentId: row.studentId,
      studentName: row.student.displayName,
    }));
  }

  async create(
    teacherId: string,
    input: CreateLessonInput,
    correlationId?: string,
  ): Promise<LessonObject> {
    const groupId = parseUuid(input.groupId, 'groupId');
    await this.requireGroup(teacherId, groupId);
    const row = await this.database.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${groupId}))`;
      const sequence = await tx.lesson.aggregate({
        where: { groupId },
        _max: { lessonNumber: true },
      });
      const lesson = await tx.lesson.create({
        data: {
          ...parseLesson(input),
          createdById: teacherId,
          groupId,
          lessonNumber: (sequence._max.lessonNumber ?? 0) + 1,
          translations: {
            createMany: { data: parseTranslations(input.translations) },
          },
        },
        include,
      });
      await audit(tx, teacherId, 'LESSON_CREATED', lesson.id, correlationId);
      return lesson;
    });
    return mapLesson(row);
  }

  async update(
    teacherId: string,
    input: UpdateLessonInput,
    correlationId?: string,
  ): Promise<LessonObject> {
    const existing = await this.findOwnedLesson(teacherId, input.lessonId);
    if (existing.status === LessonStatus.COMPLETED)
      throw conflict('A completed lesson cannot be edited');
    const groupId = parseUuid(input.groupId, 'groupId');
    await this.requireGroup(teacherId, groupId);
    const row = await this.database.$transaction(async (tx) => {
      await tx.lessonTranslation.deleteMany({
        where: { lessonId: existing.id },
      });
      const lesson = await tx.lesson.update({
        where: { id: existing.id },
        data: {
          ...parseLesson(input),
          groupId,
          translations: {
            createMany: { data: parseTranslations(input.translations) },
          },
        },
        include,
      });
      await audit(tx, teacherId, 'LESSON_UPDATED', lesson.id, correlationId);
      return lesson;
    });
    return mapLesson(row);
  }

  async setStatus(
    teacherId: string,
    lessonIdInput: string,
    status: LessonStatus,
    reason: string | undefined,
    correlationId?: string,
  ): Promise<LessonObject> {
    const existing = await this.findOwnedLesson(teacherId, lessonIdInput);
    const allowed: Record<LessonStatus, LessonStatus[]> = {
      DRAFT: [LessonStatus.SCHEDULED, LessonStatus.CANCELLED],
      SCHEDULED: [LessonStatus.COMPLETED, LessonStatus.CANCELLED],
      COMPLETED: [],
      CANCELLED: [],
    };
    if (!allowed[existing.status].includes(status))
      throw conflict('The requested lesson status transition is not allowed');
    if (
      status === LessonStatus.CANCELLED &&
      required(reason, 'reason', 1000).length === 0
    )
      throw bad('A cancellation reason is required');
    const row = await this.database.$transaction(async (tx) => {
      const lesson = await tx.lesson.update({
        where: { id: existing.id },
        data: { status },
        include,
      });
      await tx.auditLog.create({
        data: {
          action: `LESSON_${status}`,
          actorId: teacherId,
          correlationId: correlationId ?? null,
          reason: reason?.trim() ?? null,
          targetId: lesson.id,
          targetType: 'LESSON',
        },
      });
      return lesson;
    });
    return mapLesson(row);
  }

  async setArchived(
    teacherId: string,
    lessonIdInput: string,
    archived: boolean,
    correlationId?: string,
  ): Promise<LessonObject> {
    const id = parseUuid(lessonIdInput, 'lessonId');
    const existing = await this.database.lesson.findFirst({
      where: { id, group: { teacherId } },
      include,
    });
    if (existing === null) throw notFound();
    if ((existing.archivedAt !== null) === archived) return mapLesson(existing);

    const row = await this.database.$transaction(async (tx) => {
      const lesson = await tx.lesson.update({
        where: { id },
        data: { archivedAt: archived ? new Date() : null },
        include,
      });
      await audit(
        tx,
        teacherId,
        archived ? 'LESSON_ARCHIVED' : 'LESSON_RESTORED',
        lesson.id,
        correlationId,
      );
      return lesson;
    });
    return mapLesson(row);
  }

  async recordAttendance(
    teacherId: string,
    lessonIdInput: string,
    entries: LessonAttendanceEntryInput[],
    correctionReason?: string,
    correlationId?: string,
  ): Promise<LessonAttendanceObject[]> {
    const lesson = await this.findOwnedLesson(teacherId, lessonIdInput);
    if (
      lesson.status !== LessonStatus.SCHEDULED &&
      lesson.status !== LessonStatus.COMPLETED
    )
      throw conflict(
        'Attendance can only be recorded for scheduled or completed lessons',
      );
    if (entries.length === 0 || entries.length > 200)
      throw bad('Provide between 1 and 200 attendance entries');
    const ids = entries.map(({ studentId }) =>
      parseUuid(studentId, 'studentId'),
    );
    if (new Set(ids).size !== ids.length)
      throw bad('Each student may appear only once');
    const memberships = await this.database.groupMembership.findMany({
      where: {
        groupId: lesson.groupId,
        studentId: { in: ids },
        startedAt: { lte: lesson.startsAt },
        OR: [{ endedAt: null }, { endedAt: { gt: lesson.startsAt } }],
      },
      select: { id: true, studentId: true },
    });
    if (memberships.length !== ids.length) throw notFound();
    const hasExisting = await this.database.lessonAttendance.count({
      where: { lessonId: lesson.id, studentId: { in: ids } },
    });
    if (
      hasExisting > 0 &&
      required(correctionReason, 'correctionReason', 1000).length === 0
    )
      throw bad('A correction reason is required when attendance is changed');
    const byStudent = new Map(
      memberships.map((row) => [row.studentId, row.id]),
    );
    await this.database.$transaction(async (tx) => {
      for (const [index, entry] of entries.entries()) {
        const studentId = ids[index];
        if (studentId === undefined) throw bad('Invalid attendance entry');
        const membershipId = byStudent.get(studentId);
        if (membershipId === undefined) throw notFound();
        await tx.lessonAttendance.upsert({
          where: { lessonId_studentId: { lessonId: lesson.id, studentId } },
          create: {
            groupMembershipId: membershipId,
            lessonId: lesson.id,
            note: cleanOptional(entry.note, 500),
            status: entry.status,
            studentId,
          },
          update: {
            groupMembershipId: membershipId,
            note: cleanOptional(entry.note, 500),
            recordedAt: new Date(),
            status: entry.status,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          action:
            hasExisting > 0
              ? 'LESSON_ATTENDANCE_CORRECTED'
              : 'LESSON_ATTENDANCE_RECORDED',
          actorId: teacherId,
          correlationId: correlationId ?? null,
          reason: correctionReason?.trim() ?? null,
          targetId: lesson.id,
          targetType: 'LESSON',
          newValues: { count: entries.length },
        },
      });
    });
    return this.getAttendance(teacherId, lesson.id);
  }

  private async getConnection(
    where: Prisma.LessonWhereInput,
    first?: number,
    after?: string,
  ): Promise<LessonConnectionObject> {
    const size = parsePageSize(first);
    const afterId = decodeCursor(after);
    const rows = await this.database.lesson.findMany({
      where,
      ...(afterId === undefined ? {} : { cursor: { id: afterId }, skip: 1 }),
      include,
      orderBy: [{ lessonNumber: 'desc' }, { id: 'desc' }],
      take: size + 1,
    });
    const hasNextPage = rows.length > size;
    const page = hasNextPage ? rows.slice(0, size) : rows;
    const edges = page.map((row) => ({
      cursor: encodeCursor(row.id),
      node: mapLesson(row),
    }));
    return {
      edges,
      pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
    };
  }
  private async findOwnedLesson(
    teacherId: string,
    idInput: string,
  ): Promise<LessonRecord> {
    const id = parseUuid(idInput, 'lessonId');
    const row = await this.database.lesson.findFirst({
      where: { archivedAt: null, id, group: { teacherId } },
      include,
    });
    if (row === null) throw notFound();
    return row;
  }
  private async requireGroup(
    teacherId: string,
    groupId: string,
  ): Promise<void> {
    if (
      (await this.database.group.count({
        where: { id: groupId, teacherId },
      })) !== 1
    )
      throw notFound();
  }
}

function parseLesson(input: CreateLessonInput) {
  validateRange(input.startsAt, input.endsAt);
  return {
    endsAt: input.endsAt,
    room: cleanOptional(input.room, 80),
    startsAt: input.startsAt,
  };
}
function parseTranslations(rows: CreateLessonInput['translations']) {
  if (
    rows.length < 1 ||
    rows.length > 3 ||
    new Set(rows.map(({ language }) => language)).size !== rows.length
  )
    throw bad('Provide one to three unique lesson translations');
  return rows.map(({ language, summary, title }) => ({
    language,
    summary: cleanOptional(summary, 10_000),
    title: required(title, 'title', 240),
  }));
}
function mapLesson(row: LessonRecord): LessonObject {
  return {
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    endsAt: row.endsAt,
    groupId: row.groupId,
    id: row.id,
    lessonNumber: row.lessonNumber,
    room: row.room,
    startsAt: row.startsAt,
    status: row.status,
    translations: row.translations,
    updatedAt: row.updatedAt,
  };
}
function validateRange(from: Date, to: Date): void {
  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(to.getTime()) ||
    to <= from ||
    to.getTime() - from.getTime() > 366 * 86_400_000
  )
    throw bad('The date range is invalid or exceeds 366 days');
}
function required(
  value: string | undefined,
  field: string,
  max: number,
): string {
  const text = value?.trim() ?? '';
  if (text.length === 0 || text.length > max)
    throw bad(`${field} must contain between 1 and ${String(max)} characters`);
  return text;
}
function cleanOptional(value: string | undefined, max: number): string | null {
  const text = value?.trim() ?? '';
  if (text.length > max) throw bad('Text is too long');
  return text.length === 0 ? null : text;
}
async function audit(
  tx: Prisma.TransactionClient,
  actorId: string,
  action: string,
  targetId: string,
  correlationId?: string,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      action,
      actorId,
      correlationId: correlationId ?? null,
      targetId,
      targetType: 'LESSON',
    },
  });
}
function bad(message: string): ApplicationError {
  return new ApplicationError(ErrorCode.BAD_USER_INPUT, message, 400);
}
function conflict(message: string): ApplicationError {
  return new ApplicationError(ErrorCode.CONFLICT, message, 409);
}
function notFound(): ApplicationError {
  return new ApplicationError(
    ErrorCode.NOT_FOUND,
    'The requested lesson was not found',
    404,
  );
}

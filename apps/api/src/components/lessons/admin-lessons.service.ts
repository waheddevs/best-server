import { ContentStatus, LessonStatus, Prisma } from '@best/database';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  directoryInput,
  directoryPage,
  directoryError,
  directoryEnum,
} from '../../libs/pagination/admin-directory';
import { parseUuid } from '../../libs/pagination/cursor-pagination';
import type { AdminDirectoryInput } from '../../schemas/groups/admin-directory.input';
import type { AdminSaveLessonInput } from '../../schemas/lessons/admin-lesson.input';
import {
  parseLesson,
  parseTranslations,
  mapLesson,
  validateRange,
} from './lessons.service';
const include = {
  translations: true,
  group: {
    include: {
      teacher: { select: { displayName: true } },
      _count: { select: { memberships: { where: { endedAt: null } } } },
    },
  },
} satisfies Prisma.LessonInclude;
@Injectable()
export class AdminLessonsService {
  constructor(private readonly database: DatabaseService) {}
  async directory(raw: AdminDirectoryInput) {
    const input = directoryInput(raw);
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tashkent',
    }).format(new Date());
    const fromText = input.from ?? day;
    const from = new Date(
      fromText.length === 10 ? fromText + 'T00:00:00+05:00' : fromText,
    );
    const to = input.to
      ? input.to.length === 10
        ? new Date(new Date(input.to + 'T00:00:00+05:00').getTime() + 86400000)
        : new Date(input.to)
      : new Date(from.getTime() + 7 * 86400000);
    validateRange(from, to);
    const status = directoryEnum(input.status, Object.values(LessonStatus));
    const rows = await this.database.lesson.findMany({
      where: {
        archivedAt: null,
        group: { status: { not: ContentStatus.DELETED } },
        startsAt: { gte: from, lt: to },
      },
      include,
      orderBy: [{ startsAt: input.descending ? 'desc' : 'asc' }, { id: 'asc' }],
    });
    const mapped = rows.map((r) => ({
      ...mapLesson(r),
      groupName: r.group.name,
      teacherId: r.group.teacherId,
      teacherName: r.group.teacher.displayName,
      studentCount: r.group._count.memberships,
      hasConflict:
        r.status !== 'CANCELLED' &&
        rows.some(
          (other) =>
            other.id !== r.id &&
            other.status !== 'CANCELLED' &&
            other.startsAt < r.endsAt &&
            other.endsAt > r.startsAt &&
            (other.group.teacherId === r.group.teacherId ||
              (!!r.room && other.room?.toLowerCase() === r.room.toLowerCase())),
        ),
    }));
    const search = input.search?.toLocaleLowerCase();
    const filtered = mapped.filter(
      (r) =>
        (!status || r.status === status) &&
        (!input.groupId || r.groupId === input.groupId) &&
        (!input.teacherId || r.teacherId === input.teacherId) &&
        (!input.room ||
          r.room?.toLowerCase().includes(input.room.toLowerCase())) &&
        (!search ||
          [
            r.groupName,
            r.teacherName,
            ...r.translations.map((t) => t.title),
          ].some((t) => t.toLowerCase().includes(search))),
    );
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tashkent',
    }).format(new Date());
    const now = new Date();
    return {
      ...directoryPage(filtered, input),
      metrics: [
        {
          key: 'today',
          value: String(
            filtered.filter(
              (r) =>
                new Intl.DateTimeFormat('en-CA', {
                  timeZone: 'Asia/Tashkent',
                }).format(r.startsAt) === today,
            ).length,
          ),
        },
        {
          key: 'upcoming',
          value: String(
            filtered.filter((r) => r.status === 'SCHEDULED' && r.startsAt > now)
              .length,
          ),
        },
        {
          key: 'COMPLETED',
          value: String(
            filtered.filter((r) => r.status === 'COMPLETED').length,
          ),
        },
        {
          key: 'CANCELLED',
          value: String(
            filtered.filter((r) => r.status === 'CANCELLED').length,
          ),
        },
        {
          key: 'conflicts',
          value: String(filtered.filter((r) => r.hasConflict).length),
        },
      ],
    };
  }
  async save(
    actorId: string,
    input: AdminSaveLessonInput,
    correlationId?: string,
  ) {
    const groupId = parseUuid(input.groupId, 'groupId');
    const id = input.lessonId
      ? parseUuid(input.lessonId, 'lessonId')
      : undefined;
    const values = parseLesson(input);
    const translations = parseTranslations(input.translations);
    return this.database.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('lesson-schedule-write'))`;
      const group = await tx.group.findFirst({
        where: { id: groupId, status: ContentStatus.ACTIVE },
      });
      if (!group) throw directoryError('Group unavailable');
      const current = id ? await tx.lesson.findUnique({ where: { id } }) : null;
      if (
        id &&
        (!current ||
          current.archivedAt ||
          current.status === 'COMPLETED' ||
          current.status === 'CANCELLED')
      )
        throw directoryError('Lesson cannot be edited', true);
      if (
        current &&
        current.updatedAt.toISOString() !== input.expectedUpdatedAt
      )
        throw directoryError('Lesson changed; reload before saving', true);
      const collision = await tx.lesson.count({
        where: {
          ...(id ? { id: { not: id } } : {}),
          archivedAt: null,
          status: { not: LessonStatus.CANCELLED },
          startsAt: { lt: values.endsAt },
          endsAt: { gt: values.startsAt },
          OR: [
            { groupId },
            { group: { teacherId: group.teacherId } },
            ...(values.room
              ? [
                  {
                    room: {
                      equals: values.room,
                      mode: Prisma.QueryMode.insensitive,
                    },
                  },
                ]
              : []),
          ],
        },
      });
      if (collision)
        throw directoryError('Teacher, group or room is already booked', true);
      let lesson;
      if (id) {
        await tx.lessonTranslation.deleteMany({ where: { lessonId: id } });
        lesson = await tx.lesson.update({
          where: { id },
          data: {
            ...values,
            groupId,
            translations: { createMany: { data: translations } },
          },
          include,
        });
      } else {
        const seq = await tx.lesson.aggregate({
          where: { groupId },
          _max: { lessonNumber: true },
        });
        lesson = await tx.lesson.create({
          data: {
            ...values,
            groupId,
            createdById: actorId,
            status: LessonStatus.SCHEDULED,
            lessonNumber: (seq._max.lessonNumber ?? 0) + 1,
            translations: { createMany: { data: translations } },
          },
          include,
        });
      }
      await tx.auditLog.create({
        data: {
          actorId,
          action: id ? 'LESSON_UPDATED' : 'LESSON_CREATED',
          targetId: lesson.id,
          targetType: 'LESSON',
          correlationId: correlationId ?? null,
          newValues: {
            groupId,
            startsAt: lesson.startsAt.toISOString(),
            endsAt: lesson.endsAt.toISOString(),
          },
        },
      });
      return mapLesson(lesson);
    });
  }
  async status(
    actorId: string,
    idInput: string,
    statusInput: string,
    reason: string,
    correlationId?: string,
  ) {
    const id = parseUuid(idInput, 'lessonId');
    const status = directoryEnum(statusInput, [
      LessonStatus.SCHEDULED,
      LessonStatus.CANCELLED,
      LessonStatus.COMPLETED,
    ]);
    if (!status || !reason.trim() || reason.length > 1000)
      throw directoryError('A reason is required');
    return this.database.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('lesson-schedule-write'))`;
      const row = await tx.lesson.findUnique({ where: { id }, include });
      if (
        !row ||
        row.archivedAt ||
        row.status === 'COMPLETED' ||
        row.group.status !== ContentStatus.ACTIVE
      )
        throw directoryError('Lesson unavailable', true);
      if (row.status === status) return mapLesson(row);
      if (
        status === LessonStatus.COMPLETED &&
        row.status !== LessonStatus.SCHEDULED
      )
        throw directoryError('Only scheduled lessons can be completed', true);
      if (status === LessonStatus.SCHEDULED) {
        const collision = await tx.lesson.count({
          where: {
            ...(id ? { id: { not: id } } : {}),
            archivedAt: null,
            status: { not: LessonStatus.CANCELLED },
            startsAt: { lt: row.endsAt },
            endsAt: { gt: row.startsAt },
            OR: [
              { groupId: row.groupId },
              { group: { teacherId: row.group.teacherId } },
              ...(row.room
                ? [
                    {
                      room: {
                        equals: row.room,
                        mode: Prisma.QueryMode.insensitive,
                      },
                    },
                  ]
                : []),
            ],
          },
        });
        if (collision)
          throw directoryError('Teacher or room is already booked', true);
      }
      const result = await tx.lesson.update({
        where: { id },
        data: { status },
        include,
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'LESSON_STATUS_CHANGED',
          targetId: id,
          targetType: 'LESSON',
          reason: reason.trim(),
          correlationId: correlationId ?? null,
          oldValues: { status: row.status },
          newValues: { status },
        },
      });
      return mapLesson(result);
    });
  }
}

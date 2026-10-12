import {
  ContentStatus,
  GroupCategory,
  Prisma,
  UserRole,
  UserStatus,
} from '@best/database';
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
import type { AdminSaveGroupInput } from '../../schemas/groups/admin-group.input';
import {
  GROUP_SELECT,
  mapGroup,
  parseGroupInput,
  parseMonthlyTuition,
  tashkentDate,
} from './groups.service';

@Injectable()
export class AdminGroupsService {
  constructor(private readonly database: DatabaseService) {}
  async options() {
    const [teachers, groups, students] = await Promise.all([
      this.database.user.findMany({
        where: { role: UserRole.TEACHER, status: { not: UserStatus.DELETED } },
        orderBy: { displayName: 'asc' },
        select: { id: true, displayName: true, status: true },
      }),
      this.database.group.findMany({
        where: { status: { not: ContentStatus.DELETED } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, status: true },
      }),
      this.database.user.findMany({
        where: { role: UserRole.STUDENT },
        orderBy: { displayName: 'asc' },
        select: { id: true, displayName: true, status: true },
      }),
    ]);
    return {
      students: students.map((s) => ({
        id: s.id,
        label: s.displayName,
        status: s.status,
      })),
      teachers: teachers.map((t) => ({
        id: t.id,
        label: t.displayName,
        status: t.status,
      })),
      groups: groups.map((g) => ({
        id: g.id,
        label: g.name,
        status: g.status,
      })),
    };
  }
  async directory(raw: AdminDirectoryInput) {
    const input = directoryInput(raw);
    const status = directoryEnum(input.status, [
      ContentStatus.ACTIVE,
      ContentStatus.ARCHIVED,
    ]);
    const category = directoryEnum(
      input.category,
      Object.values(GroupCategory),
    );
    const where: Prisma.GroupWhereInput = {
      status: status ?? { not: ContentStatus.DELETED },
      ...(input.teacherId ? { teacherId: input.teacherId } : {}),
      ...(category ? { category } : {}),
      ...(input.search
        ? {
            OR: [
              { name: { contains: input.search, mode: 'insensitive' } },
              {
                teacher: {
                  displayName: { contains: input.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const rows = await this.database.group.findMany({
      where,
      select: { ...GROUP_SELECT, teacher: { select: { displayName: true } } },
      orderBy: [{ name: input.descending ? 'desc' : 'asc' }, { id: 'asc' }],
    });
    const students = rows.reduce((n, r) => n + r._count.memberships, 0);
    return {
      ...directoryPage(
        rows.map((r) => ({
          ...mapGroup(r),
          teacherName: r.teacher.displayName,
        })),
        input,
      ),
      metrics: [
        { key: 'all', value: String(rows.length) },
        {
          key: 'ACTIVE',
          value: String(rows.filter((r) => r.status === 'ACTIVE').length),
        },
        {
          key: 'full',
          value: String(rows.filter((r) => r._count.memberships >= 15).length),
        },
        { key: 'students', value: String(students) },
        {
          key: 'seats',
          value: String(
            rows
              .filter((r) => r.status === 'ACTIVE')
              .reduce((n, r) => n + Math.max(0, 15 - r._count.memberships), 0),
          ),
        },
      ],
    };
  }
  async save(
    actorId: string,
    input: AdminSaveGroupInput,
    correlationId?: string,
  ) {
    const teacherId = parseUuid(input.teacherId, 'teacherId');
    const id = input.groupId ? parseUuid(input.groupId, 'groupId') : undefined;
    const values = parseGroupInput(input);
    if (
      values.scheduleDays.length === 0 ||
      values.startsAtMinutes === null ||
      values.endsAtMinutes === null ||
      values.timeZone !== 'Asia/Tashkent'
    )
      throw directoryError(
        'Provide lesson days and a valid Asia/Tashkent time range',
      );
    const amountUzs = parseMonthlyTuition(input.monthlyTuitionUzs) ?? 300000n;
    return this.database.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('group-schedule-write'))`;
      const teacher = await tx.user.findFirst({
        where: {
          id: teacherId,
          role: UserRole.TEACHER,
          status: UserStatus.ACTIVE,
        },
        select: { id: true },
      });
      if (!teacher) throw directoryError('Choose an active teacher');
      const current = id
        ? await tx.group.findUnique({ where: { id }, select: GROUP_SELECT })
        : null;
      if (id && current?.status !== ContentStatus.ACTIVE)
        throw directoryError('Group is unavailable', true);
      if (
        current &&
        (!input.expectedUpdatedAt ||
          current.updatedAt.toISOString() !== input.expectedUpdatedAt)
      )
        throw directoryError('Group changed; reload before saving', true);
      if (current?.teacherId && current.teacherId !== teacherId)
        throw directoryError('Changing group ownership is not supported');
      if (values.startsAtMinutes !== null && values.endsAtMinutes !== null) {
        const collision = await tx.group.count({
          where: {
            ...(id ? { id: { not: id } } : {}),
            status: ContentStatus.ACTIVE,
            scheduleDays: { hasSome: values.scheduleDays },
            startsAtMinutes: { lt: values.endsAtMinutes },
            endsAtMinutes: { gt: values.startsAtMinutes },
            OR: [
              { teacherId },
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
          throw directoryError('Teacher or room is already booked', true);
      }
      const group = id
        ? await tx.group.update({
            where: { id },
            data: values,
            select: GROUP_SELECT,
          })
        : await tx.group.create({
            data: { ...values, teacherId },
            select: GROUP_SELECT,
          });
      const rate = current?.tuitionRates[0];
      if (rate?.amountUzs !== amountUzs) {
        const effectiveFrom = tashkentDate();
        if (rate?.effectiveFrom.getTime() === effectiveFrom.getTime())
          await tx.groupTuitionRate.update({
            where: { id: rate.id },
            data: { amountUzs },
          });
        else {
          if (rate)
            await tx.groupTuitionRate.update({
              where: { id: rate.id },
              data: {
                effectiveTo: new Date(effectiveFrom.getTime() - 86400000),
              },
            });
          await tx.groupTuitionRate.create({
            data: {
              groupId: group.id,
              amountUzs,
              effectiveFrom,
              createdById: actorId,
            },
          });
        }
      }
      await tx.auditLog.create({
        data: {
          actorId,
          action: id ? 'GROUP_UPDATED' : 'GROUP_CREATED',
          targetId: group.id,
          targetType: 'GROUP',
          correlationId: correlationId ?? null,
          newValues: {
            name: group.name,
            teacherId,
            monthlyTuitionUzs: amountUzs.toString(),
          },
        },
      });
      return mapGroup(
        await tx.group.findUniqueOrThrow({
          where: { id: group.id },
          select: GROUP_SELECT,
        }),
      );
    });
  }
  async setStatus(
    actorId: string,
    idInput: string,
    statusInput: string,
    correlationId?: string,
  ) {
    const id = parseUuid(idInput, 'groupId');
    const status = directoryEnum(statusInput, [
      ContentStatus.ACTIVE,
      ContentStatus.ARCHIVED,
      ContentStatus.DELETED,
    ]);
    if (!status) throw directoryError('Status required');
    return this.database.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('group-schedule-write'))`;
      await tx.$queryRaw`SELECT id FROM groups WHERE id=${id}::uuid FOR UPDATE`;
      const current = await tx.group.findUnique({
        where: { id },
        select: GROUP_SELECT,
      });
      if (!current || current.status === ContentStatus.DELETED)
        throw directoryError('Group unavailable', true);
      if (
        status !== ContentStatus.ACTIVE &&
        (await tx.groupMembership.count({
          where: { groupId: id, endedAt: null },
        }))
      )
        throw directoryError(
          'A group with active students cannot be archived or deleted',
          true,
        );
      if (
        status === ContentStatus.ACTIVE &&
        current.startsAtMinutes !== null &&
        current.endsAtMinutes !== null
      ) {
        const collision = await tx.group.count({
          where: {
            ...(id ? { id: { not: id } } : {}),
            status: ContentStatus.ACTIVE,
            scheduleDays: { hasSome: current.scheduleDays },
            startsAtMinutes: { lt: current.endsAtMinutes },
            endsAtMinutes: { gt: current.startsAtMinutes },
            OR: [
              { teacherId: current.teacherId },
              ...(current.room
                ? [
                    {
                      room: {
                        equals: current.room,
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
      const row = await tx.group.update({
        where: { id },
        data: {
          status,
          archivedAt: status === ContentStatus.ARCHIVED ? new Date() : null,
        },
        select: GROUP_SELECT,
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'GROUP_STATUS_CHANGED',
          targetId: id,
          targetType: 'GROUP',
          correlationId: correlationId ?? null,
          oldValues: { status: current.status },
          newValues: { status },
        },
      });
      return mapGroup(row);
    });
  }
}

import {
  AssignmentStatus,
  ContentStatus,
  GroupCategory,
  Prisma,
  TestVersionStatus,
  UserStatus,
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
import type { GroupConnectionObject } from '../../schemas/groups/group-connection.object';
import type {
  CreateTeacherGroupInput,
  UpdateTeacherGroupInput,
} from '../../schemas/groups/group.input';
import type {
  GroupObject,
  StudentCurrentGroupObject,
  TeacherGroupOverviewObject,
} from '../../schemas/groups/group.object';

const GROUP_SELECT = {
  _count: {
    select: {
      memberships: {
        where: { endedAt: null, student: { status: UserStatus.ACTIVE } },
      },
    },
  },
  archivedAt: true,
  category: true,
  createdAt: true,
  endsAtMinutes: true,
  id: true,
  name: true,
  room: true,
  scheduleDays: true,
  slug: true,
  startsAtMinutes: true,
  status: true,
  teacherId: true,
  timeZone: true,
  tuitionRates: {
    where: { effectiveTo: null },
    orderBy: { effectiveFrom: 'desc' },
    take: 1,
    select: { amountUzs: true, effectiveFrom: true, id: true },
  },
  updatedAt: true,
} as const;

type GroupRecord = Prisma.GroupGetPayload<{ select: typeof GROUP_SELECT }>;

@Injectable()
export class GroupsService {
  constructor(private readonly database: DatabaseService) {}

  getTeacherGroups(
    teacherId: string,
    first?: number,
    after?: string,
    status?: ContentStatus,
    search?: string,
  ): Promise<GroupConnectionObject> {
    return this.getGroups(
      { teacherId, status: status ?? { not: ContentStatus.DELETED } },
      first,
      after,
      search,
    );
  }

  async getTeacherGroup(
    teacherId: string,
    groupId: string,
  ): Promise<GroupObject> {
    const id = parseUuid(groupId, 'groupId');
    const group = await this.database.group.findFirst({
      where: { id, teacherId, status: { not: ContentStatus.DELETED } },
      select: GROUP_SELECT,
    });
    if (group === null) throw inaccessibleGroupError();
    return mapGroup(group);
  }

  async getTeacherGroupOverview(
    teacherId: string,
    groupIdInput: string,
  ): Promise<TeacherGroupOverviewObject> {
    const groupId = parseUuid(groupIdInput, 'groupId');
    const group = await this.database.group.findFirst({
      where: {
        id: groupId,
        status: { not: ContentStatus.DELETED },
        teacherId,
      },
      select: { id: true },
    });
    if (group === null) throw inaccessibleGroupError();

    const [
      activeAssignmentCount,
      scheduledTestCount,
      materialCount,
      currentStudentCount,
    ] = await Promise.all([
      this.database.assignment.count({
        where: { groupId, status: AssignmentStatus.PUBLISHED },
      }),
      this.database.test.count({
        where: {
          groupId,
          status: ContentStatus.ACTIVE,
          versions: { some: { status: TestVersionStatus.PUBLISHED } },
        },
      }),
      this.database.lessonMaterial.count({
        where: { archivedAt: null, groupId },
      }),
      this.database.groupMembership.count({
        where: { endedAt: null, groupId },
      }),
    ]);

    return {
      activeAssignmentCount,
      currentStudentCount,
      materialCount,
      scheduledTestCount,
    };
  }

  async getStudentCurrentGroup(
    studentId: string,
  ): Promise<StudentCurrentGroupObject | null> {
    const membership = await this.database.groupMembership.findFirst({
      where: {
        endedAt: null,
        studentId,
        student: { status: UserStatus.ACTIVE },
        group: { status: ContentStatus.ACTIVE },
      },
      orderBy: { startedAt: 'desc' },
      select: { group: { select: GROUP_SELECT }, id: true, startedAt: true },
    });
    return membership === null
      ? null
      : {
          group: mapGroup(membership.group),
          membershipId: membership.id,
          startedAt: membership.startedAt,
        };
  }

  getAdminGroups(
    first?: number,
    after?: string,
    status?: ContentStatus,
    teacherId?: string,
    search?: string,
  ): Promise<GroupConnectionObject> {
    return this.getGroups(
      {
        ...(status === undefined ? {} : { status }),
        ...(teacherId === undefined
          ? {}
          : { teacherId: parseUuid(teacherId, 'teacherId') }),
      },
      first,
      after,
      search,
    );
  }

  async getAdminGroup(groupId: string): Promise<GroupObject> {
    const id = parseUuid(groupId, 'groupId');
    const group = await this.database.group.findUnique({
      where: { id },
      select: GROUP_SELECT,
    });
    if (group === null) throw inaccessibleGroupError();
    return mapGroup(group);
  }

  async createTeacherGroup(
    teacherId: string,
    input: CreateTeacherGroupInput,
    correlationId?: string,
  ): Promise<GroupObject> {
    const values = parseGroupInput(input);
    const monthlyTuitionUzs =
      parseMonthlyTuition(input.monthlyTuitionUzs) ?? 300000n;
    try {
      return await this.database.$transaction(async (transaction) => {
        const group = await transaction.group.create({
          data: {
            ...values,
            teacherId,
            tuitionRates: {
              create: {
                amountUzs: monthlyTuitionUzs,
                createdById: teacherId,
                effectiveFrom: tashkentDate(),
              },
            },
          },
          select: GROUP_SELECT,
        });
        await transaction.auditLog.create({
          data: {
            action: 'GROUP_CREATED',
            actorId: teacherId,
            correlationId: correlationId ?? null,
            newValues: groupAuditValues(group),
            targetId: group.id,
            targetType: 'GROUP',
          },
        });
        return mapGroup(group);
      });
    } catch (error: unknown) {
      return mapGroupWriteError(error);
    }
  }

  async updateTeacherGroup(
    teacherId: string,
    input: UpdateTeacherGroupInput,
    correlationId?: string,
  ): Promise<GroupObject> {
    const groupId = parseUuid(input.groupId, 'groupId');
    const values = parseGroupInput(input);
    const monthlyTuitionUzs = parseMonthlyTuition(input.monthlyTuitionUzs);
    try {
      return await this.database.$transaction(async (transaction) => {
        const current = await transaction.group.findFirst({
          where: { id: groupId, teacherId },
          select: GROUP_SELECT,
        });
        if (current === null) throw inaccessibleGroupError();
        if (current.status === ContentStatus.DELETED) {
          throw inaccessibleGroupError();
        }
        if (current.status === ContentStatus.ARCHIVED) {
          throw new ApplicationError(
            ErrorCode.CONFLICT,
            'Archived groups must be restored before editing',
            409,
          );
        }
        await transaction.group.update({
          where: { id: groupId },
          data: values,
        });
        const currentRate = current.tuitionRates[0];
        if (
          monthlyTuitionUzs !== undefined &&
          currentRate?.amountUzs !== monthlyTuitionUzs
        ) {
          const effectiveFrom = tashkentDate();
          if (currentRate !== undefined) {
            if (
              currentRate.effectiveFrom.getTime() === effectiveFrom.getTime()
            ) {
              await transaction.groupTuitionRate.update({
                where: { id: currentRate.id },
                data: { amountUzs: monthlyTuitionUzs },
              });
            } else {
              await transaction.groupTuitionRate.update({
                where: { id: currentRate.id },
                data: {
                  effectiveTo: new Date(effectiveFrom.getTime() - 86400000),
                },
              });
              await transaction.groupTuitionRate.create({
                data: {
                  amountUzs: monthlyTuitionUzs,
                  createdById: teacherId,
                  effectiveFrom,
                  groupId,
                },
              });
            }
          } else {
            await transaction.groupTuitionRate.create({
              data: {
                amountUzs: monthlyTuitionUzs,
                createdById: teacherId,
                effectiveFrom,
                groupId,
              },
            });
          }
        }
        const group = await transaction.group.findUniqueOrThrow({
          where: { id: groupId },
          select: GROUP_SELECT,
        });
        await transaction.auditLog.create({
          data: {
            action: 'GROUP_UPDATED',
            actorId: teacherId,
            correlationId: correlationId ?? null,
            newValues: groupAuditValues(group),
            oldValues: groupAuditValues(current),
            targetId: group.id,
            targetType: 'GROUP',
          },
        });
        return mapGroup(group);
      });
    } catch (error: unknown) {
      return mapGroupWriteError(error);
    }
  }

  async setTeacherGroupArchived(
    teacherId: string,
    groupIdInput: string,
    archived: boolean,
    reasonInput: string,
    correlationId?: string,
  ): Promise<GroupObject> {
    const groupId = parseUuid(groupIdInput, 'groupId');
    const reason = parseReason(reasonInput);
    return this.database.$transaction(async (transaction) => {
      const current = await transaction.group.findFirst({
        where: { id: groupId, teacherId },
        select: GROUP_SELECT,
      });
      if (current === null) throw inaccessibleGroupError();
      if (current.status === ContentStatus.DELETED) {
        throw inaccessibleGroupError();
      }
      const desiredStatus = archived
        ? ContentStatus.ARCHIVED
        : ContentStatus.ACTIVE;
      if (current.status === desiredStatus) return mapGroup(current);
      if (archived) {
        const activeMembershipCount = await transaction.groupMembership.count({
          where: { endedAt: null, groupId },
        });
        if (activeMembershipCount > 0) {
          throw new ApplicationError(
            ErrorCode.CONFLICT,
            'A group with active memberships cannot be archived',
            409,
          );
        }
      }
      const group = await transaction.group.update({
        where: { id: groupId },
        data: {
          archivedAt: archived ? new Date() : null,
          status: desiredStatus,
        },
        select: GROUP_SELECT,
      });
      await transaction.auditLog.create({
        data: {
          action: archived ? 'GROUP_ARCHIVED' : 'GROUP_RESTORED',
          actorId: teacherId,
          correlationId: correlationId ?? null,
          newValues: { status: group.status },
          oldValues: { status: current.status },
          reason,
          targetId: group.id,
          targetType: 'GROUP',
        },
      });
      return mapGroup(group);
    });
  }

  async deleteTeacherGroup(
    teacherId: string,
    groupIdInput: string,
    correlationId?: string,
  ): Promise<GroupObject> {
    const groupId = parseUuid(groupIdInput, 'groupId');
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM groups WHERE id = ${groupId}::uuid AND teacher_id = ${teacherId}::uuid FOR UPDATE`;
      const current = await transaction.group.findFirst({
        where: { id: groupId, teacherId },
        select: GROUP_SELECT,
      });
      if (current === null) throw inaccessibleGroupError();
      if (current.status === ContentStatus.DELETED) return mapGroup(current);
      const activeMembershipCount = await transaction.groupMembership.count({
        where: { endedAt: null, groupId },
      });
      if (activeMembershipCount > 0) {
        throw new ApplicationError(
          ErrorCode.CONFLICT,
          'A group with active memberships cannot be deleted',
          409,
        );
      }
      const group = await transaction.group.update({
        where: { id: groupId },
        data: { status: ContentStatus.DELETED },
        select: GROUP_SELECT,
      });
      await transaction.auditLog.create({
        data: {
          action: 'GROUP_DELETED',
          actorId: teacherId,
          correlationId: correlationId ?? null,
          newValues: { status: group.status },
          oldValues: { status: current.status },
          targetId: group.id,
          targetType: 'GROUP',
        },
      });
      return mapGroup(group);
    });
  }

  private async getGroups(
    scope: Prisma.GroupWhereInput,
    first: number | undefined,
    after: string | undefined,
    search: string | undefined,
  ): Promise<GroupConnectionObject> {
    const pageSize = parsePageSize(first);
    const cursor = decodeCursor(after);
    const normalizedSearch = parseSearch(search);
    const groups = await this.database.group.findMany({
      where: {
        ...scope,
        ...(normalizedSearch === undefined
          ? {}
          : {
              OR: [
                { name: { contains: normalizedSearch, mode: 'insensitive' } },
                { slug: { contains: normalizedSearch, mode: 'insensitive' } },
              ],
            }),
      },
      orderBy: { id: 'asc' },
      take: pageSize + 1,
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
      select: GROUP_SELECT,
    });
    const hasNextPage = groups.length > pageSize;
    const page = hasNextPage ? groups.slice(0, pageSize) : groups;
    return {
      edges: page.map((group) => ({
        cursor: encodeCursor(group.id),
        node: mapGroup(group),
      })),
      pageInfo: {
        endCursor:
          page.at(-1) === undefined
            ? null
            : encodeCursor(page.at(-1)?.id ?? ''),
        hasNextPage,
      },
    };
  }
}

interface GroupInputValues {
  readonly category: GroupCategory;
  readonly endsAtMinutes: number | null;
  readonly name: string;
  readonly room: string | null;
  readonly scheduleDays: number[];
  readonly slug: string;
  readonly startsAtMinutes: number | null;
  readonly timeZone: string;
}

function parseMonthlyTuition(value: string | undefined): bigint | undefined {
  if (value === undefined) return undefined;
  if (!/^[1-9]\d{0,9}$/.test(value) || BigInt(value) > 2000000000n) {
    throw new ApplicationError(
      ErrorCode.BAD_USER_INPUT,
      'monthlyTuitionUzs must be a whole UZS amount from 1 to 2000000000',
      400,
    );
  }
  return BigInt(value);
}

function tashkentDate(): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
  }).formatToParts(new Date());
  const part = (type: string): number =>
    Number(parts.find((value) => value.type === type)?.value);
  return new Date(Date.UTC(part('year'), part('month') - 1, part('day')));
}

function parseGroupInput(input: CreateTeacherGroupInput): GroupInputValues {
  const name = parseText(input.name, 'name', 160);
  if (!Object.values(GroupCategory).includes(input.category)) {
    throw new ApplicationError(
      ErrorCode.BAD_USER_INPUT,
      'category is invalid',
      400,
    );
  }
  const slug = input.slug.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 160) {
    throw new ApplicationError(
      ErrorCode.BAD_USER_INPUT,
      'slug must contain lowercase letters, numbers, and single hyphens',
      400,
    );
  }
  const scheduleDays = [...new Set(input.scheduleDays)].sort((a, b) => a - b);
  if (
    scheduleDays.length > 7 ||
    scheduleDays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)
  ) {
    throw new ApplicationError(
      ErrorCode.BAD_USER_INPUT,
      'scheduleDays must contain unique ISO weekdays from 1 to 7',
      400,
    );
  }
  const startsAtMinutes = input.startsAtMinutes ?? null;
  const endsAtMinutes = input.endsAtMinutes ?? null;
  const invalidTimes =
    startsAtMinutes === null || endsAtMinutes === null
      ? startsAtMinutes !== endsAtMinutes
      : !Number.isInteger(startsAtMinutes) ||
        !Number.isInteger(endsAtMinutes) ||
        startsAtMinutes < 0 ||
        endsAtMinutes > 1440 ||
        startsAtMinutes >= endsAtMinutes;
  if (invalidTimes) {
    throw new ApplicationError(
      ErrorCode.BAD_USER_INPUT,
      'startsAtMinutes and endsAtMinutes must define a valid daily time range',
      400,
    );
  }
  const timeZone = (input.timeZone ?? 'Asia/Tashkent').trim();
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format();
  } catch {
    throw new ApplicationError(
      ErrorCode.BAD_USER_INPUT,
      'timeZone must be a valid IANA time zone',
      400,
    );
  }
  return {
    category: input.category,
    endsAtMinutes,
    name,
    room:
      input.room === undefined
        ? null
        : parseNullableText(input.room, 'room', 80),
    scheduleDays,
    slug,
    startsAtMinutes,
    timeZone,
  };
}

function mapGroup(group: GroupRecord): GroupObject {
  const { _count, tuitionRates, ...values } = group;
  return {
    ...values,
    activeStudentCount: _count.memberships,
    monthlyTuitionUzs: tuitionRates[0]?.amountUzs.toString() ?? null,
  };
}

function groupAuditValues(group: GroupRecord): Prisma.InputJsonObject {
  return {
    category: group.category ?? null,
    endsAtMinutes: group.endsAtMinutes ?? null,
    name: group.name,
    monthlyTuitionUzs: group.tuitionRates[0]?.amountUzs.toString() ?? null,
    room: group.room ?? null,
    scheduleDays: group.scheduleDays,
    slug: group.slug,
    startsAtMinutes: group.startsAtMinutes ?? null,
    status: group.status,
    timeZone: group.timeZone,
  };
}

function parseText(value: string, field: string, max: number): string {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > max) {
    throw new ApplicationError(
      ErrorCode.BAD_USER_INPUT,
      `${field} must contain between 1 and ${String(max)} characters`,
      400,
    );
  }
  return normalized;
}

function parseNullableText(
  value: string,
  field: string,
  max: number,
): string | null {
  return value.trim().length === 0 ? null : parseText(value, field, max);
}

function parseReason(value: string): string {
  const reason = value.trim();
  if (reason.length < 10 || reason.length > 1000) {
    throw new ApplicationError(
      ErrorCode.BAD_USER_INPUT,
      'reason must contain between 10 and 1000 characters',
      400,
    );
  }
  return reason;
}

function parseSearch(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const search = value.trim();
  if (search.length < 2 || search.length > 160) {
    throw new ApplicationError(
      ErrorCode.BAD_USER_INPUT,
      'search must contain between 2 and 160 characters',
      400,
    );
  }
  return search;
}

function inaccessibleGroupError(): ApplicationError {
  return new ApplicationError(ErrorCode.NOT_FOUND, 'Group was not found', 404);
}

function mapGroupWriteError(error: unknown): never {
  if (error instanceof ApplicationError) throw error;
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new ApplicationError(
      ErrorCode.CONFLICT,
      'A group with the same name or slug already exists',
      409,
    );
  }
  throw error;
}

import { ContentStatus, Prisma, UserStatus } from '@best/database';
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
} from '../../schemas/groups/group.object';

const GROUP_SELECT = {
  archivedAt: true,
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
  updatedAt: true,
} as const;

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
      { teacherId, ...(status === undefined ? {} : { status }) },
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
      where: { id, teacherId },
      select: GROUP_SELECT,
    });
    if (group === null) throw inaccessibleGroupError();
    return group;
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
          group: membership.group,
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
    return group;
  }

  async createTeacherGroup(
    teacherId: string,
    input: CreateTeacherGroupInput,
    correlationId?: string,
  ): Promise<GroupObject> {
    const values = parseGroupInput(input);
    try {
      return await this.database.$transaction(async (transaction) => {
        const group = await transaction.group.create({
          data: { ...values, teacherId },
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
        return group;
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
    try {
      return await this.database.$transaction(async (transaction) => {
        const current = await transaction.group.findFirst({
          where: { id: groupId, teacherId },
          select: GROUP_SELECT,
        });
        if (current === null) throw inaccessibleGroupError();
        if (current.status === ContentStatus.ARCHIVED) {
          throw new ApplicationError(
            ErrorCode.CONFLICT,
            'Archived groups must be restored before editing',
            409,
          );
        }
        const group = await transaction.group.update({
          where: { id: groupId },
          data: values,
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
        return group;
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
      const desiredStatus = archived
        ? ContentStatus.ARCHIVED
        : ContentStatus.ACTIVE;
      if (current.status === desiredStatus) return current;
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
      return group;
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
        node: group,
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
  readonly endsAtMinutes: number | null;
  readonly name: string;
  readonly room: string | null;
  readonly scheduleDays: number[];
  readonly slug: string;
  readonly startsAtMinutes: number | null;
  readonly timeZone: string;
}

function parseGroupInput(input: CreateTeacherGroupInput): GroupInputValues {
  const name = parseText(input.name, 'name', 160);
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

function groupAuditValues(group: GroupObject): Prisma.InputJsonObject {
  return {
    endsAtMinutes: group.endsAtMinutes ?? null,
    name: group.name,
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

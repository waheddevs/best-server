import {
  ContentStatus,
  Prisma,
  TransferRequestStatus,
  UserRole,
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
import type { GroupRosterConnectionObject } from '../../schemas/groups/group-connection.object';
import type {
  GroupTransferRequestConnectionObject,
  GroupTransferRequestObject,
} from '../../schemas/groups/group-transfer.object';
import type { GroupRosterMemberObject } from '../../schemas/groups/group.object';
import type {
  RequestStudentTransferInput,
  ReviewStudentTransferInput,
} from '../../schemas/groups/membership.input';

const TRANSFER_SELECT = {
  createdAt: true,
  fromGroup: { select: { id: true, name: true } },
  id: true,
  reason: true,
  reviewNote: true,
  reviewedAt: true,
  status: true,
  student: { select: { displayName: true, id: true } },
  toGroup: { select: { id: true, name: true } },
} as const;

@Injectable()
export class MembershipsService {
  constructor(private readonly database: DatabaseService) {}

  async getTeacherRoster(
    teacherId: string,
    groupIdInput: string,
    first?: number,
    after?: string,
    includeEnded = false,
    search?: string,
  ): Promise<GroupRosterConnectionObject> {
    const groupId = parseUuid(groupIdInput, 'groupId');
    await this.requireOwnedGroup(teacherId, groupId);
    const pageSize = parsePageSize(first);
    const cursor = decodeCursor(after);
    const normalizedSearch = parseSearch(search);
    const memberships = await this.database.groupMembership.findMany({
      where: {
        groupId,
        ...(includeEnded ? {} : { endedAt: null }),
        ...(normalizedSearch === undefined
          ? {}
          : {
              student: {
                OR: [
                  {
                    displayName: {
                      contains: normalizedSearch,
                      mode: 'insensitive',
                    },
                  },
                  {
                    email: { contains: normalizedSearch, mode: 'insensitive' },
                  },
                  {
                    phone: { contains: normalizedSearch, mode: 'insensitive' },
                  },
                ],
              },
            }),
      },
      orderBy: { id: 'asc' },
      take: pageSize + 1,
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
      select: {
        endedAt: true,
        id: true,
        startedAt: true,
        student: {
          select: {
            displayName: true,
            email: true,
            id: true,
            phone: true,
            status: true,
          },
        },
      },
    });
    const hasNextPage = memberships.length > pageSize;
    const page = hasNextPage ? memberships.slice(0, pageSize) : memberships;
    return {
      edges: page.map((membership) => ({
        cursor: encodeCursor(membership.id),
        node: mapMembership(membership),
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

  async addStudentToGroup(
    teacherId: string,
    groupIdInput: string,
    studentIdInput: string,
    correlationId?: string,
  ): Promise<GroupRosterMemberObject> {
    const groupId = parseUuid(groupIdInput, 'groupId');
    const studentId = parseUuid(studentIdInput, 'studentId');
    return this.database.$transaction(async (transaction) => {
      const [group, student, currentMembership] = await Promise.all([
        transaction.group.findFirst({
          where: { id: groupId, status: ContentStatus.ACTIVE, teacherId },
          select: { id: true },
        }),
        transaction.user.findFirst({
          where: {
            id: studentId,
            role: UserRole.STUDENT,
            status: UserStatus.ACTIVE,
          },
          select: { id: true },
        }),
        transaction.groupMembership.findFirst({
          where: { endedAt: null, studentId },
          select: { id: true },
        }),
      ]);
      if (group === null || student === null)
        throw inaccessibleMembershipError();
      if (currentMembership !== null) {
        throw new ApplicationError(
          ErrorCode.CONFLICT,
          'The Student already has an active group membership',
          409,
        );
      }
      const membership = await transaction.groupMembership.create({
        data: { groupId, studentId },
        select: membershipSelect(),
      });
      await transaction.auditLog.create({
        data: {
          action: 'GROUP_MEMBERSHIP_STARTED',
          actorId: teacherId,
          correlationId: correlationId ?? null,
          newValues: { groupId, studentId },
          targetId: membership.id,
          targetType: 'GROUP_MEMBERSHIP',
        },
      });
      return mapMembership(membership);
    });
  }

  async endGroupMembership(
    teacherId: string,
    membershipIdInput: string,
    reasonInput: string,
    correlationId?: string,
  ): Promise<GroupRosterMemberObject> {
    const membershipId = parseUuid(membershipIdInput, 'membershipId');
    const reason = parseReason(reasonInput);
    return this.database.$transaction(async (transaction) => {
      const current = await transaction.groupMembership.findFirst({
        where: { id: membershipId, group: { teacherId } },
        select: membershipSelect(),
      });
      if (current === null) throw inaccessibleMembershipError();
      if (current.endedAt !== null) return mapMembership(current);
      const endedAt = new Date();
      const membership = await transaction.groupMembership.update({
        where: { id: membershipId },
        data: { endedAt },
        select: membershipSelect(),
      });
      await transaction.auditLog.create({
        data: {
          action: 'GROUP_MEMBERSHIP_ENDED',
          actorId: teacherId,
          correlationId: correlationId ?? null,
          newValues: { endedAt: endedAt.toISOString() },
          oldValues: { endedAt: null },
          reason,
          targetId: membershipId,
          targetType: 'GROUP_MEMBERSHIP',
        },
      });
      return mapMembership(membership);
    });
  }

  async requestStudentTransfer(
    teacherId: string,
    input: RequestStudentTransferInput,
    correlationId?: string,
  ): Promise<GroupTransferRequestObject> {
    const studentId = parseUuid(input.studentId, 'studentId');
    const toGroupId = parseUuid(input.toGroupId, 'toGroupId');
    const reason = parseReason(input.reason);
    try {
      const request = await this.database.$transaction(async (transaction) => {
        const membership = await transaction.groupMembership.findFirst({
          where: {
            endedAt: null,
            studentId,
            group: { status: ContentStatus.ACTIVE, teacherId },
          },
          select: { groupId: true },
        });
        const toGroup = await transaction.group.findFirst({
          where: { id: toGroupId, status: ContentStatus.ACTIVE },
          select: { id: true },
        });
        if (membership === null || toGroup === null) {
          throw inaccessibleMembershipError();
        }
        if (membership.groupId === toGroupId) {
          throw new ApplicationError(
            ErrorCode.BAD_USER_INPUT,
            'The destination group must be different',
            400,
          );
        }
        const created = await transaction.groupTransferRequest.create({
          data: {
            fromGroupId: membership.groupId,
            reason,
            requestedById: teacherId,
            studentId,
            toGroupId,
          },
          select: TRANSFER_SELECT,
        });
        await transaction.auditLog.create({
          data: {
            action: 'GROUP_TRANSFER_REQUESTED',
            actorId: teacherId,
            correlationId: correlationId ?? null,
            newValues: {
              fromGroupId: membership.groupId,
              status: TransferRequestStatus.PENDING,
              studentId,
              toGroupId,
            },
            reason,
            targetId: created.id,
            targetType: 'GROUP_TRANSFER_REQUEST',
          },
        });
        return created;
      });
      return mapTransfer(request);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ApplicationError(
          ErrorCode.CONFLICT,
          'The Student already has a pending transfer request',
          409,
        );
      }
      throw error;
    }
  }

  async getTeacherTransferRequests(
    teacherId: string,
    first?: number,
    after?: string,
    status?: TransferRequestStatus,
  ): Promise<GroupTransferRequestConnectionObject> {
    const pageSize = parsePageSize(first);
    const cursor = decodeCursor(after);
    const requests = await this.database.groupTransferRequest.findMany({
      where: {
        requestedById: teacherId,
        ...(status === undefined ? {} : { status }),
      },
      orderBy: { id: 'asc' },
      take: pageSize + 1,
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
      select: TRANSFER_SELECT,
    });
    const hasNextPage = requests.length > pageSize;
    const page = hasNextPage ? requests.slice(0, pageSize) : requests;
    return {
      edges: page.map((request) => ({
        cursor: encodeCursor(request.id),
        node: mapTransfer(request),
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

  async getAdminTransferRequests(
    first?: number,
    after?: string,
    status?: TransferRequestStatus,
  ): Promise<GroupTransferRequestConnectionObject> {
    const pageSize = parsePageSize(first);
    const cursor = decodeCursor(after);
    const requests = await this.database.groupTransferRequest.findMany({
      where: status === undefined ? {} : { status },
      orderBy: { id: 'asc' },
      take: pageSize + 1,
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
      select: TRANSFER_SELECT,
    });
    const hasNextPage = requests.length > pageSize;
    const page = hasNextPage ? requests.slice(0, pageSize) : requests;
    const edges = page.map((request) => ({
      cursor: encodeCursor(request.id),
      node: mapTransfer(request),
    }));
    return {
      edges,
      pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
    };
  }

  async reviewStudentTransfer(
    adminId: string,
    input: ReviewStudentTransferInput,
    correlationId?: string,
  ): Promise<GroupTransferRequestObject> {
    const requestId = parseUuid(input.transferRequestId, 'transferRequestId');
    if (
      input.decision !== TransferRequestStatus.APPROVED &&
      input.decision !== TransferRequestStatus.DECLINED
    ) {
      throw new ApplicationError(
        ErrorCode.BAD_USER_INPUT,
        'decision must be APPROVED or DECLINED',
        400,
      );
    }
    const reviewNote = parseReason(input.reviewNote);
    const reviewedAt = new Date();
    const request = await this.database.$transaction(async (transaction) => {
      const current = await transaction.groupTransferRequest.findUnique({
        where: { id: requestId },
        select: TRANSFER_SELECT,
      });
      if (current === null) throw inaccessibleMembershipError();
      if (current.status !== TransferRequestStatus.PENDING) {
        throw new ApplicationError(
          ErrorCode.CONFLICT,
          'The transfer request has already been reviewed',
          409,
        );
      }
      if (input.decision === TransferRequestStatus.APPROVED) {
        const membership = await transaction.groupMembership.findFirst({
          where: {
            endedAt: null,
            groupId: current.fromGroup.id,
            studentId: current.student.id,
          },
          select: { id: true },
        });
        const destination = await transaction.group.findFirst({
          where: { id: current.toGroup.id, status: ContentStatus.ACTIVE },
          select: { id: true },
        });
        if (membership === null || destination === null) {
          throw new ApplicationError(
            ErrorCode.CONFLICT,
            'The transfer source or destination is no longer active',
            409,
          );
        }
        await transaction.groupMembership.update({
          where: { id: membership.id },
          data: { endedAt: reviewedAt },
        });
        await transaction.groupMembership.create({
          data: {
            groupId: current.toGroup.id,
            startedAt: reviewedAt,
            studentId: current.student.id,
          },
        });
      }
      const updated = await transaction.groupTransferRequest.update({
        where: { id: requestId },
        data: {
          reviewNote,
          reviewedAt,
          reviewedById: adminId,
          status: input.decision,
        },
        select: TRANSFER_SELECT,
      });
      await transaction.auditLog.create({
        data: {
          action: 'GROUP_TRANSFER_REVIEWED',
          actorId: adminId,
          correlationId: correlationId ?? null,
          newValues: { status: input.decision },
          oldValues: { status: TransferRequestStatus.PENDING },
          reason: reviewNote,
          targetId: requestId,
          targetType: 'GROUP_TRANSFER_REQUEST',
        },
      });
      return updated;
    });
    return mapTransfer(request);
  }

  private async requireOwnedGroup(
    teacherId: string,
    groupId: string,
  ): Promise<void> {
    const group = await this.database.group.findFirst({
      where: { id: groupId, teacherId },
      select: { id: true },
    });
    if (group === null) throw inaccessibleMembershipError();
  }
}

function membershipSelect() {
  return {
    endedAt: true,
    id: true,
    startedAt: true,
    student: {
      select: {
        displayName: true,
        email: true,
        id: true,
        phone: true,
        status: true,
      },
    },
  } as const;
}

function mapMembership(membership: {
  readonly endedAt: Date | null;
  readonly id: string;
  readonly startedAt: Date;
  readonly student: {
    readonly displayName: string;
    readonly email: string | null;
    readonly id: string;
    readonly phone: string | null;
    readonly status: UserStatus;
  };
}): GroupRosterMemberObject {
  return {
    displayName: membership.student.displayName,
    email: membership.student.email,
    endedAt: membership.endedAt,
    membershipId: membership.id,
    phone: membership.student.phone,
    startedAt: membership.startedAt,
    status: membership.student.status,
    studentId: membership.student.id,
  };
}

function mapTransfer(request: {
  readonly createdAt: Date;
  readonly fromGroup: { readonly id: string; readonly name: string };
  readonly id: string;
  readonly reason: string;
  readonly reviewNote: string | null;
  readonly reviewedAt: Date | null;
  readonly status: TransferRequestStatus;
  readonly student: { readonly displayName: string; readonly id: string };
  readonly toGroup: { readonly id: string; readonly name: string };
}): GroupTransferRequestObject {
  return {
    createdAt: request.createdAt,
    fromGroupId: request.fromGroup.id,
    fromGroupName: request.fromGroup.name,
    id: request.id,
    reason: request.reason,
    reviewNote: request.reviewNote,
    reviewedAt: request.reviewedAt,
    status: request.status,
    studentDisplayName: request.student.displayName,
    studentId: request.student.id,
    toGroupId: request.toGroup.id,
    toGroupName: request.toGroup.name,
  };
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

function inaccessibleMembershipError(): ApplicationError {
  return new ApplicationError(
    ErrorCode.NOT_FOUND,
    'Group membership was not found',
    404,
  );
}

import {
  ContentStatus,
  FinanceAdjustmentKind,
  GroupMembershipStatus,
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
import { GroupRosterStatus } from '../../schemas/groups/group-roster-status.enum';
import type {
  GroupRosterMemberObject,
  TeacherGroupRosterSummaryObject,
} from '../../schemas/groups/group.object';
import type {
  RequestStudentTransferInput,
  ReviewStudentTransferInput,
  TeacherCreateStudentInGroupInput,
} from '../../schemas/groups/membership.input';
import { CredentialPasswordService } from '../auth/credential-password.service';

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

const GROUP_LEARNER_CAPACITY = 15;

const MEMBERSHIP_SELECT = {
  endedAt: true,
  id: true,
  participationStatus: true,
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
  tuitionCharges: {
    select: {
      adjustments: { select: { amountUzs: true, kind: true } },
      allocations: { select: { amountUzs: true } },
      amountUzs: true,
      dueDate: true,
    },
  },
} as const;

type MembershipRecord = Prisma.GroupMembershipGetPayload<{
  select: typeof MEMBERSHIP_SELECT;
}>;

async function assertGroupHasCapacity(
  transaction: Prisma.TransactionClient,
  groupId: string,
): Promise<void> {
  await transaction.$queryRaw`SELECT id FROM groups WHERE id = ${groupId}::uuid FOR UPDATE`;
  const activeCount = await transaction.groupMembership.count({
    where: { endedAt: null, groupId },
  });
  if (activeCount >= GROUP_LEARNER_CAPACITY) {
    throw new ApplicationError(
      ErrorCode.CONFLICT,
      'The group has reached its 15-learner capacity',
      409,
    );
  }
}

@Injectable()
export class MembershipsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly passwordService: CredentialPasswordService,
  ) {}

  async createStudentInGroup(
    teacherId: string,
    input: TeacherCreateStudentInGroupInput,
    correlationId?: string,
  ): Promise<GroupRosterMemberObject> {
    const groupId = parseUuid(input.groupId, 'groupId');
    const firstName = input.firstName.trim().replace(/\s+/g, ' ');
    const lastName = input.lastName.trim().replace(/\s+/g, ' ');
    const displayName = `${firstName} ${lastName}`;
    const phone = input.phone.replace(/[\s()-]/g, '');
    const email = input.email.trim().toLowerCase();
    if (!firstName || firstName.length > 80) {
      throw new ApplicationError(
        ErrorCode.BAD_USER_INPUT,
        'firstName is invalid',
        400,
      );
    }
    if (!lastName || lastName.length > 80 || displayName.length > 160) {
      throw new ApplicationError(
        ErrorCode.BAD_USER_INPUT,
        'lastName is invalid',
        400,
      );
    }
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      throw new ApplicationError(
        ErrorCode.BAD_USER_INPUT,
        'phone is invalid',
        400,
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
      throw new ApplicationError(
        ErrorCode.BAD_USER_INPUT,
        'email is invalid',
        400,
      );
    }
    if (input.password.length < 12 || input.password.length > 128) {
      throw new ApplicationError(
        ErrorCode.BAD_USER_INPUT,
        'password is invalid',
        400,
      );
    }
    const credentialPasswordHash = await this.passwordService.hashPassword(
      input.password,
    );

    try {
      return await this.database.$transaction(async (transaction) => {
        const group = await transaction.group.findFirst({
          where: { id: groupId, status: ContentStatus.ACTIVE, teacherId },
          select: { id: true },
        });
        if (group === null) throw inaccessibleMembershipError();
        await assertGroupHasCapacity(transaction, groupId);
        const existing = await transaction.user.findUnique({
          where: { email },
          select: { id: true },
        });
        if (existing !== null) {
          throw new ApplicationError(
            ErrorCode.CONFLICT,
            'Student email already exists',
            409,
          );
        }
        const student = await transaction.user.create({
          data: {
            credentialPasswordHash,
            displayName,
            email,
            phone,
            role: UserRole.STUDENT,
          },
          select: { id: true },
        });
        const membership = await transaction.groupMembership.create({
          data: { groupId, studentId: student.id },
          select: membershipSelect(),
        });
        await transaction.auditLog.create({
          data: {
            action: 'TEACHER_STUDENT_CREATED_AND_ENROLLED',
            actorId: teacherId,
            correlationId: correlationId ?? null,
            newValues: { groupId, studentId: student.id },
            targetId: membership.id,
            targetType: 'GROUP_MEMBERSHIP',
          },
        });
        return mapMembership(membership);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ApplicationError(
          ErrorCode.CONFLICT,
          'Student email already exists',
          409,
        );
      }
      throw error;
    }
  }

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
      select: MEMBERSHIP_SELECT,
    });
    const hasNextPage = memberships.length > pageSize;
    const page = hasNextPage ? memberships.slice(0, pageSize) : memberships;
    return {
      edges: page.map((membership) => ({
        cursor: encodeCursor(membership.id),
        node: mapMembership(membership, new Date()),
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

  async getTeacherRosterSummary(
    teacherId: string,
    groupIdInput: string,
  ): Promise<TeacherGroupRosterSummaryObject> {
    const groupId = parseUuid(groupIdInput, 'groupId');
    await this.requireOwnedGroup(teacherId, groupId);
    const memberships = await this.database.groupMembership.findMany({
      where: { groupId },
      select: MEMBERSHIP_SELECT,
    });
    const now = new Date();
    const statuses = memberships.map((membership) =>
      getRosterStatus(membership, now),
    );

    return {
      active: countStatus(statuses, GroupRosterStatus.ACTIVE),
      currentTotal: memberships.filter(
        (membership) => membership.endedAt === null,
      ).length,
      debtors: countStatus(statuses, GroupRosterStatus.DEBTOR),
      departed: countStatus(statuses, GroupRosterStatus.DEPARTED),
      historicalTotal: memberships.length,
      paused: countStatus(statuses, GroupRosterStatus.PAUSED),
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
      await assertGroupHasCapacity(transaction, groupId);
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

  async setGroupMembershipParticipationStatus(
    teacherId: string,
    membershipIdInput: string,
    status: GroupMembershipStatus,
    reasonInput: string,
    correlationId?: string,
  ): Promise<GroupRosterMemberObject> {
    const membershipId = parseUuid(membershipIdInput, 'membershipId');
    const reason = parseReason(reasonInput);

    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM group_memberships WHERE id = ${membershipId}::uuid FOR UPDATE`;
      const current = await transaction.groupMembership.findFirst({
        where: {
          endedAt: null,
          group: {
            status: { not: ContentStatus.DELETED },
            teacherId,
          },
          id: membershipId,
        },
        select: MEMBERSHIP_SELECT,
      });
      if (current === null) throw inaccessibleMembershipError();
      if (current.participationStatus === status) return mapMembership(current);

      const membership = await transaction.groupMembership.update({
        where: { id: membershipId },
        data: { participationStatus: status },
        select: MEMBERSHIP_SELECT,
      });
      await transaction.auditLog.create({
        data: {
          action: 'GROUP_MEMBERSHIP_PARTICIPATION_STATUS_SET',
          actorId: teacherId,
          correlationId: correlationId ?? null,
          newValues: { participationStatus: status },
          oldValues: {
            participationStatus: current.participationStatus,
          },
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
      let transferredMembershipIds:
        | { readonly fromMembershipId: string; readonly toMembershipId: string }
        | undefined;
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
        await assertGroupHasCapacity(transaction, current.toGroup.id);
        await transaction.groupMembership.update({
          where: { id: membership.id },
          data: { endedAt: reviewedAt },
        });
        const destinationMembership = await transaction.groupMembership.create({
          data: {
            groupId: current.toGroup.id,
            startedAt: reviewedAt,
            studentId: current.student.id,
          },
          select: { id: true },
        });
        transferredMembershipIds = {
          fromMembershipId: membership.id,
          toMembershipId: destinationMembership.id,
        };
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
          newValues: {
            status: input.decision,
            ...transferredMembershipIds,
          },
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
      where: {
        id: groupId,
        status: { not: ContentStatus.DELETED },
        teacherId,
      },
      select: { id: true },
    });
    if (group === null) throw inaccessibleMembershipError();
  }
}

function membershipSelect() {
  return MEMBERSHIP_SELECT;
}

function mapMembership(
  membership: MembershipRecord,
  now = new Date(),
): GroupRosterMemberObject {
  const outstandingBalanceUzs = getOverdueBalance(membership, now);
  return {
    displayName: membership.student.displayName,
    email: membership.student.email,
    endedAt: membership.endedAt,
    membershipId: membership.id,
    outstandingBalanceUzs: outstandingBalanceUzs.toString(),
    phone: membership.student.phone,
    rosterStatus: getRosterStatus(membership, now, outstandingBalanceUzs),
    startedAt: membership.startedAt,
    status: membership.student.status,
    studentId: membership.student.id,
  };
}

function getRosterStatus(
  membership: MembershipRecord,
  now: Date,
  overdueBalance = getOverdueBalance(membership, now),
): GroupRosterStatus {
  if (membership.endedAt !== null) return GroupRosterStatus.DEPARTED;
  if (membership.participationStatus === GroupMembershipStatus.PAUSED) {
    return GroupRosterStatus.PAUSED;
  }
  return overdueBalance > 0n
    ? GroupRosterStatus.DEBTOR
    : GroupRosterStatus.ACTIVE;
}

function getOverdueBalance(membership: MembershipRecord, now: Date): bigint {
  return membership.tuitionCharges.reduce((total, charge) => {
    if (charge.dueDate.getTime() >= now.getTime()) return total;
    const allocatedAmount = charge.allocations.reduce(
      (value, allocation) => value + allocation.amountUzs,
      0n,
    );
    const adjustmentAmount = charge.adjustments.reduce((value, adjustment) => {
      const direction =
        adjustment.kind === FinanceAdjustmentKind.DEBIT ? 1n : -1n;
      return value + adjustment.amountUzs * direction;
    }, 0n);
    const outstanding = charge.amountUzs + adjustmentAmount - allocatedAmount;
    return outstanding > 0n ? total + outstanding : total;
  }, 0n);
}

function countStatus(
  statuses: readonly GroupRosterStatus[],
  expected: GroupRosterStatus,
): number {
  return statuses.filter((status) => status === expected).length;
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

import {
  ContentStatus,
  FinanceAdjustmentKind,
  GroupMembershipStatus,
  Prisma,
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
import { GroupRosterStatus } from '../../schemas/groups/group-roster-status.enum';
import type {
  GroupRosterMemberObject,
  TeacherGroupRosterSummaryObject,
} from '../../schemas/groups/group.object';
import type { TeacherCreateStudentInGroupInput } from '../../schemas/groups/membership.input';
import { CredentialPasswordService } from '../auth/credential-password.service';

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
      allocations: {
        select: {
          amountUzs: true,
          payment: {
            select: { amountUzs: true, id: true, paidAt: true },
          },
        },
      },
      amountUzs: true,
      billingMonth: true,
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
        student: {
          status: { not: UserStatus.DELETED },
          ...(normalizedSearch === undefined
            ? {}
            : {
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
              }),
        },
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
      where: { groupId, student: { status: { not: UserStatus.DELETED } } },
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

  async deleteTeacherStudent(
    teacherId: string,
    membershipIdInput: string,
    correlationId?: string,
  ): Promise<GroupRosterMemberObject> {
    const membershipId = parseUuid(membershipIdInput, 'membershipId');
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM group_memberships WHERE id = ${membershipId}::uuid FOR UPDATE`;
      const current = await transaction.groupMembership.findFirst({
        where: {
          endedAt: null,
          group: { status: ContentStatus.ACTIVE, teacherId },
          id: membershipId,
          student: { role: UserRole.STUDENT, status: UserStatus.ACTIVE },
        },
        select: MEMBERSHIP_SELECT,
      });
      if (current === null) throw inaccessibleMembershipError();

      const updated = await transaction.user.updateMany({
        where: {
          id: current.student.id,
          role: UserRole.STUDENT,
          status: UserStatus.ACTIVE,
        },
        data: { status: UserStatus.DELETED },
      });
      if (updated.count !== 1) throw inaccessibleMembershipError();

      const endedAt = new Date();
      const membership = await transaction.groupMembership.update({
        where: { id: membershipId },
        data: { endedAt },
        select: MEMBERSHIP_SELECT,
      });
      await transaction.auditLog.create({
        data: {
          action: 'TEACHER_STUDENT_SOFT_DELETED',
          actorId: teacherId,
          correlationId: correlationId ?? null,
          newValues: {
            endedAt: endedAt.toISOString(),
            membershipId,
            status: UserStatus.DELETED,
          },
          oldValues: { endedAt: null, status: UserStatus.ACTIVE },
          targetId: current.student.id,
          targetType: 'USER',
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
  const monthParts = new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
  }).formatToParts(now);
  const month = Number(monthParts.find((part) => part.type === 'month')?.value);
  const year = Number(monthParts.find((part) => part.type === 'year')?.value);
  const paidAmountUzs = membership.tuitionCharges.reduce((total, charge) => {
    if (
      charge.billingMonth.getUTCFullYear() !== year ||
      charge.billingMonth.getUTCMonth() + 1 !== month
    ) {
      return total;
    }
    return (
      total +
      charge.allocations.reduce(
        (allocated, allocation) => allocated + allocation.amountUzs,
        0n,
      )
    );
  }, 0n);
  const recentPayments = [
    ...new Map(
      membership.tuitionCharges.flatMap((charge) =>
        charge.allocations.map(
          (allocation) => [allocation.payment.id, allocation.payment] as const,
        ),
      ),
    ).values(),
  ]
    .sort((left, right) => right.paidAt.getTime() - left.paidAt.getTime())
    .slice(0, 20)
    .map((payment) => ({
      amountUzs: payment.amountUzs.toString(),
      id: payment.id,
      paidAt: payment.paidAt,
    }));
  return {
    displayName: membership.student.displayName,
    email: membership.student.email,
    endedAt: membership.endedAt,
    membershipId: membership.id,
    outstandingBalanceUzs: outstandingBalanceUzs.toString(),
    paidAmountUzs: paidAmountUzs.toString(),
    phone: membership.student.phone,
    recentPayments,
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

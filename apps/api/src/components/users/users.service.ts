import {
  MediaMalwareStatus,
  MediaObjectStatus,
  MediaType,
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
import type { AdminSetUserRoleInput } from '../../schemas/users/admin-user.input';
import type { AdminProvisionUserInput } from '../../schemas/users/admin-user.input';
import type { AdminUserObject } from '../../schemas/users/admin-user.object';
import type { AdminUserConnectionObject } from '../../schemas/users/user-connection.object';
import type { UpdateMyProfileInput } from '../../schemas/users/user-profile.input';
import type { UserProfileObject } from '../../schemas/users/user-profile.object';
import type { ViewerObject } from '../../schemas/users/viewer.object';
import { CredentialPasswordService } from '../auth/credential-password.service';

const PROFILE_SELECT = {
  avatarMediaObjectId: true,
  branchName: true,
  displayName: true,
  email: true,
  id: true,
  phone: true,
  preferredLanguage: true,
  role: true,
  status: true,
  teacherSubject: true,
} as const;

const ADMIN_USER_SELECT = {
  ...PROFILE_SELECT,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly passwordService: CredentialPasswordService,
  ) {}

  async provisionUser(
    adminId: string,
    input: AdminProvisionUserInput,
    correlationId?: string,
  ): Promise<AdminUserObject> {
    if (input.role !== UserRole.STUDENT && input.role !== UserRole.TEACHER) {
      throw new ApplicationError(
        ErrorCode.BAD_USER_INPUT,
        'Only Student and Teacher accounts can be provisioned here',
        400,
      );
    }

    const displayName = parseRequiredText(
      input.displayName,
      'displayName',
      160,
    );
    const email = parseProvisioningEmail(input.email);
    const password = parseProvisioningPassword(input.password);
    const credentialPasswordHash =
      await this.passwordService.hashPassword(password);

    return this.database.$transaction(async (transaction) => {
      const existing = await transaction.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (existing !== null) {
        throw new ApplicationError(
          ErrorCode.CONFLICT,
          'A user with this email already exists',
          409,
        );
      }

      const user = await transaction.user.create({
        data: {
          credentialPasswordHash,
          displayName,
          email,
          role: input.role,
        },
        select: ADMIN_USER_SELECT,
      });

      await transaction.auditLog.create({
        data: {
          action: 'ADMIN_USER_PROVISIONED',
          actorId: adminId,
          correlationId: correlationId ?? null,
          newValues: { email, role: input.role },
          targetId: user.id,
          targetType: 'USER',
        },
      });

      return user;
    });
  }

  async getViewer(userId: string): Promise<ViewerObject> {
    const user = await this.database.user.findFirst({
      where: { id: userId, status: UserStatus.ACTIVE },
      select: { displayName: true, id: true, role: true },
    });

    if (user === null) {
      throw inactiveAuthenticatedUserError();
    }

    return user;
  }

  async getMyProfile(userId: string): Promise<UserProfileObject> {
    const user = await this.database.user.findFirst({
      where: { id: userId, status: UserStatus.ACTIVE },
      select: PROFILE_SELECT,
    });

    if (user === null) {
      throw inactiveAuthenticatedUserError();
    }

    return user;
  }

  async updateMyProfile(
    userId: string,
    input: UpdateMyProfileInput,
    correlationId?: string,
  ): Promise<UserProfileObject> {
    const displayName = parseRequiredText(
      input.displayName,
      'displayName',
      160,
    );
    const phone = parseOptionalText(input.phone, 'phone', 32, 7);
    const teacherSubject = parseOptionalText(
      input.teacherSubject,
      'teacherSubject',
      160,
    );
    const branchName = parseOptionalText(input.branchName, 'branchName', 160);
    const avatarMediaObjectId =
      input.avatarMediaObjectId === undefined ||
      input.avatarMediaObjectId === null
        ? null
        : parseUuid(input.avatarMediaObjectId, 'avatarMediaObjectId');

    return this.database.$transaction(async (transaction) => {
      const current = await transaction.user.findFirst({
        where: { id: userId, status: UserStatus.ACTIVE },
        select: PROFILE_SELECT,
      });

      if (current === null) {
        throw inactiveAuthenticatedUserError();
      }

      if (
        current.role !== UserRole.TEACHER &&
        (teacherSubject !== null || branchName !== null)
      ) {
        throw new ApplicationError(
          ErrorCode.BAD_USER_INPUT,
          'Teacher profile fields are available only to Teachers',
          400,
        );
      }

      if (avatarMediaObjectId !== null) {
        const avatar = await transaction.mediaObject.findFirst({
          where: {
            createdById: userId,
            id: avatarMediaObjectId,
            malwareStatus: MediaMalwareStatus.CLEAN,
            mediaType: MediaType.IMAGE,
            status: MediaObjectStatus.READY,
          },
          select: { id: true },
        });

        if (avatar === null) {
          throw new ApplicationError(
            ErrorCode.NOT_FOUND,
            'Profile image was not found',
            404,
          );
        }
      }

      const profile = await transaction.user.update({
        where: { id: userId },
        data: {
          avatarMediaObjectId,
          ...(current.role === UserRole.TEACHER ? { branchName } : {}),
          displayName,
          phone,
          preferredLanguage: input.preferredLanguage,
          ...(current.role === UserRole.TEACHER ? { teacherSubject } : {}),
        },
        select: PROFILE_SELECT,
      });

      await transaction.auditLog.create({
        data: {
          action: 'USER_PROFILE_UPDATED',
          actorId: userId,
          correlationId: correlationId ?? null,
          newValues: profileAuditValues(profile),
          oldValues: profileAuditValues(current),
          targetId: userId,
          targetType: 'USER',
        },
      });

      return profile;
    });
  }

  async getAdminUsers(
    first: number | undefined,
    after: string | undefined,
    role: UserRole | undefined,
    status: UserStatus | undefined,
    search: string | undefined,
  ): Promise<AdminUserConnectionObject> {
    const pageSize = parsePageSize(first);
    const cursor = decodeCursor(after);
    const normalizedSearch = parseOptionalSearch(search);
    const where: Prisma.UserWhereInput = {
      ...(role === undefined ? {} : { role }),
      ...(status === undefined ? {} : { status }),
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
              { email: { contains: normalizedSearch, mode: 'insensitive' } },
              { phone: { contains: normalizedSearch, mode: 'insensitive' } },
            ],
          }),
    };
    const users = await this.database.user.findMany({
      where,
      orderBy: { id: 'asc' },
      take: pageSize + 1,
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
      select: ADMIN_USER_SELECT,
    });
    const hasNextPage = users.length > pageSize;
    const page = hasNextPage ? users.slice(0, pageSize) : users;

    return {
      edges: page.map((user) => ({
        cursor: encodeCursor(user.id),
        node: user,
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

  async getAdminUser(userId: string): Promise<AdminUserObject> {
    const id = parseUuid(userId, 'userId');
    const user = await this.database.user.findUnique({
      where: { id },
      select: ADMIN_USER_SELECT,
    });

    if (user === null) {
      throw inaccessibleUserError();
    }

    return user;
  }

  async setAdminUserStatus(
    adminId: string,
    userId: string,
    status: UserStatus,
    reasonInput: string,
    correlationId?: string,
  ): Promise<AdminUserObject> {
    const id = parseUuid(userId, 'userId');
    const reason = parseReason(reasonInput);
    rejectSelfAdministration(adminId, id);

    if (status === UserStatus.DELETED) {
      throw new ApplicationError(
        ErrorCode.BAD_USER_INPUT,
        'Use the scoped student deletion workflow',
        400,
      );
    }

    return this.database.$transaction(async (transaction) => {
      const current = await transaction.user.findUnique({
        where: { id },
        select: ADMIN_USER_SELECT,
      });

      if (current === null) {
        throw inaccessibleUserError();
      }

      if (current.status === UserStatus.DELETED) {
        throw inaccessibleUserError();
      }

      if (current.status === status) {
        return current;
      }

      const user = await transaction.user.update({
        where: { id },
        data: { status },
        select: ADMIN_USER_SELECT,
      });
      await transaction.auditLog.create({
        data: {
          action: 'ADMIN_USER_STATUS_CHANGED',
          actorId: adminId,
          correlationId: correlationId ?? null,
          newValues: { status },
          oldValues: { status: current.status },
          reason,
          targetId: id,
          targetType: 'USER',
        },
      });

      return user;
    });
  }

  async setAdminUserRole(
    adminId: string,
    input: AdminSetUserRoleInput,
    correlationId?: string,
  ): Promise<AdminUserObject> {
    const id = parseUuid(input.userId, 'userId');
    const reason = parseReason(input.reason);
    rejectSelfAdministration(adminId, id);

    return this.database.$transaction(async (transaction) => {
      const current = await transaction.user.findUnique({
        where: { id },
        select: ADMIN_USER_SELECT,
      });

      if (current === null) {
        throw inaccessibleUserError();
      }

      if (current.role === input.role) {
        return current;
      }

      await ensureRoleHistoryAllowsTransition(transaction, id, current.role);
      const user = await transaction.user.update({
        where: { id },
        data: {
          branchName:
            input.role === UserRole.TEACHER ? current.branchName : null,
          role: input.role,
          teacherSubject:
            input.role === UserRole.TEACHER ? current.teacherSubject : null,
        },
        select: ADMIN_USER_SELECT,
      });
      await transaction.auditLog.create({
        data: {
          action: 'ADMIN_USER_ROLE_CHANGED',
          actorId: adminId,
          correlationId: correlationId ?? null,
          newValues: { role: input.role },
          oldValues: { role: current.role },
          reason,
          targetId: id,
          targetType: 'USER',
        },
      });

      return user;
    });
  }
}

type TransactionClient = Prisma.TransactionClient;

async function ensureRoleHistoryAllowsTransition(
  transaction: TransactionClient,
  userId: string,
  currentRole: UserRole,
): Promise<void> {
  const hasRoleHistory =
    currentRole === UserRole.STUDENT
      ? (await transaction.groupMembership.count({
          where: { studentId: userId },
        })) > 0 ||
        (await transaction.attempt.count({ where: { studentId: userId } })) > 0
      : currentRole === UserRole.TEACHER
        ? (await transaction.group.count({ where: { teacherId: userId } })) >
            0 ||
          (await transaction.libraryItem.count({
            where: { ownerTeacherId: userId },
          })) > 0
        : false;

  if (hasRoleHistory) {
    throw new ApplicationError(
      ErrorCode.CONFLICT,
      'The user role cannot change after role-owned history exists',
      409,
    );
  }
}

function profileAuditValues(
  profile: UserProfileObject,
): Prisma.InputJsonObject {
  return {
    avatarMediaObjectId: profile.avatarMediaObjectId ?? null,
    branchName: profile.branchName ?? null,
    displayName: profile.displayName,
    phone: profile.phone ?? null,
    preferredLanguage: profile.preferredLanguage,
    teacherSubject: profile.teacherSubject ?? null,
  };
}

function parseRequiredText(
  value: string,
  fieldName: string,
  max: number,
): string {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > max) {
    throw new ApplicationError(
      ErrorCode.BAD_USER_INPUT,
      `${fieldName} must contain between 1 and ${String(max)} characters`,
      400,
    );
  }
  return normalized;
}

function parseOptionalText(
  value: string | null | undefined,
  fieldName: string,
  max: number,
  min = 1,
): string | null {
  if (value === undefined || value === null || value.trim().length === 0) {
    return null;
  }
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new ApplicationError(
      ErrorCode.BAD_USER_INPUT,
      `${fieldName} must contain between ${String(min)} and ${String(max)} characters`,
      400,
    );
  }
  return normalized;
}

function parseOptionalSearch(search: string | undefined): string | undefined {
  if (search === undefined) {
    return undefined;
  }
  const normalized = search.trim();
  if (normalized.length < 2 || normalized.length > 160) {
    throw new ApplicationError(
      ErrorCode.BAD_USER_INPUT,
      'search must contain between 2 and 160 characters',
      400,
    );
  }
  return normalized;
}

function parseProvisioningEmail(value: string): string {
  const email = value.trim().toLowerCase();

  if (
    email.length < 3 ||
    email.length > 320 ||
    !/^[^\s@]+@[^\s@]+$/.test(email)
  ) {
    throw new ApplicationError(
      ErrorCode.BAD_USER_INPUT,
      'email must be a valid email address',
      400,
    );
  }

  return email;
}

function parseProvisioningPassword(value: string): string {
  if (value.length < 12 || value.length > 128) {
    throw new ApplicationError(
      ErrorCode.BAD_USER_INPUT,
      'password must contain between 12 and 128 characters',
      400,
    );
  }

  return value;
}

function parseReason(reason: string): string {
  const normalized = reason.trim();
  if (normalized.length < 10 || normalized.length > 1000) {
    throw new ApplicationError(
      ErrorCode.BAD_USER_INPUT,
      'reason must contain between 10 and 1000 characters',
      400,
    );
  }
  return normalized;
}

function rejectSelfAdministration(adminId: string, targetUserId: string): void {
  if (adminId === targetUserId) {
    throw new ApplicationError(
      ErrorCode.CONFLICT,
      'Administrators cannot change their own role or status',
      409,
    );
  }
}

function inactiveAuthenticatedUserError(): ApplicationError {
  return new ApplicationError(
    ErrorCode.UNAUTHENTICATED,
    'The authenticated user is no longer active',
    401,
  );
}

function inaccessibleUserError(): ApplicationError {
  return new ApplicationError(ErrorCode.NOT_FOUND, 'User was not found', 404);
}

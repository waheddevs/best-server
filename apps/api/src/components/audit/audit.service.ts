import {
  ContentStatus,
  IntakeStatus,
  MediaMalwareStatus,
  MediaObjectStatus,
  Prisma,
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
import type {
  AdminAuditLogConnectionObject,
  AdminLibraryItemConnectionObject,
  AdminLibraryItemObject,
  AdminMediaObjectConnectionObject,
  AdminMediaObjectObject,
  AdminOperationalOverviewObject,
} from '../../schemas/audit/admin-operations.object';
@Injectable()
export class AuditService {
  constructor(private readonly db: DatabaseService) {}
  async overview(): Promise<AdminOperationalOverviewObject> {
    const [
      activeUsers,
      activeGroups,
      contacts,
      exams,
      events,
      pendingMedia,
      unreadNotifications,
    ] = await Promise.all([
      this.db.user.count({ where: { status: UserStatus.ACTIVE } }),
      this.db.group.count({ where: { status: ContentStatus.ACTIVE } }),
      this.db.contactRequest.count({ where: { status: IntakeStatus.NEW } }),
      this.db.examRegistration.count({ where: { status: IntakeStatus.NEW } }),
      this.db.eventRegistration.count({ where: { status: IntakeStatus.NEW } }),
      this.db.mediaObject.count({
        where: {
          OR: [
            { status: MediaObjectStatus.VERIFYING },
            { malwareStatus: MediaMalwareStatus.PENDING },
          ],
        },
      }),
      this.db.notification.count({ where: { readAt: null } }),
    ]);
    return {
      activeGroups,
      activeUsers,
      pendingIntakes: contacts + exams + events,
      pendingMedia,
      unreadNotifications,
    };
  }
  async library(
    first?: number,
    after?: string,
    status?: ContentStatus,
    ownerIdInput?: string,
    search?: string,
  ): Promise<AdminLibraryItemConnectionObject> {
    const size = parsePageSize(first);
    const afterId = decodeCursor(after);
    const ownerId =
      ownerIdInput === undefined
        ? undefined
        : parseUuid(ownerIdInput, 'ownerId');
    const term = search?.trim();
    const rows = await this.db.libraryItem.findMany({
      where: {
        ...(status === undefined ? {} : { status }),
        ...(ownerId === undefined ? {} : { ownerTeacherId: ownerId }),
        ...(afterId === undefined ? {} : { id: { gt: afterId } }),
        ...(term === undefined || term.length === 0
          ? {}
          : {
              translations: {
                some: { title: { contains: term, mode: 'insensitive' } },
              },
            }),
      },
      include: {
        owner: { select: { displayName: true } },
        translations: { orderBy: { language: 'asc' }, take: 1 },
      },
      orderBy: { id: 'asc' },
      take: size + 1,
    });
    const mapped = rows.map((row) => ({
      archivedAt: row.archivedAt,
      id: row.id,
      ownerId: row.ownerTeacherId,
      ownerName: row.owner.displayName,
      status: row.status,
      title: row.translations[0]?.title ?? '',
      updatedAt: row.updatedAt,
    }));
    return connection(mapped, size);
  }
  async media(
    first?: number,
    after?: string,
    status?: MediaObjectStatus,
    malwareStatus?: MediaMalwareStatus,
    ownerIdInput?: string,
  ): Promise<AdminMediaObjectConnectionObject> {
    const size = parsePageSize(first);
    const afterId = decodeCursor(after);
    const ownerId =
      ownerIdInput === undefined
        ? undefined
        : parseUuid(ownerIdInput, 'ownerId');
    const rows = await this.db.mediaObject.findMany({
      where: {
        ...(status === undefined ? {} : { status }),
        ...(malwareStatus === undefined ? {} : { malwareStatus }),
        ...(ownerId === undefined ? {} : { createdById: ownerId }),
        ...(afterId === undefined ? {} : { id: { gt: afterId } }),
      },
      select: {
        createdAt: true,
        createdById: true,
        id: true,
        malwareStatus: true,
        mimeType: true,
        originalName: true,
        rejectionCode: true,
        status: true,
      },
      orderBy: { id: 'asc' },
      take: size + 1,
    });
    const mapped = rows.map((row) => ({
      createdAt: row.createdAt,
      id: row.id,
      malwareStatus: row.malwareStatus,
      mimeType: row.mimeType,
      originalName: row.originalName,
      ownerId: row.createdById,
      rejectionCode: row.rejectionCode,
      status: row.status,
    }));
    return mediaConnection(mapped, size);
  }
  async logs(
    first?: number,
    after?: string,
    actorIdInput?: string,
    action?: string,
    targetType?: string,
    from?: Date,
    to?: Date,
  ): Promise<AdminAuditLogConnectionObject> {
    const size = parsePageSize(first);
    const afterId = decodeCursor(after);
    const actorId =
      actorIdInput === undefined
        ? undefined
        : parseUuid(actorIdInput, 'actorId');
    if (from !== undefined && to !== undefined && to <= from)
      throw bad('The audit date range is invalid');
    const rows = await this.db.auditLog.findMany({
      where: {
        ...(actorId === undefined ? {} : { actorId }),
        ...(action === undefined
          ? {}
          : { action: { equals: bounded(action, 120), mode: 'insensitive' } }),
        ...(targetType === undefined
          ? {}
          : { targetType: bounded(targetType, 120) }),
        ...(from === undefined && to === undefined
          ? {}
          : {
              createdAt: {
                ...(from === undefined ? {} : { gte: from }),
                ...(to === undefined ? {} : { lt: to }),
              },
            }),
        ...(afterId === undefined ? {} : { id: { gt: afterId } }),
      },
      select: {
        action: true,
        actorId: true,
        correlationId: true,
        createdAt: true,
        id: true,
        reason: true,
        targetId: true,
        targetType: true,
      },
      orderBy: { id: 'asc' },
      take: size + 1,
    });
    return auditConnection(rows, size);
  }
  async archiveLibrary(
    adminId: string,
    idInput: string,
    archived: boolean,
    reasonInput: string,
    correlationId?: string,
  ): Promise<AdminLibraryItemObject> {
    const id = parseUuid(idInput, 'libraryItemId');
    const reason = bounded(reasonInput, 2000);
    const existing = await this.db.libraryItem.findUnique({
      where: { id },
      include: {
        owner: { select: { displayName: true } },
        translations: { orderBy: { language: 'asc' }, take: 1 },
      },
    });
    if (existing === null) throw notFound();
    return this.db.$transaction(async (tx) => {
      const row = await tx.libraryItem.update({
        where: { id },
        data: {
          archivedAt: archived ? new Date() : null,
          status: archived ? ContentStatus.ARCHIVED : ContentStatus.ACTIVE,
        },
        include: {
          owner: { select: { displayName: true } },
          translations: { orderBy: { language: 'asc' }, take: 1 },
        },
      });
      await tx.auditLog.create({
        data: {
          action: archived
            ? 'ADMIN_LIBRARY_ITEM_ARCHIVED'
            : 'ADMIN_LIBRARY_ITEM_RESTORED',
          actorId: adminId,
          correlationId: correlationId ?? null,
          reason,
          targetId: id,
          targetType: 'LIBRARY_ITEM',
        },
      });
      return {
        archivedAt: row.archivedAt,
        id: row.id,
        ownerId: row.ownerTeacherId,
        ownerName: row.owner.displayName,
        status: row.status,
        title: row.translations[0]?.title ?? '',
        updatedAt: row.updatedAt,
      };
    });
  }
  async rejectMedia(
    adminId: string,
    idInput: string,
    reasonInput: string,
    correlationId?: string,
  ): Promise<AdminMediaObjectObject> {
    const id = parseUuid(idInput, 'mediaObjectId');
    const reason = bounded(reasonInput, 240);
    const existing = await this.db.mediaObject.findUnique({ where: { id } });
    if (existing === null) throw notFound();
    if (
      existing.status === MediaObjectStatus.READY &&
      existing.malwareStatus === MediaMalwareStatus.CLEAN
    )
      throw new ApplicationError(
        ErrorCode.CONFLICT,
        'A clean ready object cannot be rejected without a separate revocation workflow',
        409,
      );
    return this.db.$transaction(async (tx) => {
      const row = await tx.mediaObject.update({
        where: { id },
        data: {
          rejectedAt: new Date(),
          rejectionCode: 'ADMIN_REJECTED',
          status: MediaObjectStatus.REJECTED,
        },
        select: {
          createdAt: true,
          createdById: true,
          id: true,
          malwareStatus: true,
          mimeType: true,
          originalName: true,
          rejectionCode: true,
          status: true,
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'ADMIN_MEDIA_OBJECT_REJECTED',
          actorId: adminId,
          correlationId: correlationId ?? null,
          reason,
          targetId: id,
          targetType: 'MEDIA_OBJECT',
        },
      });
      return {
        createdAt: row.createdAt,
        id: row.id,
        malwareStatus: row.malwareStatus,
        mimeType: row.mimeType,
        originalName: row.originalName,
        ownerId: row.createdById,
        rejectionCode: row.rejectionCode,
        status: row.status,
      };
    });
  }
}
function connection(
  rows: AdminLibraryItemObject[],
  size: number,
): AdminLibraryItemConnectionObject {
  const hasNextPage = rows.length > size;
  const page = hasNextPage ? rows.slice(0, size) : rows;
  const edges = page.map((node) => ({ cursor: encodeCursor(node.id), node }));
  return {
    edges,
    pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
  };
}
function mediaConnection(
  rows: AdminMediaObjectObject[],
  size: number,
): AdminMediaObjectConnectionObject {
  const hasNextPage = rows.length > size;
  const page = hasNextPage ? rows.slice(0, size) : rows;
  const edges = page.map((node) => ({ cursor: encodeCursor(node.id), node }));
  return {
    edges,
    pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
  };
}
function auditConnection(
  rows: Prisma.AuditLogGetPayload<{
    select: {
      action: true;
      actorId: true;
      correlationId: true;
      createdAt: true;
      id: true;
      reason: true;
      targetId: true;
      targetType: true;
    };
  }>[],
  size: number,
): AdminAuditLogConnectionObject {
  const hasNextPage = rows.length > size;
  const page = hasNextPage ? rows.slice(0, size) : rows;
  const edges = page.map((node) => ({ cursor: encodeCursor(node.id), node }));
  return {
    edges,
    pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
  };
}
function bounded(value: string, max: number) {
  const text = value.trim();
  if (text.length === 0 || text.length > max)
    throw bad('Required text is invalid');
  return text;
}
function bad(message: string) {
  return new ApplicationError(ErrorCode.BAD_USER_INPUT, message, 400);
}
function notFound() {
  return new ApplicationError(
    ErrorCode.NOT_FOUND,
    'The requested operational resource was not found',
    404,
  );
}

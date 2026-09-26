import {
  ContentStatus,
  Language,
  MediaMalwareStatus,
  MediaObjectStatus,
  Prisma,
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
import type { CreateLessonMaterialInput } from '../../schemas/materials/lesson-material.input';
import type {
  LessonMaterialConnectionObject,
  LessonMaterialObject,
} from '../../schemas/materials/lesson-material.object';

const materialInclude = {
  libraryItem: {
    include: {
      attachments: {
        include: { mediaObject: true },
        orderBy: { position: 'asc' },
      },
      translations: { orderBy: { language: 'asc' } },
    },
  },
} satisfies Prisma.LessonMaterialInclude;

type MaterialRecord = Prisma.LessonMaterialGetPayload<{
  include: typeof materialInclude;
}>;

@Injectable()
export class MaterialsService {
  constructor(private readonly db: DatabaseService) {}
  async list(
    teacherId: string,
    groupIdInput: string,
    language: Language,
    first?: number,
    after?: string,
  ): Promise<LessonMaterialConnectionObject> {
    const groupId = parseUuid(groupIdInput, 'groupId');
    await this.requireGroup(teacherId, groupId);
    const size = parsePageSize(first);
    const afterId = decodeCursor(after);
    const rows = await this.db.lessonMaterial.findMany({
      where: {
        archivedAt: null,
        groupId,
        OR: [{ lessonId: null }, { lesson: { archivedAt: null } }],
        libraryItem: {
          attachments: {
            some: {
              mediaObject: {
                malwareStatus: MediaMalwareStatus.CLEAN,
                status: MediaObjectStatus.READY,
              },
            },
          },
          status: ContentStatus.ACTIVE,
          translations: { some: {} },
        },
      },
      ...(afterId === undefined ? {} : { cursor: { id: afterId }, skip: 1 }),
      include: materialInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: size + 1,
    });
    const hasNextPage = rows.length > size;
    const page = hasNextPage ? rows.slice(0, size) : rows;
    const edges = page.map((row) => ({
      cursor: encodeCursor(row.id),
      node: mapMaterial(row, language),
    }));
    return {
      edges,
      pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
    };
  }
  async create(
    teacherId: string,
    input: CreateLessonMaterialInput,
    correlationId?: string,
  ): Promise<LessonMaterialObject> {
    return this.write(teacherId, undefined, input, correlationId);
  }
  async update(
    teacherId: string,
    materialIdInput: string,
    input: CreateLessonMaterialInput,
    correlationId?: string,
  ): Promise<LessonMaterialObject> {
    return this.write(
      teacherId,
      parseUuid(materialIdInput, 'materialId'),
      input,
      correlationId,
    );
  }
  async setArchived(
    teacherId: string,
    materialIdInput: string,
    archived: boolean,
    correlationId?: string,
  ): Promise<LessonMaterialObject> {
    const id = parseUuid(materialIdInput, 'materialId');
    const existing = await this.db.lessonMaterial.findFirst({
      where: { id, group: { teacherId } },
      include: materialInclude,
    });
    if (existing === null) throw notFound();
    if ((existing.archivedAt !== null) === archived)
      return mapMaterial(existing, Language.EN);
    return this.db.$transaction(async (tx) => {
      const row = await tx.lessonMaterial.update({
        where: { id },
        data: { archivedAt: archived ? new Date() : null },
        include: materialInclude,
      });
      await audit(
        tx,
        teacherId,
        archived ? 'LESSON_MATERIAL_ARCHIVED' : 'LESSON_MATERIAL_RESTORED',
        id,
        correlationId,
      );
      return mapMaterial(row, Language.EN);
    });
  }
  private async write(
    teacherId: string,
    id: string | undefined,
    input: CreateLessonMaterialInput,
    correlationId?: string,
  ): Promise<LessonMaterialObject> {
    const groupId = parseUuid(input.groupId, 'groupId');
    const libraryItemId = parseUuid(input.libraryItemId, 'libraryItemId');
    const lessonId =
      input.lessonId === undefined
        ? null
        : parseUuid(input.lessonId, 'lessonId');
    if (
      !Number.isInteger(input.position) ||
      input.position < 1 ||
      input.position > 1000
    )
      throw bad('position must be between 1 and 1000');
    await this.requireGroup(teacherId, groupId);
    const item = await this.db.libraryItem.findFirst({
      where: {
        id: libraryItemId,
        ownerTeacherId: teacherId,
        status: ContentStatus.ACTIVE,
        OR: [
          { visibility: 'ALL_GROUPS' },
          { groupAccesses: { some: { groupId } } },
        ],
      },
      select: { id: true },
    });
    const lesson =
      lessonId === null
        ? { id: null }
        : await this.db.lesson.findFirst({
            where: {
              archivedAt: null,
              id: lessonId,
              groupId,
              group: { teacherId },
            },
            select: { id: true },
          });
    if (item === null || lesson === null) throw notFound();
    return this.db.$transaction(async (tx) => {
      const row =
        id === undefined
          ? await tx.lessonMaterial.create({
              data: {
                createdById: teacherId,
                groupId,
                kind: input.kind,
                lessonId,
                libraryItemId,
                position: input.position,
              },
              include: materialInclude,
            })
          : await tx.lessonMaterial.update({
              where: { id, group: { teacherId } },
              data: {
                groupId,
                kind: input.kind,
                lessonId,
                libraryItemId,
                position: input.position,
              },
              include: materialInclude,
            });
      await audit(
        tx,
        teacherId,
        id === undefined
          ? 'LESSON_MATERIAL_CREATED'
          : 'LESSON_MATERIAL_UPDATED',
        row.id,
        correlationId,
      );
      return mapMaterial(row, Language.EN);
    });
  }
  private async requireGroup(
    teacherId: string,
    groupId: string,
  ): Promise<void> {
    if (
      (await this.db.group.count({
        where: { id: groupId, status: ContentStatus.ACTIVE, teacherId },
      })) !== 1
    )
      throw notFound();
  }
}

function mapMaterial(
  row: MaterialRecord,
  language: Language,
): LessonMaterialObject {
  const translation =
    row.libraryItem.translations.find((item) => item.language === language) ??
    row.libraryItem.translations[0];
  const attachment = row.libraryItem.attachments[0];
  if (translation === undefined || attachment === undefined) throw notFound();
  const media = attachment.mediaObject;
  return {
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    description: translation.description,
    groupId: row.groupId,
    id: row.id,
    kind: row.kind,
    lessonId: row.lessonId,
    libraryItemId: row.libraryItemId,
    mediaObject: {
      checksumSha256: media.checksumSha256,
      id: media.id,
      malwareScannedAt: media.malwareScannedAt,
      malwareStatus: media.malwareStatus,
      mediaType: media.mediaType,
      mimeType: media.mimeType,
      originalName: media.originalName,
      sizeBytes: media.sizeBytes === null ? null : Number(media.sizeBytes),
      status: media.status,
      verifiedAt: media.verifiedAt,
    },
    position: row.position,
    title: translation.title,
    updatedAt: row.updatedAt,
  };
}

async function audit(
  tx: Prisma.TransactionClient,
  actorId: string,
  action: string,
  targetId: string,
  correlationId?: string,
) {
  await tx.auditLog.create({
    data: {
      action,
      actorId,
      correlationId: correlationId ?? null,
      targetId,
      targetType: 'LESSON_MATERIAL',
    },
  });
}
function bad(message: string) {
  return new ApplicationError(ErrorCode.BAD_USER_INPUT, message, 400);
}
function notFound() {
  return new ApplicationError(
    ErrorCode.NOT_FOUND,
    'The requested lesson material was not found',
    404,
  );
}

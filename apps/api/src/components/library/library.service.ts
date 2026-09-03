import {
  ContentStatus,
  Language,
  LibraryVisibility,
  MediaMalwareStatus,
  MediaObjectStatus,
  MediaVisibility,
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
import type { MediaDownloadIntentObject } from '../../schemas/assets/media-download-intent.object';
import type {
  StudentLibraryItemConnectionObject,
  TeacherLibraryItemConnectionObject,
} from '../../schemas/library/library-connection.object';
import type {
  CreateLibraryCategoryInput,
  UpdateLibraryCategoryInput,
} from '../../schemas/library/library-category.input';
import type { LibraryCategoryObject } from '../../schemas/library/library-category.object';
import type {
  CreateLibraryDownloadIntentInput,
  CreateLibraryItemInput,
  UpdateLibraryItemInput,
} from '../../schemas/library/library-item.input';
import type {
  StudentLibraryItemObject,
  TeacherLibraryItemObject,
} from '../../schemas/library/library-item.object';
import type { LibraryTranslationInput } from '../../schemas/library/library-translation.input';
import { AssetsStorageGateway } from '../assets/assets-storage.gateway';

const MAXIMUM_ATTACHMENTS = 10;
const MAXIMUM_DESCRIPTION_LENGTH = 10_000;

const libraryItemInclude = {
  attachments: {
    include: { mediaObject: true },
    orderBy: { position: 'asc' },
  },
  category: true,
  groupAccesses: { orderBy: { groupId: 'asc' } },
  translations: { orderBy: { language: 'asc' } },
} satisfies Prisma.LibraryItemInclude;

type LibraryItemRecord = Prisma.LibraryItemGetPayload<{
  include: typeof libraryItemInclude;
}>;

@Injectable()
export class LibraryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: AssetsStorageGateway,
  ) {}

  async getTeacherCategories(
    teacherId: string,
    includeArchived: boolean,
  ): Promise<LibraryCategoryObject[]> {
    const categories = await this.database.libraryCategory.findMany({
      where: {
        teacherId,
        ...(includeArchived ? {} : { status: ContentStatus.ACTIVE }),
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    return categories.map(mapCategory);
  }

  async createCategory(
    teacherId: string,
    input: CreateLibraryCategoryInput,
  ): Promise<LibraryCategoryObject> {
    const name = parseRequiredText(input.name, 'name', 120);

    try {
      return mapCategory(
        await this.database.libraryCategory.create({
          data: { name, teacherId },
        }),
      );
    } catch (error: unknown) {
      throw mapUniqueCategoryError(error);
    }
  }

  async updateCategory(
    teacherId: string,
    input: UpdateLibraryCategoryInput,
  ): Promise<LibraryCategoryObject> {
    const categoryId = parseUuid(input.categoryId, 'categoryId');
    const name = parseRequiredText(input.name, 'name', 120);

    try {
      const update = await this.database.libraryCategory.updateMany({
        where: { id: categoryId, teacherId },
        data: { name },
      });

      if (update.count === 0) {
        throw libraryNotFoundError('category');
      }

      return mapCategory(
        await this.database.libraryCategory.findUniqueOrThrow({
          where: { id: categoryId },
        }),
      );
    } catch (error: unknown) {
      if (error instanceof ApplicationError) {
        throw error;
      }

      throw mapUniqueCategoryError(error);
    }
  }

  async setCategoryArchived(
    teacherId: string,
    categoryIdInput: string,
    archived: boolean,
  ): Promise<LibraryCategoryObject> {
    const categoryId = parseUuid(categoryIdInput, 'categoryId');
    const category = await this.database.libraryCategory.findFirst({
      where: { id: categoryId, teacherId },
    });

    if (category === null) {
      throw libraryNotFoundError('category');
    }

    if (archived) {
      const activeItems = await this.database.libraryItem.count({
        where: { categoryId, status: ContentStatus.ACTIVE },
      });

      if (activeItems > 0) {
        throw new ApplicationError(
          ErrorCode.CONFLICT,
          'Archive the active items in this category first',
          409,
        );
      }
    }

    return mapCategory(
      await this.database.libraryCategory.update({
        where: { id: categoryId },
        data: {
          status: archived ? ContentStatus.ARCHIVED : ContentStatus.ACTIVE,
        },
      }),
    );
  }

  async getTeacherItems(
    teacherId: string,
    categoryIdInput: string | undefined,
    includeArchived: boolean,
    first: number | undefined,
    after: string | undefined,
  ): Promise<TeacherLibraryItemConnectionObject> {
    const pageSize = parsePageSize(first);
    const afterId = decodeCursor(after);
    const categoryId =
      categoryIdInput === undefined
        ? undefined
        : parseUuid(categoryIdInput, 'categoryId');
    const items = await this.database.libraryItem.findMany({
      where: {
        ownerTeacherId: teacherId,
        ...(categoryId === undefined ? {} : { categoryId }),
        ...(includeArchived ? {} : { status: ContentStatus.ACTIVE }),
        ...(afterId === undefined ? {} : { id: { gt: afterId } }),
      },
      include: libraryItemInclude,
      orderBy: { id: 'asc' },
      take: pageSize + 1,
    });
    const hasNextPage = items.length > pageSize;
    const page = hasNextPage ? items.slice(0, pageSize) : items;
    const edges = page.map((item) => ({
      cursor: encodeCursor(item.id),
      node: mapTeacherItem(item),
    }));

    return {
      edges,
      pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
    };
  }

  async createItem(
    teacherId: string,
    input: CreateLibraryItemInput,
  ): Promise<TeacherLibraryItemObject> {
    const values = await this.validateItemInput(teacherId, input);
    const item = await this.database.$transaction(async (transaction) => {
      const created = await transaction.libraryItem.create({
        data: {
          categoryId: values.categoryId,
          ownerTeacherId: teacherId,
          primaryLanguage: input.primaryLanguage,
          visibility: input.visibility,
        },
      });

      await transaction.libraryTranslation.createMany({
        data: values.translations.map((translation) => ({
          ...translation,
          libraryItemId: created.id,
        })),
      });

      if (values.groupIds.length > 0) {
        await transaction.libraryGroupAccess.createMany({
          data: values.groupIds.map((groupId) => ({
            groupId,
            libraryItemId: created.id,
          })),
        });
      }

      await transaction.libraryAttachment.createMany({
        data: values.mediaObjectIds.map((mediaObjectId, index) => ({
          libraryItemId: created.id,
          mediaObjectId,
          position: index + 1,
        })),
      });

      await transaction.mediaObject.updateMany({
        where: { id: { in: values.mediaObjectIds } },
        data: { visibility: MediaVisibility.DOMAIN_AUTHORIZED },
      });

      return transaction.libraryItem.findUniqueOrThrow({
        where: { id: created.id },
        include: libraryItemInclude,
      });
    });

    return mapTeacherItem(item);
  }

  async updateItem(
    teacherId: string,
    input: UpdateLibraryItemInput,
  ): Promise<TeacherLibraryItemObject> {
    const libraryItemId = parseUuid(input.libraryItemId, 'libraryItemId');
    const existing = await this.database.libraryItem.findFirst({
      where: { id: libraryItemId, ownerTeacherId: teacherId },
      include: { attachments: { select: { mediaObjectId: true } } },
    });

    if (existing === null) {
      throw libraryNotFoundError('item');
    }

    const values = await this.validateItemInput(teacherId, input);
    const removedMediaIds = existing.attachments
      .map(({ mediaObjectId }) => mediaObjectId)
      .filter(
        (mediaObjectId) => !values.mediaObjectIds.includes(mediaObjectId),
      );
    const item = await this.database.$transaction(async (transaction) => {
      await transaction.libraryTranslation.deleteMany({
        where: { libraryItemId },
      });
      await transaction.libraryGroupAccess.deleteMany({
        where: { libraryItemId },
      });
      await transaction.libraryAttachment.deleteMany({
        where: { libraryItemId },
      });

      await transaction.libraryItem.update({
        where: { id: libraryItemId },
        data: {
          categoryId: values.categoryId,
          primaryLanguage: input.primaryLanguage,
          visibility: input.visibility,
        },
      });

      await transaction.libraryTranslation.createMany({
        data: values.translations.map((translation) => ({
          ...translation,
          libraryItemId,
        })),
      });

      if (values.groupIds.length > 0) {
        await transaction.libraryGroupAccess.createMany({
          data: values.groupIds.map((groupId) => ({
            groupId,
            libraryItemId,
          })),
        });
      }

      await transaction.libraryAttachment.createMany({
        data: values.mediaObjectIds.map((mediaObjectId, index) => ({
          libraryItemId,
          mediaObjectId,
          position: index + 1,
        })),
      });

      await transaction.mediaObject.updateMany({
        where: { id: { in: values.mediaObjectIds } },
        data: { visibility: MediaVisibility.DOMAIN_AUTHORIZED },
      });

      if (removedMediaIds.length > 0) {
        await transaction.mediaObject.updateMany({
          where: {
            attachments: { none: {} },
            id: { in: removedMediaIds },
          },
          data: { visibility: MediaVisibility.OWNER_ONLY },
        });
      }

      return transaction.libraryItem.findUniqueOrThrow({
        where: { id: libraryItemId },
        include: libraryItemInclude,
      });
    });

    return mapTeacherItem(item);
  }

  async setItemArchived(
    teacherId: string,
    libraryItemIdInput: string,
    archived: boolean,
  ): Promise<TeacherLibraryItemObject> {
    const libraryItemId = parseUuid(libraryItemIdInput, 'libraryItemId');
    const item = await this.database.libraryItem.findFirst({
      where: { id: libraryItemId, ownerTeacherId: teacherId },
      include: { category: true },
    });

    if (item === null) {
      throw libraryNotFoundError('item');
    }

    if (!archived && item.category.status !== ContentStatus.ACTIVE) {
      throw new ApplicationError(
        ErrorCode.CONFLICT,
        'Restore the item category first',
        409,
      );
    }

    return mapTeacherItem(
      await this.database.libraryItem.update({
        where: { id: libraryItemId },
        data: {
          archivedAt: archived ? new Date() : null,
          status: archived ? ContentStatus.ARCHIVED : ContentStatus.ACTIVE,
        },
        include: libraryItemInclude,
      }),
    );
  }

  async getStudentItems(
    studentId: string,
    language: Language,
    categoryIdInput: string | undefined,
    first: number | undefined,
    after: string | undefined,
  ): Promise<StudentLibraryItemConnectionObject> {
    const pageSize = parsePageSize(first);
    const afterId = decodeCursor(after);
    const categoryId =
      categoryIdInput === undefined
        ? undefined
        : parseUuid(categoryIdInput, 'categoryId');
    const access = await this.getStudentAccess(studentId);

    if (access.groupIds.length === 0) {
      return emptyStudentConnection();
    }

    const items = await this.database.libraryItem.findMany({
      where: {
        ...studentItemWhere(access.groupIds, access.teacherIds),
        ...(categoryId === undefined ? {} : { categoryId }),
        ...(afterId === undefined ? {} : { id: { gt: afterId } }),
        translations: { some: { language } },
      },
      include: libraryItemInclude,
      orderBy: { id: 'asc' },
      take: pageSize + 1,
    });
    const hasNextPage = items.length > pageSize;
    const page = hasNextPage ? items.slice(0, pageSize) : items;
    const edges = page.map((item) => ({
      cursor: encodeCursor(item.id),
      node: mapStudentItem(item, language),
    }));

    return {
      edges,
      pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
    };
  }

  async getStudentItem(
    studentId: string,
    libraryItemIdInput: string,
    language: Language,
  ): Promise<StudentLibraryItemObject> {
    const libraryItemId = parseUuid(libraryItemIdInput, 'libraryItemId');
    const access = await this.getStudentAccess(studentId);
    const item = await this.database.libraryItem.findFirst({
      where: {
        id: libraryItemId,
        ...studentItemWhere(access.groupIds, access.teacherIds),
        translations: { some: { language } },
      },
      include: libraryItemInclude,
    });

    if (item === null) {
      throw libraryNotFoundError('item');
    }

    return mapStudentItem(item, language);
  }

  async createStudentDownloadIntent(
    studentId: string,
    input: CreateLibraryDownloadIntentInput,
  ): Promise<MediaDownloadIntentObject> {
    const libraryItemId = parseUuid(input.libraryItemId, 'libraryItemId');
    const mediaObjectId = parseUuid(input.mediaObjectId, 'mediaObjectId');
    const access = await this.getStudentAccess(studentId);
    const attachment = await this.database.libraryAttachment.findFirst({
      where: {
        libraryItemId,
        mediaObjectId,
        libraryItem: studentItemWhere(access.groupIds, access.teacherIds),
        mediaObject: cleanMediaWhere(),
      },
      select: { mediaObject: { select: { objectKey: true } } },
    });

    if (attachment === null) {
      throw libraryNotFoundError('attachment');
    }

    try {
      return await this.storage.createDownloadIntent(
        attachment.mediaObject.objectKey,
      );
    } catch {
      throw new ApplicationError(
        ErrorCode.SERVICE_UNAVAILABLE,
        'Object storage is temporarily unavailable',
        503,
      );
    }
  }

  private async validateItemInput(
    teacherId: string,
    input: CreateLibraryItemInput,
  ): Promise<ValidatedLibraryItemInput> {
    const categoryId = parseUuid(input.categoryId, 'categoryId');
    const translations = parseTranslations(
      input.translations,
      input.primaryLanguage,
    );
    const groupIds = parseUniqueIds(input.groupIds, 'groupIds');
    const mediaObjectIds = parseUniqueIds(
      input.mediaObjectIds,
      'mediaObjectIds',
    );

    if (
      mediaObjectIds.length < 1 ||
      mediaObjectIds.length > MAXIMUM_ATTACHMENTS
    ) {
      throw badInput(
        `mediaObjectIds must contain between 1 and ${String(MAXIMUM_ATTACHMENTS)} IDs`,
      );
    }

    if (
      input.visibility === LibraryVisibility.ALL_GROUPS &&
      groupIds.length !== 0
    ) {
      throw badInput('ALL_GROUPS items must not contain groupIds');
    }

    if (
      input.visibility === LibraryVisibility.SELECTED_GROUPS &&
      groupIds.length === 0
    ) {
      throw badInput('SELECTED_GROUPS items require at least one groupId');
    }

    const category = await this.database.libraryCategory.findFirst({
      where: { id: categoryId, status: ContentStatus.ACTIVE, teacherId },
      select: { id: true },
    });
    const groups = await this.database.group.findMany({
      where: {
        id: { in: groupIds },
        status: ContentStatus.ACTIVE,
        teacherId,
      },
      select: { id: true },
    });
    const mediaObjects = await this.database.mediaObject.findMany({
      where: {
        createdById: teacherId,
        id: { in: mediaObjectIds },
        ...cleanMediaWhere(),
      },
      select: { id: true },
    });

    if (category === null) {
      throw badInput('categoryId must reference an active owned category');
    }

    if (groups.length !== groupIds.length) {
      throw badInput('Every groupId must reference an active owned group');
    }

    if (mediaObjects.length !== mediaObjectIds.length) {
      throw badInput(
        'Every mediaObjectId must reference an owned READY and CLEAN media object',
      );
    }

    return { categoryId, groupIds, mediaObjectIds, translations };
  }

  private async getStudentAccess(studentId: string): Promise<StudentAccess> {
    const memberships = await this.database.groupMembership.findMany({
      where: { endedAt: null, studentId },
      select: { group: { select: { teacherId: true } }, groupId: true },
    });

    return {
      groupIds: [...new Set(memberships.map(({ groupId }) => groupId))],
      teacherIds: [...new Set(memberships.map(({ group }) => group.teacherId))],
    };
  }
}

interface ValidatedLibraryItemInput {
  readonly categoryId: string;
  readonly groupIds: string[];
  readonly mediaObjectIds: string[];
  readonly translations: ValidatedLibraryTranslation[];
}

interface ValidatedLibraryTranslation {
  readonly description: string | null;
  readonly language: Language;
  readonly title: string;
}

interface StudentAccess {
  readonly groupIds: string[];
  readonly teacherIds: string[];
}

function studentItemWhere(groupIds: string[], teacherIds: string[]) {
  return {
    attachments: { every: { mediaObject: cleanMediaWhere() }, some: {} },
    category: { status: ContentStatus.ACTIVE },
    OR: [
      {
        ownerTeacherId: { in: teacherIds },
        visibility: LibraryVisibility.ALL_GROUPS,
      },
      {
        groupAccesses: { some: { groupId: { in: groupIds } } },
        visibility: LibraryVisibility.SELECTED_GROUPS,
      },
    ],
    status: ContentStatus.ACTIVE,
  };
}

function cleanMediaWhere() {
  return {
    malwareStatus: MediaMalwareStatus.CLEAN,
    status: MediaObjectStatus.READY,
  };
}

function parseTranslations(
  inputs: readonly LibraryTranslationInput[],
  primaryLanguage: Language,
): ValidatedLibraryTranslation[] {
  if (inputs.length < 1 || inputs.length > Object.values(Language).length) {
    throw badInput('translations must contain between 1 and 3 values');
  }

  const languages = new Set<Language>();
  const translations = inputs.map((input) => {
    if (languages.has(input.language)) {
      throw badInput('translations must contain unique languages');
    }

    languages.add(input.language);
    const description = input.description?.trim();

    if (
      description !== undefined &&
      description.length > MAXIMUM_DESCRIPTION_LENGTH
    ) {
      throw badInput(
        `description must not exceed ${String(MAXIMUM_DESCRIPTION_LENGTH)} characters`,
      );
    }

    return {
      description:
        description === undefined || description === '' ? null : description,
      language: input.language,
      title: parseRequiredText(input.title, 'title', 240),
    };
  });

  if (!languages.has(primaryLanguage)) {
    throw badInput('translations must include primaryLanguage');
  }

  return translations;
}

function parseUniqueIds(
  inputs: readonly string[],
  fieldName: string,
): string[] {
  const ids = inputs.map((value) => parseUuid(value, fieldName));

  if (new Set(ids).size !== ids.length) {
    throw badInput(`${fieldName} must contain unique IDs`);
  }

  return ids;
}

function parseRequiredText(
  input: string,
  fieldName: string,
  maximumLength: number,
): string {
  const value = input.trim();

  if (value.length < 1 || value.length > maximumLength) {
    throw badInput(
      `${fieldName} must contain between 1 and ${String(maximumLength)} characters`,
    );
  }

  return value;
}

function mapCategory(category: {
  readonly createdAt: Date;
  readonly id: string;
  readonly name: string;
  readonly status: ContentStatus;
  readonly updatedAt: Date;
}): LibraryCategoryObject {
  return category;
}

function mapTeacherItem(item: LibraryItemRecord): TeacherLibraryItemObject {
  return {
    archivedAt: item.archivedAt,
    attachments: item.attachments.map(({ id, mediaObject, position }) => ({
      id,
      mediaObject: mapMediaObject(mediaObject),
      position,
    })),
    category: mapCategory(item.category),
    createdAt: item.createdAt,
    groupIds: item.groupAccesses.map(({ groupId }) => groupId),
    id: item.id,
    primaryLanguage: item.primaryLanguage,
    status: item.status,
    translations: item.translations,
    updatedAt: item.updatedAt,
    visibility: item.visibility,
  };
}

function mapStudentItem(
  item: LibraryItemRecord,
  language: Language,
): StudentLibraryItemObject {
  const translation = item.translations.find(
    (candidate) => candidate.language === language,
  );

  if (translation === undefined) {
    throw new ApplicationError(
      ErrorCode.TRANSLATION_NOT_AVAILABLE,
      'The requested library translation is not available',
      400,
    );
  }

  return {
    attachments: item.attachments.map(({ id, mediaObject, position }) => ({
      id,
      mediaObject: mapMediaObject(mediaObject),
      position,
    })),
    category: mapCategory(item.category),
    description: translation.description,
    id: item.id,
    language,
    title: translation.title,
    updatedAt: item.updatedAt,
  };
}

function mapMediaObject(
  mediaObject: LibraryItemRecord['attachments'][number]['mediaObject'],
) {
  return {
    checksumSha256: mediaObject.checksumSha256,
    id: mediaObject.id,
    malwareScannedAt: mediaObject.malwareScannedAt,
    malwareStatus: mediaObject.malwareStatus,
    mediaType: mediaObject.mediaType,
    mimeType: mediaObject.mimeType,
    originalName: mediaObject.originalName,
    sizeBytes:
      mediaObject.sizeBytes === null ? null : Number(mediaObject.sizeBytes),
    status: mediaObject.status,
    verifiedAt: mediaObject.verifiedAt,
  };
}

function emptyStudentConnection(): StudentLibraryItemConnectionObject {
  return {
    edges: [],
    pageInfo: { endCursor: null, hasNextPage: false },
  };
}

function mapUniqueCategoryError(error: unknown): ApplicationError {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    return new ApplicationError(
      ErrorCode.CONFLICT,
      'A library category with this name already exists',
      409,
    );
  }

  throw error;
}

function badInput(message: string): ApplicationError {
  return new ApplicationError(ErrorCode.BAD_USER_INPUT, message, 400);
}

function libraryNotFoundError(resource: string): ApplicationError {
  return new ApplicationError(
    ErrorCode.NOT_FOUND,
    `The requested library ${resource} was not found`,
    404,
  );
}

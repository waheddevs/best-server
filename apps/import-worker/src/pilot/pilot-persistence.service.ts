import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  ImportExtractionMethod,
  ImportExtractionStatus,
  ImportRightsStatus,
  MediaObjectSource,
  MediaObjectStatus,
  MediaType,
  MediaVisibility,
  UserRole,
  UserStatus,
  VocabularyDraftStatus,
} from '@best/database';
import { createPrivateObjectKey } from '@best/storage';
import { Injectable } from '@nestjs/common';

import { ImportDatabaseService } from '../database/import-database.service';
import type {
  VocabularyPilotPersistence,
  VocabularyPilotResult,
} from './pilot.type';
import { PilotObjectStorageService } from './pilot-object-storage.service';

const PARSER_VERSION = 1;
const PDF_CONTENT_TYPE = 'application/pdf';

interface PersistVocabularyPilotInput {
  readonly actorId: string;
  readonly mediaPath: string;
  readonly result: VocabularyPilotResult;
}

@Injectable()
export class PilotPersistenceService {
  constructor(
    private readonly database: ImportDatabaseService,
    private readonly objectStorage: PilotObjectStorageService,
  ) {}

  async persist({
    actorId,
    mediaPath,
    result,
  }: PersistVocabularyPilotInput): Promise<VocabularyPilotPersistence> {
    await this.assertAuthorizedActor(actorId);
    const messageId = BigInt(result.source.mediaMessageId);
    const existing = await this.database.importSourceDocument.findUnique({
      where: {
        channelId_messageId: {
          channelId: result.source.channelId,
          messageId,
        },
      },
      include: {
        drafts: {
          include: { _count: { select: { entries: true } } },
          where: { parserVersion: PARSER_VERSION },
          take: 1,
        },
        mediaObject: true,
      },
    });

    if (existing !== null) {
      if (existing.checksumSha256 !== result.source.sha256) {
        throw new Error(
          'Telegram source identity already exists with another checksum',
        );
      }

      const draft = existing.drafts[0];

      if (draft === undefined) {
        throw new Error(
          'Existing import source is missing its vocabulary draft',
        );
      }

      return {
        created: false,
        draftId: draft.id,
        entryCount: draft._count.entries,
        malwareStatus: existing.mediaObject.malwareStatus,
        mediaObjectId: existing.mediaObjectId,
        mediaStatus: existing.mediaObject.status,
        sourceDocumentId: existing.id,
      };
    }

    if (result.document.extractionMethod !== 'EMBEDDED_TEXT') {
      throw new Error(
        'OCR must complete before the pilot draft can be persisted',
      );
    }

    const bytes = new Uint8Array(await readFile(mediaPath));

    if (bytes.byteLength > this.objectStorage.maxUploadBytes) {
      throw new Error('Pilot PDF exceeds the configured object-storage limit');
    }

    const mediaObjectId = randomUUID();
    const objectKey = createPrivateObjectKey({
      mediaObjectId,
      ownerId: actorId,
    });
    const uploadIntent = await this.objectStorage.createUploadIntent({
      bytes,
      contentType: PDF_CONTENT_TYPE,
      key: objectKey,
    });

    await this.database.mediaObject.create({
      data: {
        bucket: this.objectStorage.bucket,
        createdById: actorId,
        id: mediaObjectId,
        mediaType: MediaType.PDF,
        mimeType: PDF_CONTENT_TYPE,
        objectKey,
        originalName: result.source.originalFileName,
        source: MediaObjectSource.TELEGRAM_IMPORT,
        status: MediaObjectStatus.PENDING_UPLOAD,
        uploadExpiresAt: uploadIntent.expiresAt,
        visibility: MediaVisibility.OWNER_ONLY,
      },
    });

    await this.objectStorage.upload({
      bytes,
      contentType: PDF_CONTENT_TYPE,
      intent: uploadIntent,
      key: objectKey,
    });

    await this.database.mediaObject.update({
      where: { id: mediaObjectId },
      data: {
        status: MediaObjectStatus.VERIFYING,
      },
    });

    const persisted = await this.database.$transaction(async (transaction) => {
      const sourceDocument = await transaction.importSourceDocument.create({
        data: {
          channelId: result.source.channelId,
          checksumSha256: result.source.sha256,
          contentMessageId: BigInt(result.source.contentMessageId),
          detectedBrands: [...result.rightsReview.detectedBrands],
          extractionMethod: ImportExtractionMethod.EMBEDDED_TEXT,
          extractionStatus: ImportExtractionStatus.COMPLETED,
          mediaObjectId,
          messageId,
          originalName: result.source.originalFileName,
          rightsStatus: ImportRightsStatus.REVIEW_REQUIRED,
          sourcePublishedAt: new Date(result.source.mediaMessageDate),
        },
      });
      const draft = await transaction.vocabularyDraft.create({
        data: {
          entries: {
            create: result.draft.entries.map((entry, index) => ({
              position: index + 1,
              pronunciation: entry.pronunciation,
              section: entry.section,
              term: entry.term,
              translation: entry.translation,
            })),
          },
          parserVersion: PARSER_VERSION,
          sourceDocumentId: sourceDocument.id,
          status: VocabularyDraftStatus.DRAFT,
          title: result.draft.title,
          unparsedLines: [...result.draft.ignoredLines],
        },
      });

      return { draftId: draft.id, sourceDocumentId: sourceDocument.id };
    });

    return {
      created: true,
      draftId: persisted.draftId,
      entryCount: result.draft.entries.length,
      malwareStatus: 'PENDING',
      mediaObjectId,
      mediaStatus: 'VERIFYING',
      sourceDocumentId: persisted.sourceDocumentId,
    };
  }

  private async assertAuthorizedActor(actorId: string): Promise<void> {
    const actor = await this.database.user.findFirst({
      where: {
        id: actorId,
        role: { in: [UserRole.ADMIN, UserRole.TEACHER] },
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (actor === null) {
      throw new Error('Pilot actor must be an active Teacher or Admin');
    }
  }
}

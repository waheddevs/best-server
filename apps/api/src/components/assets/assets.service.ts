import { createHash, randomUUID } from 'node:crypto';

import {
  ContentStatus,
  MediaMalwareStatus,
  MediaObjectStatus,
  MediaType,
  MediaVisibility,
  UserRole,
  UserStatus,
} from '@best/database';
import { createPrivateObjectKey } from '@best/storage';
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import { ErrorCode } from '../../libs/enums/error-code.enum';
import { ApplicationError } from '../../libs/errors/application.error';
import { parseUuid } from '../../libs/pagination/cursor-pagination';
import type { CreateMediaUploadIntentInput } from '../../schemas/assets/create-media-upload-intent.input';
import type { MediaDownloadIntentObject } from '../../schemas/assets/media-download-intent.object';
import type { MediaObjectObject } from '../../schemas/assets/media-object.object';
import type { MediaUploadIntentObject } from '../../schemas/assets/media-upload-intent.object';

import { AssetsStorageGateway } from './assets-storage.gateway';
import type { MalwareScanResult } from './malware-scanner.gateway';
import { MalwareScannerGateway } from './malware-scanner.gateway';
import {
  getMediaUploadPolicy,
  validateMediaUpload,
} from './media-upload-policy';

@Injectable()
export class AssetsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: AssetsStorageGateway,
    private readonly malwareScanner: MalwareScannerGateway,
  ) {}

  async createMediaUploadIntent(
    creatorId: string,
    input: CreateMediaUploadIntentInput,
  ): Promise<MediaUploadIntentObject> {
    const upload = validateMediaUpload(input, this.storage.maxUploadBytes);
    const creator = await this.database.user.findFirst({
      where: { id: creatorId, status: UserStatus.ACTIVE },
      select: { role: true },
    });
    if (creator === null) {
      throw new ApplicationError(
        ErrorCode.FORBIDDEN,
        'Media owner is not active',
        403,
      );
    }
    if (
      creator.role === UserRole.STUDENT &&
      (upload.mediaType !== MediaType.IMAGE || upload.sizeBytes > 5 * 1_048_576)
    ) {
      throw new ApplicationError(
        ErrorCode.FORBIDDEN,
        'Students may upload profile images up to 5 MB only',
        403,
      );
    }
    const mediaObjectId = randomUUID();
    const objectKey = createPrivateObjectKey({
      mediaObjectId,
      ownerId: creatorId,
    });
    const intent = await this.storage.createUploadIntent({
      contentLength: upload.sizeBytes,
      contentType: upload.mimeType,
      key: objectKey,
    });

    await this.database.mediaObject.create({
      data: {
        bucket: this.storage.bucket,
        createdById: creatorId,
        id: mediaObjectId,
        mediaType: upload.mediaType,
        mimeType: upload.mimeType,
        objectKey,
        originalName: upload.originalName,
        uploadExpiresAt: intent.expiresAt,
        visibility: MediaVisibility.OWNER_ONLY,
      },
    });

    return {
      expiresAt: intent.expiresAt,
      mediaObjectId,
      method: intent.method,
      requiredHeaders: Object.entries(intent.requiredHeaders).map(
        ([name, value]) => ({ name, value }),
      ),
      sizeBytes: upload.sizeBytes,
      url: intent.url,
    };
  }

  async confirmMediaUpload(
    creatorId: string,
    mediaObjectIdInput: string,
  ): Promise<MediaObjectObject> {
    const mediaObjectId = parseUuid(mediaObjectIdInput, 'mediaObjectId');
    let mediaObject = await this.findOwnedMediaObject(creatorId, mediaObjectId);

    if (
      mediaObject.status === MediaObjectStatus.READY &&
      mediaObject.malwareStatus === MediaMalwareStatus.CLEAN
    ) {
      return mapMediaObject(mediaObject);
    }

    if (mediaObject.status === MediaObjectStatus.REJECTED) {
      throw mediaStateError('The media upload has been rejected');
    }

    if (mediaObject.status === MediaObjectStatus.PENDING_UPLOAD) {
      await this.database.mediaObject.updateMany({
        where: {
          createdById: creatorId,
          id: mediaObjectId,
          status: MediaObjectStatus.PENDING_UPLOAD,
        },
        data: { status: MediaObjectStatus.VERIFYING },
      });
      mediaObject = await this.findOwnedMediaObject(creatorId, mediaObjectId);
    }

    const metadata = await this.inspectUploadedObject(mediaObject);
    const policy = getMediaUploadPolicy(mediaObject.mimeType);

    if (
      metadata.contentLength === undefined ||
      metadata.contentLength < 1 ||
      metadata.contentLength >
        Math.min(policy.maxBytes, this.storage.maxUploadBytes)
    ) {
      return this.rejectUpload(
        mediaObjectId,
        'INVALID_SIZE',
        'The uploaded object size is invalid',
      );
    }

    if (metadata.contentType?.toLowerCase() !== mediaObject.mimeType) {
      return this.rejectUpload(
        mediaObjectId,
        'MIME_TYPE_MISMATCH',
        'The uploaded object MIME type does not match the upload intent',
      );
    }

    if (metadata.etag === undefined) {
      return this.rejectUpload(
        mediaObjectId,
        'MISSING_ETAG',
        'The uploaded object metadata is incomplete',
      );
    }

    let bytes: Uint8Array;

    try {
      bytes = await this.storage.readObject(
        mediaObject.objectKey,
        metadata.etag,
        Math.min(policy.maxBytes, this.storage.maxUploadBytes),
      );
    } catch (error: unknown) {
      throw storageUnavailableError(error);
    }

    if (bytes.byteLength !== metadata.contentLength) {
      return this.rejectUpload(
        mediaObjectId,
        'OBJECT_CHANGED',
        'The uploaded object changed during verification',
      );
    }

    if (!policy.signatureMatches(bytes)) {
      return this.rejectUpload(
        mediaObjectId,
        'INVALID_FILE_SIGNATURE',
        'The uploaded file signature does not match its MIME type',
      );
    }

    let scan: MalwareScanResult;

    try {
      scan = await this.malwareScanner.scan(bytes);
    } catch (error: unknown) {
      throw malwareScannerUnavailableError(error);
    }

    const malwareScannedAt = new Date();

    if (scan.status === 'INFECTED') {
      return this.rejectInfectedUpload(mediaObjectId, scan, malwareScannedAt);
    }

    const verifiedAt = new Date();
    const checksumSha256 = createHash('sha256').update(bytes).digest('hex');

    if (mediaObject.status === MediaObjectStatus.READY) {
      const update = await this.database.mediaObject.updateMany({
        where: {
          id: mediaObjectId,
          malwareStatus: MediaMalwareStatus.PENDING,
          status: MediaObjectStatus.READY,
        },
        data: {
          malwareEngine: scan.engine,
          malwareEngineVersion: scan.engineVersion,
          malwareScannedAt,
          malwareSignatureVersion: scan.signatureVersion,
          malwareStatus: MediaMalwareStatus.CLEAN,
        },
      });

      if (update.count === 0) {
        throw mediaStateError('The media upload could not be confirmed');
      }

      const rescanned = await this.findOwnedMediaObject(
        creatorId,
        mediaObjectId,
      );

      if (rescanned.malwareStatus !== MediaMalwareStatus.CLEAN) {
        throw mediaStateError('The media upload could not be confirmed');
      }

      return mapMediaObject(rescanned);
    }

    const update = await this.database.mediaObject.updateMany({
      where: {
        id: mediaObjectId,
        malwareStatus: MediaMalwareStatus.PENDING,
        status: MediaObjectStatus.VERIFYING,
      },
      data: {
        checksumSha256,
        malwareEngine: scan.engine,
        malwareEngineVersion: scan.engineVersion,
        malwareScannedAt,
        malwareSignatureVersion: scan.signatureVersion,
        malwareStatus: MediaMalwareStatus.CLEAN,
        sizeBytes: BigInt(bytes.byteLength),
        status: MediaObjectStatus.READY,
        verifiedAt,
      },
    });

    if (update.count === 0) {
      const concurrentResult = await this.findOwnedMediaObject(
        creatorId,
        mediaObjectId,
      );

      if (
        concurrentResult.status === MediaObjectStatus.READY &&
        concurrentResult.malwareStatus === MediaMalwareStatus.CLEAN
      ) {
        return mapMediaObject(concurrentResult);
      }

      throw mediaStateError('The media upload could not be confirmed');
    }

    return mapMediaObject(
      await this.findOwnedMediaObject(creatorId, mediaObjectId),
    );
  }

  async createMediaDownloadIntent(
    creatorId: string,
    mediaObjectIdInput: string,
  ): Promise<MediaDownloadIntentObject> {
    const mediaObjectId = parseUuid(mediaObjectIdInput, 'mediaObjectId');
    const mediaObject = await this.database.mediaObject.findFirst({
      where: {
        createdById: creatorId,
        id: mediaObjectId,
        malwareStatus: MediaMalwareStatus.CLEAN,
        status: MediaObjectStatus.READY,
      },
      select: { objectKey: true },
    });

    if (mediaObject === null) {
      throw mediaNotFoundError();
    }

    try {
      return await this.storage.createDownloadIntent(mediaObject.objectKey);
    } catch (error: unknown) {
      throw storageUnavailableError(error);
    }
  }

  async createProfileAvatarDownloadIntents(
    viewerId: string,
    userIds: string[],
  ): Promise<{ userId: string; url: string }[]> {
    if (userIds.length > 100) {
      throw new ApplicationError(
        ErrorCode.BAD_USER_INPUT,
        'At most 100 profile images can be requested',
        400,
      );
    }
    const ids = [...new Set(userIds.map((id) => parseUuid(id, 'userId')))];
    if (ids.length === 0) return [];

    const viewer = await this.database.user.findFirst({
      where: { id: viewerId, status: UserStatus.ACTIVE },
      select: { role: true },
    });
    if (viewer?.role !== UserRole.ADMIN && viewer?.role !== UserRole.TEACHER) {
      throw new ApplicationError(
        ErrorCode.FORBIDDEN,
        'Profile images are not available',
        403,
      );
    }

    const users = await this.database.user.findMany({
      where: {
        id: { in: ids },
        role:
          viewer.role === UserRole.ADMIN
            ? { in: [UserRole.STUDENT, UserRole.TEACHER] }
            : UserRole.STUDENT,
        status: UserStatus.ACTIVE,
        ...(viewer.role === UserRole.TEACHER
          ? {
              groupMemberships: {
                some: {
                  endedAt: null,
                  group: {
                    status: { not: ContentStatus.DELETED },
                    teacherId: viewerId,
                  },
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        avatarMediaObject: {
          select: {
            createdById: true,
            malwareStatus: true,
            mediaType: true,
            objectKey: true,
            status: true,
          },
        },
      },
    });

    return Promise.all(
      users.flatMap((user) => {
        const avatar = user.avatarMediaObject;
        if (
          avatar?.createdById !== user.id ||
          avatar.mediaType !== MediaType.IMAGE ||
          avatar.malwareStatus !== MediaMalwareStatus.CLEAN ||
          avatar.status !== MediaObjectStatus.READY
        ) {
          return [];
        }
        return [
          this.storage
            .createDownloadIntent(avatar.objectKey)
            .then((intent) => ({
              userId: user.id,
              url: intent.url,
            })),
        ];
      }),
    );
  }

  async createAuthorizedMediaDownloadIntent(
    mediaObjectIdInput: string,
  ): Promise<MediaDownloadIntentObject> {
    const mediaObjectId = parseUuid(mediaObjectIdInput, 'mediaObjectId');
    const mediaObject = await this.database.mediaObject.findFirst({
      where: {
        id: mediaObjectId,
        malwareStatus: MediaMalwareStatus.CLEAN,
        status: MediaObjectStatus.READY,
      },
      select: { objectKey: true },
    });
    if (mediaObject === null) {
      throw mediaNotFoundError();
    }
    try {
      return await this.storage.createDownloadIntent(mediaObject.objectKey);
    } catch (error: unknown) {
      throw storageUnavailableError(error);
    }
  }

  private async inspectUploadedObject(mediaObject: OwnedMediaObject) {
    try {
      return await this.storage.inspectObject(mediaObject.objectKey);
    } catch (error: unknown) {
      if (isStorageNotFound(error)) {
        if (
          mediaObject.uploadExpiresAt !== null &&
          mediaObject.uploadExpiresAt <= new Date()
        ) {
          return this.rejectUpload(
            mediaObject.id,
            'UPLOAD_EXPIRED',
            'The upload intent expired before an object was uploaded',
          );
        }

        throw mediaStateError('The object has not been uploaded yet');
      }

      throw storageUnavailableError(error);
    }
  }

  private async rejectUpload(
    mediaObjectId: string,
    rejectionCode: string,
    message: string,
  ): Promise<never> {
    await this.database.mediaObject.updateMany({
      where: {
        id: mediaObjectId,
        malwareStatus: MediaMalwareStatus.PENDING,
        status: {
          in: [MediaObjectStatus.VERIFYING, MediaObjectStatus.READY],
        },
      },
      data: {
        rejectedAt: new Date(),
        rejectionCode,
        status: MediaObjectStatus.REJECTED,
      },
    });

    throw new ApplicationError(ErrorCode.BAD_USER_INPUT, message, 400);
  }

  private async rejectInfectedUpload(
    mediaObjectId: string,
    scan: Extract<MalwareScanResult, { readonly status: 'INFECTED' }>,
    malwareScannedAt: Date,
  ): Promise<never> {
    await this.database.mediaObject.updateMany({
      where: {
        id: mediaObjectId,
        malwareStatus: MediaMalwareStatus.PENDING,
        status: { in: [MediaObjectStatus.VERIFYING, MediaObjectStatus.READY] },
      },
      data: {
        malwareEngine: scan.engine,
        malwareEngineVersion: scan.engineVersion,
        malwareScannedAt,
        malwareSignatureVersion: scan.signatureVersion,
        malwareStatus: MediaMalwareStatus.INFECTED,
        malwareThreatName: scan.threatName,
        rejectedAt: malwareScannedAt,
        rejectionCode: 'MALWARE_DETECTED',
        status: MediaObjectStatus.REJECTED,
      },
    });

    throw new ApplicationError(
      ErrorCode.BAD_USER_INPUT,
      'The uploaded file failed malware scanning',
      400,
    );
  }

  private async findOwnedMediaObject(
    creatorId: string,
    mediaObjectId: string,
  ): Promise<OwnedMediaObject> {
    const mediaObject = await this.database.mediaObject.findFirst({
      where: { createdById: creatorId, id: mediaObjectId },
      select: {
        checksumSha256: true,
        id: true,
        malwareScannedAt: true,
        malwareStatus: true,
        mediaType: true,
        mimeType: true,
        objectKey: true,
        originalName: true,
        sizeBytes: true,
        status: true,
        uploadExpiresAt: true,
        verifiedAt: true,
      },
    });

    if (mediaObject === null) {
      throw mediaNotFoundError();
    }

    return mediaObject;
  }
}

interface OwnedMediaObject {
  readonly checksumSha256: string | null;
  readonly id: string;
  readonly malwareScannedAt: Date | null;
  readonly malwareStatus: MediaMalwareStatus;
  readonly mediaType: MediaType;
  readonly mimeType: string;
  readonly objectKey: string;
  readonly originalName: string;
  readonly sizeBytes: bigint | null;
  readonly status: MediaObjectStatus;
  readonly uploadExpiresAt: Date | null;
  readonly verifiedAt: Date | null;
}

function mapMediaObject(mediaObject: OwnedMediaObject): MediaObjectObject {
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

function isStorageNotFound(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }

  if (error.name === 'NoSuchKey' || error.name === 'NotFound') {
    return true;
  }

  const metadata = error.$metadata;
  return isRecord(metadata) && metadata.httpStatusCode === 404;
}

function storageUnavailableError(error: unknown): ApplicationError {
  return new ApplicationError(
    ErrorCode.SERVICE_UNAVAILABLE,
    error instanceof Error
      ? 'Object storage is temporarily unavailable'
      : 'Object storage returned an invalid response',
    503,
  );
}

function malwareScannerUnavailableError(error: unknown): ApplicationError {
  return new ApplicationError(
    ErrorCode.SERVICE_UNAVAILABLE,
    error instanceof Error
      ? 'Malware scanning is temporarily unavailable'
      : 'Malware scanner returned an invalid response',
    503,
  );
}

function mediaNotFoundError(): ApplicationError {
  return new ApplicationError(
    ErrorCode.NOT_FOUND,
    'The requested media object was not found',
    404,
  );
}

function mediaStateError(message: string): ApplicationError {
  return new ApplicationError(ErrorCode.CONFLICT, message, 409);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

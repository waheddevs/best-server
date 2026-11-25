import { createHash, randomUUID } from 'node:crypto';
import {
  ContentStatus,
  MediaMalwareStatus,
  MediaObjectSource,
  MediaObjectStatus,
  MediaType,
  MediaVisibility,
  TestSkill,
  TestVersionStatus,
} from '@best/database';
import { createPrivateObjectKey } from '@best/storage';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { ErrorCode } from '../../../libs/enums/error-code.enum';
import { ApplicationError } from '../../../libs/errors/application.error';
import { parseUuid } from '../../../libs/pagination/cursor-pagination';
import type { GenerateListeningAudioInput } from '../../../schemas/tests/audio/generate-listening-audio.input';
import type { GeneratedListeningAudioObject } from '../../../schemas/tests/audio/generated-listening-audio.object';
import { AssetsStorageGateway } from '../../assets/assets-storage.gateway';
import {
  ListeningAudioGateway,
  ListeningAudioProviderError,
} from './listening-audio.gateway';
import { writeAudit } from '../authoring/test-authoring-audit';
import { requiredText } from '../authoring/test-draft-parsing';
import { notFound } from '../authoring/test-authoring-errors';

@Injectable()
export class TestListeningAudioService {
  constructor(
    private readonly audio: ListeningAudioGateway,
    private readonly database: DatabaseService,
    private readonly storage: AssetsStorageGateway,
  ) {}
  async generateListeningAudio(
    teacherId: string,
    input: GenerateListeningAudioInput,
    correlationId?: string,
  ): Promise<GeneratedListeningAudioObject> {
    const testSectionId = parseUuid(input.testSectionId, 'testSectionId');
    const transcript = requiredText(
      input.transcript,
      'transcript',
      this.audio.maxTranscriptCharacters,
    );
    const existing = await this.database.testSection.findFirst({
      where: {
        id: testSectionId,
        testVersion: {
          status: TestVersionStatus.DRAFT,
          test: {
            group: { teacherId },
            skill: TestSkill.LISTENING,
            status: ContentStatus.ACTIVE,
          },
        },
      },
      select: {
        position: true,
      },
    });

    if (existing === null) throw notFound();

    const mediaObjectId = randomUUID();
    const objectKey = createPrivateObjectKey({
      mediaObjectId,
      ownerId: teacherId,
    });
    let mediaObjectCreated = false;

    try {
      const generated = await this.audio.generate(transcript);

      if (
        generated.bytes.byteLength < 1 ||
        generated.bytes.byteLength > this.storage.maxUploadBytes
      ) {
        throw new ListeningAudioProviderError(
          'The generated audio exceeds the configured storage limit',
        );
      }

      const checksumSha256 = createHash('sha256')
        .update(generated.bytes)
        .digest('hex');
      await this.database.mediaObject.create({
        data: {
          bucket: this.storage.bucket,
          createdById: teacherId,
          id: mediaObjectId,
          mediaType: MediaType.AUDIO,
          mimeType: generated.mimeType,
          objectKey,
          originalName: `listening-part-${String(existing.position)}.wav`,
          source: MediaObjectSource.SYSTEM_GENERATED,
          status: MediaObjectStatus.VERIFYING,
          uploadExpiresAt: new Date(Date.now() + 15 * 60 * 1_000),
          visibility: MediaVisibility.OWNER_ONLY,
        },
      });
      mediaObjectCreated = true;

      await this.storage.writeObject({
        bytes: generated.bytes,
        contentType: generated.mimeType,
        key: objectKey,
      });
      const download = await this.storage.createDownloadIntent(objectKey);

      const lifecycleTime = new Date();
      await this.database.$transaction(async (tx) => {
        const current = await tx.testSection.count({
          where: {
            id: testSectionId,
            testVersion: {
              status: TestVersionStatus.DRAFT,
              test: {
                group: { teacherId },
                skill: TestSkill.LISTENING,
                status: ContentStatus.ACTIVE,
              },
            },
          },
        });

        if (current !== 1) {
          throw new ApplicationError(
            ErrorCode.CONFLICT,
            'The listening draft changed while audio was being generated',
            409,
          );
        }

        await tx.mediaObject.update({
          where: { id: mediaObjectId },
          data: {
            checksumSha256,
            durationSeconds: generated.durationSeconds,
            malwareEngine: generated.engine,
            malwareEngineVersion: generated.engineVersion,
            malwareScannedAt: lifecycleTime,
            malwareSignatureVersion: 'trusted-system-output',
            malwareStatus: MediaMalwareStatus.CLEAN,
            sizeBytes: BigInt(generated.bytes.byteLength),
            status: MediaObjectStatus.READY,
            verifiedAt: lifecycleTime,
          },
        });
        await writeAudit(
          tx,
          teacherId,
          'LISTENING_AUDIO_PREVIEW_GENERATED',
          'MEDIA_OBJECT',
          mediaObjectId,
          correlationId,
          {
            testSectionId,
            voice: generated.voice,
          },
        );
      });

      return {
        durationSeconds: generated.durationSeconds,
        expiresAt: download.expiresAt,
        mediaObjectId,
        url: download.url,
      };
    } catch (error: unknown) {
      if (mediaObjectCreated) {
        await this.rejectGeneratedMediaObject(mediaObjectId);
      }

      if (error instanceof ApplicationError) throw error;

      throw new ApplicationError(
        ErrorCode.SERVICE_UNAVAILABLE,
        'Listening audio could not be generated',
        503,
      );
    }
  }

  private async rejectGeneratedMediaObject(
    mediaObjectId: string,
  ): Promise<void> {
    await this.database.mediaObject.updateMany({
      where: {
        id: mediaObjectId,
        status: MediaObjectStatus.VERIFYING,
      },
      data: {
        rejectedAt: new Date(),
        rejectionCode: 'GENERATION_FAILED',
        status: MediaObjectStatus.REJECTED,
      },
    });
  }
}

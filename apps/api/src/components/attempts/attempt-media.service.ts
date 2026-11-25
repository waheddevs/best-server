import {
  AttemptStatus,
  MediaType,
  QuestionKind,
  TestSkill,
} from '@best/database';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ErrorCode } from '../../libs/enums/error-code.enum';
import { ApplicationError } from '../../libs/errors/application.error';
import { parseUuid } from '../../libs/pagination/cursor-pagination';
import type { CreateAttemptAudioUploadInput } from '../../schemas/attempts/create-attempt-audio-upload.input';
import type { ConfirmAttemptAudioUploadInput } from '../../schemas/attempts/confirm-attempt-audio-upload.input';
import type { MediaObjectObject } from '../../schemas/assets/media-object.object';
import type { MediaDownloadIntentObject } from '../../schemas/assets/media-download-intent.object';
import type { MediaUploadIntentObject } from '../../schemas/assets/media-upload-intent.object';
import { AssetsService } from '../assets/assets.service';
import { inaccessibleAttemptError } from './attempt-errors';

@Injectable()
export class AttemptMediaService {
  constructor(
    private readonly database: DatabaseService,
    private readonly assetsService: AssetsService,
  ) {}
  async createStudentAttemptMediaDownloadIntent(
    studentId: string,
    attemptIdInput: string,
    mediaObjectIdInput: string,
  ): Promise<MediaDownloadIntentObject> {
    const attemptId = parseUuid(attemptIdInput, 'attemptId');
    const mediaObjectId = parseUuid(mediaObjectIdInput, 'mediaObjectId');
    const attempt = await this.database.attempt.findFirst({
      where: {
        id: attemptId,
        studentId,
        testVersion: {
          sections: {
            some: {
              OR: [{ mediaObjectId }, { blocks: { some: { mediaObjectId } } }],
            },
          },
        },
      },
      select: { id: true },
    });
    if (attempt === null) {
      throw inaccessibleAttemptError();
    }
    return this.assetsService.createAuthorizedMediaDownloadIntent(
      mediaObjectId,
    );
  }

  async createAttemptAudioUploadIntent(
    studentId: string,
    input: CreateAttemptAudioUploadInput,
  ): Promise<MediaUploadIntentObject> {
    return this.assetsService.createSpeakingAudioUploadIntent(
      studentId,
      parseUuid(input.attemptId, 'attemptId'),
      parseUuid(input.questionId, 'questionId'),
      {
        mimeType: input.mimeType,
        originalName: input.originalName,
        sizeBytes: input.sizeBytes,
      },
    );
  }

  async confirmAttemptAudioUpload(
    studentId: string,
    input: ConfirmAttemptAudioUploadInput,
  ): Promise<MediaObjectObject> {
    await this.assertWritableAudioQuestion(
      studentId,
      parseUuid(input.attemptId, 'attemptId'),
      parseUuid(input.questionId, 'questionId'),
    );
    const mediaObject = await this.assetsService.confirmMediaUpload(
      studentId,
      input.mediaObjectId,
    );
    if (mediaObject.mediaType !== MediaType.AUDIO) {
      throw new ApplicationError(
        ErrorCode.BAD_USER_INPUT,
        'Only an audio file can be used as a Speaking response',
        400,
      );
    }
    return mediaObject;
  }

  private async assertWritableAudioQuestion(
    studentId: string,
    attemptId: string,
    questionId: string,
  ): Promise<void> {
    const now = new Date();
    const attempt = await this.database.attempt.findFirst({
      where: {
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        id: attemptId,
        status: AttemptStatus.IN_PROGRESS,
        studentId,
        testVersion: {
          test: { skill: TestSkill.SPEAKING },
          questions: {
            some: { id: questionId, kind: QuestionKind.AUDIO_RESPONSE },
          },
        },
      },
      select: { id: true },
    });
    if (attempt === null) {
      throw new ApplicationError(
        ErrorCode.ATTEMPT_NOT_ACTIVE,
        'The audio response does not belong to an active attempt',
        409,
      );
    }
  }
}

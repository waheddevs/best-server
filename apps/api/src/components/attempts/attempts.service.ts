import {
  AttemptStatus,
  AttemptSubmissionReason,
  Language,
  MediaMalwareStatus,
  MediaObjectStatus,
  MediaType,
  QuestionKind,
} from '@best/database';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ErrorCode } from '../../libs/enums/error-code.enum';
import { ApplicationError } from '../../libs/errors/application.error';
import { parseUuid } from '../../libs/pagination/cursor-pagination';
import type { SaveAttemptAnswerInput } from '../../schemas/attempts/save-attempt-answer.input';
import type { SaveAttemptSectionNoteInput } from '../../schemas/attempts/save-attempt-section-note.input';
import type { StartTestAttemptInput } from '../../schemas/attempts/start-test-attempt.input';
import type { StudentAttemptObject } from '../../schemas/attempts/student-attempt.object';
import type { StudentReleasedAttemptResultObject } from '../../schemas/attempts/student-released-attempt-result.object';
import type { SubmitTestAttemptInput } from '../../schemas/attempts/submit-test-attempt.input';
import type { CreateAttemptAudioUploadInput } from '../../schemas/attempts/create-attempt-audio-upload.input';
import type { ConfirmAttemptAudioUploadInput } from '../../schemas/attempts/confirm-attempt-audio-upload.input';
import type { MediaObjectObject } from '../../schemas/assets/media-object.object';
import type { MediaDownloadIntentObject } from '../../schemas/assets/media-download-intent.object';
import type { MediaUploadIntentObject } from '../../schemas/assets/media-upload-intent.object';
import { AttemptLifecycleService } from './attempt-lifecycle.service';
import { AttemptMediaService } from './attempt-media.service';
import { AttemptReadService } from './attempt-read.service';
import {
  ensureOptionsBelongToQuestion,
  invalidResponseShapeError,
  countWords,
} from './attempt-answer-validation';
import { submitAttemptTransactionally } from './attempt-submission';
import { inaccessibleAttemptError } from './attempt-errors';

@Injectable()
export class AttemptsService {
  constructor(
    private readonly attemptLifecycleService: AttemptLifecycleService,
    private readonly attemptMediaService: AttemptMediaService,
    private readonly database: DatabaseService,
    private readonly attemptReadService: AttemptReadService,
  ) {}
  async discardTestAttempt(
    studentId: string,
    attemptIdInput: string,
    correlationId: string | undefined,
  ): Promise<boolean> {
    return this.attemptLifecycleService.discardTestAttempt(
      studentId,
      attemptIdInput,
      correlationId,
    );
  }

  async createStudentAttemptMediaDownloadIntent(
    studentId: string,
    attemptIdInput: string,
    mediaObjectIdInput: string,
  ): Promise<MediaDownloadIntentObject> {
    return this.attemptMediaService.createStudentAttemptMediaDownloadIntent(
      studentId,
      attemptIdInput,
      mediaObjectIdInput,
    );
  }

  async createAttemptAudioUploadIntent(
    studentId: string,
    input: CreateAttemptAudioUploadInput,
  ): Promise<MediaUploadIntentObject> {
    return this.attemptMediaService.createAttemptAudioUploadIntent(
      studentId,
      input,
    );
  }

  async confirmAttemptAudioUpload(
    studentId: string,
    input: ConfirmAttemptAudioUploadInput,
  ): Promise<MediaObjectObject> {
    return this.attemptMediaService.confirmAttemptAudioUpload(studentId, input);
  }

  async saveAttemptSectionNote(
    studentId: string,
    input: SaveAttemptSectionNoteInput,
    language: Language,
  ): Promise<StudentAttemptObject> {
    const attemptId = parseUuid(input.attemptId, 'attemptId');
    const sectionId = parseUuid(input.sectionId, 'sectionId');
    const text = input.text.trim();
    if (text.length > 4000) {
      throw new ApplicationError(
        ErrorCode.BAD_USER_INPUT,
        'The note cannot exceed 4000 characters',
        400,
      );
    }
    const now = new Date();
    await this.database.$transaction(async (transaction) => {
      const attempt = await transaction.attempt.findFirst({
        where: { id: attemptId, studentId },
        select: {
          expiresAt: true,
          status: true,
          testVersionId: true,
        },
      });
      if (attempt === null) {
        throw inaccessibleAttemptError();
      }
      if (
        attempt.status !== AttemptStatus.IN_PROGRESS ||
        (attempt.expiresAt !== null && attempt.expiresAt <= now)
      ) {
        throw new ApplicationError(
          ErrorCode.ATTEMPT_NOT_ACTIVE,
          'Notes can only be changed on an active attempt',
          409,
        );
      }
      const section = await transaction.testSection.findFirst({
        where: { id: sectionId, testVersionId: attempt.testVersionId },
        select: { id: true },
      });
      if (section === null) {
        throw new ApplicationError(
          ErrorCode.BAD_USER_INPUT,
          'The section does not belong to this attempt',
          400,
        );
      }
      if (text.length === 0) {
        await transaction.attemptSectionNote.deleteMany({
          where: { attemptId, sectionId },
        });
      } else {
        await transaction.attemptSectionNote.upsert({
          where: { attemptId_sectionId: { attemptId, sectionId } },
          create: { attemptId, savedAt: now, sectionId, text },
          update: { savedAt: now, text },
        });
      }
    });
    return this.attemptReadService.loadStudentAttempt(
      studentId,
      attemptId,
      language,
    );
  }

  async getStudentReleasedAttemptResult(
    studentId: string,
    attemptIdInput: string,
  ): Promise<StudentReleasedAttemptResultObject> {
    return this.attemptReadService.getStudentReleasedAttemptResult(
      studentId,
      attemptIdInput,
    );
  }

  async getStudentAttempt(
    studentId: string,
    attemptIdInput: string,
    language: Language,
  ): Promise<StudentAttemptObject> {
    return this.attemptReadService.loadStudentAttempt(
      studentId,
      parseUuid(attemptIdInput, 'attemptId'),
      language,
    );
  }

  async startTestAttempt(
    studentId: string,
    input: StartTestAttemptInput,
  ): Promise<StudentAttemptObject> {
    const testId = parseUuid(input.testId, 'testId');
    const attemptId = await this.attemptLifecycleService.createOrResumeAttempt(
      studentId,
      testId,
      input.language,
    );

    return this.attemptReadService.loadStudentAttempt(
      studentId,
      attemptId,
      input.language,
    );
  }

  async saveAttemptAnswer(
    studentId: string,
    input: SaveAttemptAnswerInput,
    correlationId: string | undefined,
    language: Language,
  ): Promise<StudentAttemptObject> {
    const attemptId = parseUuid(input.attemptId, 'attemptId');
    const questionId = parseUuid(input.questionId, 'questionId');
    await this.attemptReadService.ensureAttemptTranslation(
      studentId,
      attemptId,
      language,
    );
    const now = new Date();
    const outcome = await this.database.$transaction(async (transaction) => {
      const attempt = await transaction.attempt.findFirst({
        where: { id: attemptId, studentId },
        select: {
          expiresAt: true,
          status: true,
          testVersion: { select: { availabilityEndsAt: true, id: true } },
        },
      });

      if (attempt === null) {
        throw inaccessibleAttemptError();
      }

      if (attempt.status !== AttemptStatus.IN_PROGRESS) {
        throw new ApplicationError(
          ErrorCode.ATTEMPT_NOT_ACTIVE,
          'Answers can only be changed on an active attempt',
          409,
        );
      }

      if (attempt.expiresAt !== null && attempt.expiresAt <= now) {
        const reason =
          attempt.testVersion.availabilityEndsAt !== null &&
          attempt.testVersion.availabilityEndsAt <= now
            ? AttemptSubmissionReason.AVAILABILITY_ENDED
            : AttemptSubmissionReason.DURATION_EXPIRED;
        await submitAttemptTransactionally(
          transaction,
          attemptId,
          reason,
          now,
          correlationId,
        );

        return { expired: true };
      }

      const question = await transaction.question.findFirst({
        where: {
          id: questionId,
          testVersionId: attempt.testVersion.id,
        },
        select: {
          answerLimit: true,
          kind: true,
          maxSelections: true,
        },
      });

      if (question === null) {
        throw new ApplicationError(
          ErrorCode.BAD_USER_INPUT,
          'The question does not belong to this attempt',
          400,
        );
      }

      const selectedOptionIds = [...new Set(input.selectedOptionIds ?? [])].map(
        (optionId) => parseUuid(optionId, 'selectedOptionIds'),
      );
      const selectedOptionId =
        input.selectedOptionId === undefined
          ? undefined
          : parseUuid(input.selectedOptionId, 'selectedOptionId');
      const responseMediaObjectId =
        input.responseMediaObjectId === undefined
          ? undefined
          : parseUuid(input.responseMediaObjectId, 'responseMediaObjectId');
      const textValue = input.textValue?.trim();

      if (
        question.kind === QuestionKind.SINGLE_CHOICE ||
        question.kind === QuestionKind.TRUE_FALSE_NOT_GIVEN ||
        question.kind === QuestionKind.YES_NO_NOT_GIVEN
      ) {
        if (
          selectedOptionId === undefined ||
          selectedOptionIds.length > 0 ||
          textValue !== undefined ||
          responseMediaObjectId !== undefined
        ) {
          throw invalidResponseShapeError();
        }
        await ensureOptionsBelongToQuestion(transaction, questionId, [
          selectedOptionId,
        ]);
        await transaction.attemptAnswer.upsert({
          where: { attemptId_questionId: { attemptId, questionId } },
          create: { attemptId, questionId, selectedOptionId, savedAt: now },
          update: {
            responseMediaObjectId: null,
            savedAt: now,
            selectedOptionId,
            textValue: null,
          },
        });
      } else if (
        question.kind === QuestionKind.SHORT_TEXT ||
        question.kind === QuestionKind.LONG_TEXT
      ) {
        if (
          textValue === undefined ||
          textValue.length === 0 ||
          selectedOptionId !== undefined ||
          selectedOptionIds.length > 0 ||
          responseMediaObjectId !== undefined
        ) {
          throw invalidResponseShapeError();
        }
        if (
          question.kind === QuestionKind.SHORT_TEXT &&
          question.answerLimit !== null &&
          countWords(textValue) > question.answerLimit
        ) {
          throw new ApplicationError(
            ErrorCode.BAD_USER_INPUT,
            'The answer exceeds this question word limit',
            400,
          );
        }
        await transaction.attemptAnswer.upsert({
          where: { attemptId_questionId: { attemptId, questionId } },
          create: { attemptId, questionId, savedAt: now, textValue },
          update: {
            responseMediaObjectId: null,
            savedAt: now,
            selectedOptionId: null,
            textValue,
          },
        });
      } else if (
        question.kind === QuestionKind.MULTIPLE_CHOICE ||
        question.kind === QuestionKind.MATCHING
      ) {
        if (
          selectedOptionIds.length === 0 ||
          selectedOptionId !== undefined ||
          textValue !== undefined ||
          responseMediaObjectId !== undefined ||
          (question.maxSelections !== null &&
            selectedOptionIds.length > question.maxSelections)
        ) {
          throw invalidResponseShapeError();
        }
        await ensureOptionsBelongToQuestion(
          transaction,
          questionId,
          selectedOptionIds,
        );
        const answer = await transaction.attemptAnswer.upsert({
          where: { attemptId_questionId: { attemptId, questionId } },
          create: { attemptId, questionId, savedAt: now },
          update: {
            responseMediaObjectId: null,
            savedAt: now,
            selectedOptionId: null,
            textValue: null,
          },
          select: { id: true },
        });
        await transaction.attemptAnswerSelection.deleteMany({
          where: { attemptAnswerId: answer.id },
        });
        await transaction.attemptAnswerSelection.createMany({
          data: selectedOptionIds.map((answerOptionId, index) => ({
            answerOptionId,
            attemptAnswerId: answer.id,
            position: index + 1,
          })),
        });
      } else {
        if (
          responseMediaObjectId === undefined ||
          selectedOptionId !== undefined ||
          selectedOptionIds.length > 0 ||
          textValue !== undefined
        ) {
          throw invalidResponseShapeError();
        }
        const mediaObject = await transaction.mediaObject.findFirst({
          where: {
            createdById: studentId,
            id: responseMediaObjectId,
            malwareStatus: MediaMalwareStatus.CLEAN,
            mediaType: MediaType.AUDIO,
            status: MediaObjectStatus.READY,
          },
          select: { id: true },
        });
        if (mediaObject === null) {
          throw new ApplicationError(
            ErrorCode.BAD_USER_INPUT,
            'The audio response is not ready or does not belong to this student',
            400,
          );
        }
        await transaction.attemptAnswer.upsert({
          where: { attemptId_questionId: { attemptId, questionId } },
          create: {
            attemptId,
            questionId,
            responseMediaObjectId,
            savedAt: now,
          },
          update: {
            responseMediaObjectId,
            savedAt: now,
            selectedOptionId: null,
            textValue: null,
          },
        });
      }

      return { expired: false };
    });

    if (outcome.expired) {
      throw new ApplicationError(
        ErrorCode.ATTEMPT_EXPIRED,
        'The attempt deadline has passed and the latest answers were submitted',
        409,
      );
    }

    return this.attemptReadService.loadStudentAttempt(
      studentId,
      attemptId,
      language,
    );
  }

  async submitTestAttempt(
    studentId: string,
    input: SubmitTestAttemptInput,
    correlationId: string | undefined,
    language: Language,
  ): Promise<StudentAttemptObject> {
    return this.attemptLifecycleService.submitTestAttempt(
      studentId,
      input,
      correlationId,
      language,
    );
  }
}

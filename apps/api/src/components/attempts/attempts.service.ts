import {
  AttemptStatus,
  AttemptSubmissionReason,
  ContentStatus,
  Language,
  MediaMalwareStatus,
  MediaObjectStatus,
  MediaType,
  OutboxEventType,
  Prisma,
  QuestionKind,
  TestSectionBlockKind,
  TestSkill,
  TestVersionStatus,
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
import { AssetsService } from '../assets/assets.service';

@Injectable()
export class AttemptsService {
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
    return this.loadStudentAttempt(studentId, attemptId, language);
  }

  async getStudentReleasedAttemptResult(
    studentId: string,
    attemptIdInput: string,
  ): Promise<StudentReleasedAttemptResultObject> {
    const attemptId = parseUuid(attemptIdInput, 'attemptId');
    const attempt = await this.database.attempt.findFirst({
      where: {
        id: attemptId,
        status: AttemptStatus.SCORED,
        studentId,
        testVersion: {
          test: { skill: { in: [TestSkill.LISTENING, TestSkill.READING] } },
        },
      },
      include: {
        answers: {
          include: {
            selectedOption: {
              include: {
                translations: {
                  where: { language: Language.EN },
                  select: { text: true },
                },
              },
            },
            selections: {
              orderBy: { position: 'asc' },
              include: {
                answerOption: {
                  include: {
                    translations: {
                      where: { language: Language.EN },
                      select: { text: true },
                    },
                  },
                },
              },
            },
          },
        },
        testVersion: {
          include: {
            questions: {
              orderBy: { position: 'asc' },
              include: {
                acceptedAnswers: { orderBy: { position: 'asc' } },
                evidence: true,
                options: {
                  orderBy: { position: 'asc' },
                  include: {
                    translations: {
                      where: { language: Language.EN },
                      select: { text: true },
                    },
                  },
                },
                translations: {
                  where: { language: Language.EN },
                  select: { prompt: true },
                },
              },
            },
            sections: {
              orderBy: { position: 'asc' },
              include: {
                blocks: {
                  where: {
                    kind: {
                      in: [
                        TestSectionBlockKind.TABLE,
                        TestSectionBlockKind.QUESTION_GROUP,
                      ],
                    },
                  },
                  orderBy: { position: 'asc' },
                  include: {
                    questions: {
                      orderBy: { position: 'asc' },
                      select: { questionId: true },
                    },
                    translations: {
                      where: { language: Language.EN },
                      select: { caption: true },
                    },
                  },
                },
                translations: {
                  where: { language: Language.EN },
                  select: { content: true, title: true },
                },
              },
            },
            test: { select: { id: true, skill: true } },
            translations: {
              where: { language: Language.EN },
              select: { title: true },
            },
          },
        },
      },
    });

    if (attempt === null) {
      throw new ApplicationError(
        ErrorCode.NOT_FOUND,
        'The released objective result was not found',
        404,
      );
    }

    const skill = attempt.testVersion.test.skill;
    const title = attempt.testVersion.translations[0]?.title;
    if (
      (skill !== TestSkill.LISTENING && skill !== TestSkill.READING) ||
      title === undefined ||
      attempt.correctAnswerCount === null ||
      attempt.totalQuestionCount === null ||
      attempt.percentage === null
    ) {
      throw new ApplicationError(
        ErrorCode.INTERNAL_SERVER_ERROR,
        'The released objective result is incomplete',
        500,
      );
    }

    const answerByQuestion = new Map(
      attempt.answers.map((answer) => [answer.questionId, answer]),
    );
    const sections = attempt.testVersion.sections.map((section) => {
      const translation = section.translations[0];
      if (translation?.content === null || translation?.content === undefined) {
        throw new ApplicationError(
          ErrorCode.INTERNAL_SERVER_ERROR,
          'Released evidence content is incomplete',
          500,
        );
      }
      return {
        content: translation.content,
        id: section.id,
        position: section.position,
        title: translation.title,
      };
    });
    const answers = attempt.testVersion.questions.map((question) => {
      const translation = question.translations[0];
      if (translation === undefined) {
        throw unavailableTranslationError();
      }
      const response = answerByQuestion.get(question.id);
      const correctOptions = question.options.filter(
        (option) => option.isCorrect,
      );
      const correctOptionIds = correctOptions.map((option) => option.id).sort();
      const selectedOptionIds = [
        ...(response?.selectedOptionId ? [response.selectedOptionId] : []),
        ...(response?.selections.map((selection) => selection.answerOptionId) ??
          []),
      ].sort();
      const correctAnswer =
        question.acceptedAnswers.length > 0
          ? question.acceptedAnswers.map((answer) => answer.normalizedValue)
          : correctOptions.map(
              (option) => option.translations[0]?.text ?? option.id,
            );
      const studentAnswer = response?.textValue
        ? [response.textValue]
        : response?.selectedOption
          ? [
              response.selectedOption.translations[0]?.text ??
                response.selectedOption.id,
            ]
          : (response?.selections.map(
              (selection) =>
                selection.answerOption.translations[0]?.text ??
                selection.answerOption.id,
            ) ?? []);
      const isCorrect =
        question.acceptedAnswers.length > 0
          ? response?.textValue !== null && response?.textValue !== undefined
            ? question.acceptedAnswers.some(
                (answer) =>
                  normalizeObjectiveText(response.textValue ?? '') ===
                  answer.normalizedValue,
              )
            : false
          : sameStringSet(correctOptionIds, selectedOptionIds);

      return {
        correctAnswer,
        evidenceEndOffset: question.evidence?.endOffset ?? null,
        evidenceStartOffset: question.evidence?.startOffset ?? null,
        isCorrect,
        position: question.position,
        prompt: translation.prompt,
        questionId: question.id,
        sectionId: question.sectionId,
        studentAnswer,
      };
    });

    return {
      answers,
      attemptId: attempt.id,
      correctAnswerCount: attempt.correctAnswerCount,
      percentage: attempt.percentage.toNumber(),
      sections,
      skill,
      testId: attempt.testVersion.test.id,
      title,
      totalQuestionCount: attempt.totalQuestionCount,
    };
  }

  async getStudentAttempt(
    studentId: string,
    attemptIdInput: string,
    language: Language,
  ): Promise<StudentAttemptObject> {
    return this.loadStudentAttempt(
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
    const attemptId = await this.createOrResumeAttempt(
      studentId,
      testId,
      input.language,
    );

    return this.loadStudentAttempt(studentId, attemptId, input.language);
  }

  async saveAttemptAnswer(
    studentId: string,
    input: SaveAttemptAnswerInput,
    correlationId: string | undefined,
    language: Language,
  ): Promise<StudentAttemptObject> {
    const attemptId = parseUuid(input.attemptId, 'attemptId');
    const questionId = parseUuid(input.questionId, 'questionId');
    await this.ensureAttemptTranslation(studentId, attemptId, language);
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

    return this.loadStudentAttempt(studentId, attemptId, language);
  }

  async submitTestAttempt(
    studentId: string,
    input: SubmitTestAttemptInput,
    correlationId: string | undefined,
    language: Language,
  ): Promise<StudentAttemptObject> {
    const attemptId = parseUuid(input.attemptId, 'attemptId');
    await this.ensureAttemptTranslation(studentId, attemptId, language);
    const now = new Date();

    await this.database.$transaction(async (transaction) => {
      const attempt = await transaction.attempt.findFirst({
        where: { id: attemptId, studentId },
        select: {
          id: true,
          expiresAt: true,
          status: true,
          _count: { select: { answers: true } },
          testVersion: {
            select: {
              _count: { select: { questions: true } },
              availabilityEndsAt: true,
              test: { select: { skill: true } },
            },
          },
        },
      });

      if (attempt === null) {
        throw inaccessibleAttemptError();
      }

      if (attempt.status === AttemptStatus.IN_PROGRESS) {
        const deadlinePassed =
          attempt.expiresAt !== null && attempt.expiresAt <= now;
        if (
          !deadlinePassed &&
          attempt.testVersion.test.skill === TestSkill.SPEAKING &&
          attempt._count.answers < attempt.testVersion._count.questions
        ) {
          throw new ApplicationError(
            ErrorCode.BAD_USER_INPUT,
            'Every Speaking question must have a recorded response before submission',
            400,
          );
        }
        await submitAttemptTransactionally(
          transaction,
          attemptId,
          deadlinePassed
            ? attempt.testVersion.availabilityEndsAt !== null &&
              attempt.testVersion.availabilityEndsAt <= now
              ? AttemptSubmissionReason.AVAILABILITY_ENDED
              : AttemptSubmissionReason.DURATION_EXPIRED
            : AttemptSubmissionReason.MANUAL,
          now,
          correlationId,
        );
      }
    });

    return this.loadStudentAttempt(studentId, attemptId, language);
  }

  private async createOrResumeAttempt(
    studentId: string,
    testId: string,
    language: Language,
  ): Promise<string> {
    const now = new Date();

    try {
      return await this.database.$transaction(
        async (transaction) => {
          const membership = await transaction.groupMembership.findFirst({
            where: {
              endedAt: null,
              studentId,
              group: { tests: { some: { id: testId } } },
            },
            select: { groupId: true, id: true },
          });

          if (membership === null) {
            throw unavailableTestError();
          }

          const version = await transaction.testVersion.findFirst({
            where: {
              ...availableVersionWhere(now),
              test: {
                groupId: membership.groupId,
                id: testId,
                status: ContentStatus.ACTIVE,
              },
            },
            orderBy: { version: 'desc' },
            select: {
              attemptLimit: true,
              availabilityEndsAt: true,
              durationMinutes: true,
              id: true,
            },
          });

          if (version === null) {
            throw unavailableTestError();
          }

          const testTranslationCount = await transaction.testTranslation.count({
            where: { language, testVersionId: version.id },
          });
          const untranslatedQuestionCount = await transaction.question.count({
            where: {
              testVersionId: version.id,
              translations: { none: { language } },
            },
          });
          const untranslatedOptionCount = await transaction.answerOption.count({
            where: {
              question: { testVersionId: version.id },
              translations: { none: { language } },
            },
          });

          if (
            testTranslationCount !== 1 ||
            untranslatedQuestionCount !== 0 ||
            untranslatedOptionCount !== 0
          ) {
            throw unavailableTranslationError();
          }

          const activeAttempt = await transaction.attempt.findFirst({
            where: {
              status: AttemptStatus.IN_PROGRESS,
              studentId,
              testVersionId: version.id,
            },
            select: { id: true },
          });

          if (activeAttempt !== null) {
            return activeAttempt.id;
          }

          const attemptsUsed = await transaction.attempt.count({
            where: { studentId, testVersionId: version.id },
          });
          const attemptGrants = await transaction.attemptGrant.aggregate({
            where: { studentId, testId },
            _sum: { additionalAttempts: true },
          });
          const additionalAttempts = attemptGrants._sum.additionalAttempts ?? 0;

          if (attemptsUsed >= version.attemptLimit + additionalAttempts) {
            throw new ApplicationError(
              ErrorCode.ATTEMPT_LIMIT_REACHED,
              'The attempt limit has been reached',
              409,
            );
          }

          const expiresAt = calculateExpiresAt(
            now,
            version.durationMinutes,
            version.availabilityEndsAt,
          );
          const createdAttempt = await transaction.attempt.create({
            data: {
              attemptNumber: attemptsUsed + 1,
              expiresAt,
              groupMembershipId: membership.id,
              startedAt: now,
              studentId,
              testVersionId: version.id,
            },
            select: { id: true },
          });

          return createdAttempt.id;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (
        getPrismaErrorCode(error) === 'P2002' ||
        getPrismaErrorCode(error) === 'P2034'
      ) {
        const activeAttempt = await this.database.attempt.findFirst({
          where: {
            status: AttemptStatus.IN_PROGRESS,
            studentId,
            testVersion: { testId },
          },
          select: { id: true },
        });

        if (activeAttempt !== null) {
          return activeAttempt.id;
        }
      }

      throw error;
    }
  }

  private async loadStudentAttempt(
    studentId: string,
    attemptId: string,
    language: Language,
  ): Promise<StudentAttemptObject> {
    const serverTime = new Date();
    const attempt = await this.database.attempt.findFirst({
      where: { id: attemptId, studentId },
      include: {
        sectionNotes: { orderBy: { savedAt: 'asc' } },
        answers: {
          orderBy: { questionId: 'asc' },
          select: {
            questionId: true,
            responseMediaObjectId: true,
            savedAt: true,
            selectedOptionId: true,
            selections: {
              orderBy: { position: 'asc' },
              select: { answerOptionId: true },
            },
            textValue: true,
          },
        },
        testVersion: {
          include: {
            questions: {
              orderBy: { position: 'asc' },
              include: {
                options: {
                  orderBy: { position: 'asc' },
                  include: {
                    translations: {
                      where: { language },
                      select: { text: true },
                    },
                  },
                },
                translations: {
                  where: { language },
                  select: { prompt: true },
                },
              },
            },
            sections: {
              orderBy: { position: 'asc' },
              include: {
                blocks: {
                  where: {
                    kind: {
                      in: [
                        TestSectionBlockKind.TABLE,
                        TestSectionBlockKind.QUESTION_GROUP,
                      ],
                    },
                  },
                  orderBy: { position: 'asc' },
                  include: {
                    questions: {
                      orderBy: { position: 'asc' },
                      select: { questionId: true },
                    },
                    translations: {
                      where: { language },
                      select: { caption: true },
                    },
                  },
                },
                translations: {
                  where: { language },
                  select: {
                    content: true,
                    instructions: true,
                    title: true,
                  },
                },
              },
            },
            test: { select: { id: true, skill: true } },
            translations: {
              where: { language },
              select: { title: true },
            },
          },
        },
      },
    });

    if (attempt === null) {
      throw inaccessibleAttemptError();
    }

    const testTranslation = attempt.testVersion.translations[0];

    if (testTranslation === undefined) {
      throw unavailableTranslationError();
    }

    const questions = attempt.testVersion.questions.map((question) => {
      const questionTranslation = question.translations[0];

      if (questionTranslation === undefined) {
        throw unavailableTranslationError();
      }

      return {
        answerLimit: question.answerLimit,
        id: question.id,
        kind: question.kind,
        maxSelections: question.maxSelections,
        options: question.options.map((option) => {
          const optionTranslation = option.translations[0];

          if (optionTranslation === undefined) {
            throw unavailableTranslationError();
          }

          return {
            id: option.id,
            position: option.position,
            text: optionTranslation.text,
          };
        }),
        position: question.position,
        prompt: questionTranslation.prompt,
        sectionId: question.sectionId,
      };
    });

    const sections = attempt.testVersion.sections.map((section) => {
      const translation = section.translations[0];
      if (translation === undefined) {
        throw unavailableTranslationError();
      }
      return {
        blocks: section.blocks.map((block) => {
          const table = mapStudentTablePayload(block.tablePayload);
          return {
            caption: block.translations[0]?.caption ?? null,
            id: block.id,
            kind: block.kind,
            position: block.position,
            questionIds: block.questions.map(({ questionId }) => questionId),
            tableHeaderRows: table.headerRows.map((cells) => ({ cells })),
            tableRows: table.rows.map((cells) => ({ cells })),
          };
        }),
        content:
          attempt.testVersion.test.skill === null ||
          attempt.testVersion.test.skill === TestSkill.LISTENING
            ? null
            : translation.content,
        id: section.id,
        instructions: translation.instructions,
        mediaObjectId: section.mediaObjectId,
        position: section.position,
        title: translation.title,
      };
    });

    return {
      answers: attempt.answers.map((answer) => ({
        questionId: answer.questionId,
        responseMediaObjectId: answer.responseMediaObjectId,
        savedAt: answer.savedAt,
        selectedOptionId: answer.selectedOptionId,
        selectedOptionIds: answer.selections.map(
          (selection) => selection.answerOptionId,
        ),
        textValue: answer.textValue,
      })),
      attemptNumber: attempt.attemptNumber,
      expiresAt: attempt.expiresAt,
      id: attempt.id,
      language,
      notes: attempt.sectionNotes.map((note) => ({
        savedAt: note.savedAt,
        sectionId: note.sectionId,
        text: note.text,
      })),
      questions,
      result: mapResult(attempt),
      serverTime,
      sections,
      skill: attempt.testVersion.test.skill,
      startedAt: attempt.startedAt,
      status: attempt.status,
      submittedAt: attempt.submittedAt,
      testId: attempt.testVersion.test.id,
      testVersionId: attempt.testVersionId,
      title: testTranslation.title,
    };
  }

  private async ensureAttemptTranslation(
    studentId: string,
    attemptId: string,
    language: Language,
  ): Promise<void> {
    const attempt = await this.database.attempt.findFirst({
      where: { id: attemptId, studentId },
      select: {
        testVersion: {
          select: {
            questions: {
              select: {
                options: {
                  select: {
                    translations: {
                      where: { language },
                      select: { id: true },
                    },
                  },
                },
                translations: {
                  where: { language },
                  select: { id: true },
                },
              },
            },
            translations: {
              where: { language },
              select: { id: true },
            },
          },
        },
      },
    });

    if (attempt === null) {
      throw inaccessibleAttemptError();
    }

    if (!hasCompleteTranslation(attempt.testVersion)) {
      throw unavailableTranslationError();
    }
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

function mapStudentTablePayload(value: Prisma.JsonValue | null): {
  headerRows: string[][];
  rows: string[][];
} {
  if (value === null || Array.isArray(value) || typeof value !== 'object')
    return { headerRows: [], rows: [] };
  return {
    headerRows: parseStudentTableRows(value.headerRows),
    rows: parseStudentTableRows(value.rows),
  };
}

function parseStudentTableRows(
  value: Prisma.JsonValue | undefined,
): string[][] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is string[] =>
      Array.isArray(row) && row.every((cell) => typeof cell === 'string'),
  );
}

async function ensureOptionsBelongToQuestion(
  transaction: Prisma.TransactionClient,
  questionId: string,
  optionIds: readonly string[],
): Promise<void> {
  const count = await transaction.answerOption.count({
    where: { id: { in: [...optionIds] }, questionId },
  });
  if (count !== optionIds.length) {
    throw new ApplicationError(
      ErrorCode.BAD_USER_INPUT,
      'One or more selected options do not belong to this question',
      400,
    );
  }
}

function invalidResponseShapeError(): ApplicationError {
  return new ApplicationError(
    ErrorCode.BAD_USER_INPUT,
    'The saved response does not match this question type',
    400,
  );
}

function countWords(value: string): number {
  return value.split(/\s+/u).filter(Boolean).length;
}

function normalizeObjectiveText(value: string): string {
  return value.trim().toLocaleLowerCase('en').replace(/\s+/gu, ' ');
}

function sameStringSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

async function submitAttemptTransactionally(
  transaction: Prisma.TransactionClient,
  attemptId: string,
  reason: AttemptSubmissionReason,
  submittedAt: Date,
  correlationId: string | undefined,
): Promise<void> {
  const updated = await transaction.attempt.updateMany({
    where: { id: attemptId, status: AttemptStatus.IN_PROGRESS },
    data: {
      status: AttemptStatus.SUBMITTED,
      submittedAt,
      submissionReason: reason,
    },
  });

  if (updated.count === 0) {
    return;
  }

  await transaction.outboxEvent.create({
    data: {
      aggregateId: attemptId,
      correlationId: correlationId ?? null,
      eventType: OutboxEventType.ATTEMPT_SUBMITTED,
      payload: { attemptId },
      payloadVersion: 1,
    },
  });
}

function availableVersionWhere(now: Date) {
  return {
    AND: [
      {
        OR: [
          { availabilityStartsAt: null },
          { availabilityStartsAt: { lte: now } },
        ],
      },
      {
        OR: [{ availabilityEndsAt: null }, { availabilityEndsAt: { gt: now } }],
      },
    ],
    status: TestVersionStatus.PUBLISHED,
  };
}

function calculateExpiresAt(
  startedAt: Date,
  durationMinutes: number | null,
  availabilityEndsAt: Date | null,
): Date | null {
  const durationEnd =
    durationMinutes === null
      ? null
      : new Date(startedAt.getTime() + durationMinutes * 60_000);

  if (durationEnd === null) {
    return availabilityEndsAt;
  }

  if (availabilityEndsAt === null) {
    return durationEnd;
  }

  return durationEnd < availabilityEndsAt ? durationEnd : availabilityEndsAt;
}

interface ResultFields {
  readonly correctAnswerCount: number | null;
  readonly passed: boolean | null;
  readonly percentage: Prisma.Decimal | null;
  readonly status: AttemptStatus;
  readonly totalQuestionCount: number | null;
}

function mapResult(attempt: ResultFields) {
  if (attempt.status !== AttemptStatus.SCORED) {
    return null;
  }

  if (
    attempt.correctAnswerCount === null ||
    attempt.totalQuestionCount === null ||
    attempt.percentage === null ||
    attempt.passed === null
  ) {
    throw new ApplicationError(
      ErrorCode.INTERNAL_SERVER_ERROR,
      'The scored attempt is incomplete',
      500,
    );
  }

  return {
    correctAnswerCount: attempt.correctAnswerCount,
    passed: attempt.passed,
    percentage: attempt.percentage.toNumber(),
    totalQuestionCount: attempt.totalQuestionCount,
  };
}

function unavailableTestError(): ApplicationError {
  return new ApplicationError(
    ErrorCode.TEST_NOT_AVAILABLE,
    'The requested test is not available',
    409,
  );
}

function inaccessibleAttemptError(): ApplicationError {
  return new ApplicationError(
    ErrorCode.NOT_FOUND,
    'The requested attempt was not found',
    404,
  );
}

function unavailableTranslationError(): ApplicationError {
  return new ApplicationError(
    ErrorCode.TRANSLATION_NOT_AVAILABLE,
    'The requested test translation is not available',
    400,
  );
}

interface TranslatedVersionFields {
  readonly questions: readonly {
    readonly options: readonly {
      readonly translations: readonly { readonly id: string }[];
    }[];
    readonly translations: readonly { readonly id: string }[];
  }[];
  readonly translations: readonly { readonly id: string }[];
}

function hasCompleteTranslation(version: TranslatedVersionFields): boolean {
  return (
    version.translations.length === 1 &&
    version.questions.every(
      (question) =>
        question.translations.length === 1 &&
        question.options.every((option) => option.translations.length === 1),
    )
  );
}

function getPrismaErrorCode(error: unknown): string | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  const code = error.code;
  return typeof code === 'string' ? code : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

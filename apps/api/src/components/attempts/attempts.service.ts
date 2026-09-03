import {
  AttemptStatus,
  AttemptSubmissionReason,
  ContentStatus,
  Language,
  OutboxEventType,
  Prisma,
  TestVersionStatus,
} from '@best/database';
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import { ErrorCode } from '../../libs/enums/error-code.enum';
import { ApplicationError } from '../../libs/errors/application.error';
import { parseUuid } from '../../libs/pagination/cursor-pagination';
import type { SaveAttemptAnswerInput } from '../../schemas/attempts/save-attempt-answer.input';
import type { StartTestAttemptInput } from '../../schemas/attempts/start-test-attempt.input';
import type { StudentAttemptObject } from '../../schemas/attempts/student-attempt.object';
import type { SubmitTestAttemptInput } from '../../schemas/attempts/submit-test-attempt.input';

@Injectable()
export class AttemptsService {
  constructor(private readonly database: DatabaseService) {}

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
    const selectedOptionId = parseUuid(
      input.selectedOptionId,
      'selectedOptionId',
    );
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

      const option = await transaction.answerOption.findFirst({
        where: {
          id: selectedOptionId,
          questionId,
          question: { testVersionId: attempt.testVersion.id },
        },
        select: { id: true },
      });

      if (option === null) {
        throw new ApplicationError(
          ErrorCode.BAD_USER_INPUT,
          'The selected option does not belong to this attempt question',
          400,
        );
      }

      await transaction.attemptAnswer.upsert({
        where: { attemptId_questionId: { attemptId, questionId } },
        create: { attemptId, questionId, selectedOptionId, savedAt: now },
        update: { savedAt: now, selectedOptionId },
      });

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
        select: { id: true, status: true },
      });

      if (attempt === null) {
        throw inaccessibleAttemptError();
      }

      if (attempt.status === AttemptStatus.IN_PROGRESS) {
        await submitAttemptTransactionally(
          transaction,
          attemptId,
          AttemptSubmissionReason.MANUAL,
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
        answers: {
          orderBy: { questionId: 'asc' },
          select: {
            questionId: true,
            savedAt: true,
            selectedOptionId: true,
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
            test: { select: { id: true } },
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
        id: question.id,
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
      };
    });

    return {
      answers: attempt.answers,
      attemptNumber: attempt.attemptNumber,
      expiresAt: attempt.expiresAt,
      id: attempt.id,
      language,
      questions,
      result: mapResult(attempt),
      serverTime,
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

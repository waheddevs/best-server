import {
  AttemptStatus,
  AttemptSubmissionReason,
  ContentStatus,
  Language,
  Prisma,
  TestSkill,
} from '@best/database';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ErrorCode } from '../../libs/enums/error-code.enum';
import { ApplicationError } from '../../libs/errors/application.error';
import { parseUuid } from '../../libs/pagination/cursor-pagination';
import type { StudentAttemptObject } from '../../schemas/attempts/student-attempt.object';
import type { SubmitTestAttemptInput } from '../../schemas/attempts/submit-test-attempt.input';
import { AttemptReadService } from './attempt-read.service';
import { submitAttemptTransactionally } from './attempt-submission';
import {
  availableVersionWhere,
  calculateExpiresAt,
} from './attempt-availability';
import {
  unavailableTestError,
  inaccessibleAttemptError,
  unavailableTranslationError,
  getPrismaErrorCode,
} from './attempt-errors';

@Injectable()
export class AttemptLifecycleService {
  constructor(
    private readonly database: DatabaseService,
    private readonly attemptReadService: AttemptReadService,
  ) {}
  async discardTestAttempt(
    studentId: string,
    attemptIdInput: string,
    correlationId: string | undefined,
  ): Promise<boolean> {
    const attemptId = parseUuid(attemptIdInput, 'attemptId');
    return this.database.$transaction(async (transaction) => {
      // Serialize Exit with submission; completed attempts must never be removed.
      await transaction.$queryRaw`
        SELECT "id" FROM "attempts"
        WHERE "id" = ${attemptId}::uuid AND "student_id" = ${studentId}::uuid
        FOR UPDATE
      `;
      const attempt = await transaction.attempt.findFirst({
        where: { id: attemptId, studentId },
        select: { status: true, testVersionId: true, attemptNumber: true },
      });
      if (attempt === null) {
        // A retry after a lost response is safe only for this student's own Exit.
        const discarded = await transaction.auditLog.findFirst({
          where: {
            actorId: studentId,
            targetId: attemptId,
            action: 'ATTEMPT_DISCARDED',
          },
          select: { id: true },
        });
        if (discarded) return true;
        throw inaccessibleAttemptError();
      }
      if (attempt.status !== AttemptStatus.IN_PROGRESS) {
        throw new ApplicationError(
          ErrorCode.ATTEMPT_NOT_ACTIVE,
          'Only an unfinished attempt can be discarded',
          409,
        );
      }
      await transaction.attempt.delete({ where: { id: attemptId } });
      await transaction.auditLog.create({
        data: {
          actorId: studentId,
          action: 'ATTEMPT_DISCARDED',
          targetType: 'Attempt',
          targetId: attemptId,
          correlationId: correlationId ?? null,
          oldValues: {
            testVersionId: attempt.testVersionId,
            attemptNumber: attempt.attemptNumber,
          },
        },
      });
      // Answers, selections and notes cascade. Uploaded media is not deleted.
      return true;
    });
  }

  async submitTestAttempt(
    studentId: string,
    input: SubmitTestAttemptInput,
    correlationId: string | undefined,
    language: Language,
  ): Promise<StudentAttemptObject> {
    const attemptId = parseUuid(input.attemptId, 'attemptId');
    await this.attemptReadService.ensureAttemptTranslation(
      studentId,
      attemptId,
      language,
    );
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

    return this.attemptReadService.loadStudentAttempt(
      studentId,
      attemptId,
      language,
    );
  }

  async createOrResumeAttempt(
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
}

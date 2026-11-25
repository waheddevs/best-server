import { AttemptStatus, Language, Prisma, TestSkill } from '@best/database';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ErrorCode } from '../../libs/enums/error-code.enum';
import { ApplicationError } from '../../libs/errors/application.error';
import { parseUuid } from '../../libs/pagination/cursor-pagination';
import type { TeacherSpeakingAttemptReviewObject } from '../../schemas/results/teacher-speaking-attempt-review.object';
import type { TeacherWritingAttemptReviewObject } from '../../schemas/results/writing-attempt-review.object';
import type { SaveSpeakingAttemptReviewInput } from '../../schemas/results/save-speaking-attempt-review.input';
import type { SaveWritingAttemptReviewInput } from '../../schemas/results/save-writing-attempt-review.input';
import { AssetsService } from '../assets/assets.service';
import {
  parseWritingRubric,
  validateWritingTaskScores,
  writingPracticeBand,
  writingTaskBand,
} from './writing-review-rubric';
import {
  notFound,
  translationNotAvailable,
  reviewConflict,
} from './teacher-result-errors';
import { isIeltsBand, mapSpeakingReview } from './speaking-review-rubric';

@Injectable()
export class TeacherReviewService {
  constructor(
    private readonly database: DatabaseService,
    private readonly assetsService: AssetsService,
  ) {}
  async saveSpeakingAttemptReview(
    teacherId: string,
    input: SaveSpeakingAttemptReviewInput,
  ): Promise<void> {
    const attemptId = parseUuid(input.attemptId, 'attemptId');
    const scores = {
      fluencyCoherence: input.fluencyCoherence,
      grammaticalRangeAccuracy: input.grammaticalRangeAccuracy,
      lexicalResource: input.lexicalResource,
      pronunciation: input.pronunciation,
    };
    for (const value of [...Object.values(scores), input.practiceBand]) {
      if (!isIeltsBand(value)) {
        throw new ApplicationError(
          ErrorCode.BAD_USER_INPUT,
          'IELTS rubric scores must be half-band values from 0 to 9',
          400,
        );
      }
    }
    const feedback = input.feedback?.trim() ?? null;
    if (feedback !== null && feedback.length > 5000) {
      throw new ApplicationError(
        ErrorCode.BAD_USER_INPUT,
        'Feedback cannot exceed 5000 characters',
        400,
      );
    }
    const now = new Date();
    await this.database.$transaction(async (transaction) => {
      const attempt = await transaction.attempt.findFirst({
        where: {
          groupMembership: { group: { teacherId } },
          id: attemptId,
          status: {
            in: [AttemptStatus.SUBMITTED, AttemptStatus.REVIEW_REQUIRED],
          },
          testVersion: { test: { skill: TestSkill.SPEAKING } },
        },
        select: {
          testVersion: {
            select: {
              passingPercentage: true,
              _count: { select: { questions: true } },
            },
          },
        },
      });
      if (attempt === null) {
        throw notFound('Speaking attempt awaiting review');
      }
      await transaction.attemptReview.upsert({
        where: { attemptId },
        create: {
          attemptId,
          feedback,
          practiceBand: input.practiceBand,
          releasedAt: input.release ? now : null,
          reviewedAt: now,
          reviewerId: teacherId,
          rubricScores: scores,
          rubricVersion: 'ielts-speaking-v1',
        },
        update: {
          feedback,
          practiceBand: input.practiceBand,
          releasedAt: input.release ? now : null,
          reviewedAt: now,
          reviewerId: teacherId,
          rubricScores: scores,
          rubricVersion: 'ielts-speaking-v1',
        },
      });
      if (input.release) {
        await transaction.attempt.update({
          where: { id: attemptId },
          data: {
            correctAnswerCount: 0,
            passed:
              (input.practiceBand / 9) * 100 >=
              attempt.testVersion.passingPercentage,
            percentage: (input.practiceBand / 9) * 100,
            passingPercentage: attempt.testVersion.passingPercentage,
            scoringRuleVersion: 'manual-rubric-v1',
            status: AttemptStatus.SCORED,
            totalQuestionCount: attempt.testVersion._count.questions,
          },
        });
      }
      await transaction.auditLog.create({
        data: {
          action: input.release
            ? 'SPEAKING_REVIEW_RELEASED'
            : 'SPEAKING_REVIEW_SAVED',
          actorId: teacherId,
          newValues: { practiceBand: input.practiceBand, scores },
          targetId: attemptId,
          targetType: 'AttemptReview',
        },
      });
    });
  }

  async getSpeakingAttemptReview(
    teacherId: string,
    attemptIdInput: string,
    language: Language,
  ): Promise<TeacherSpeakingAttemptReviewObject> {
    const attemptId = parseUuid(attemptIdInput, 'attemptId');
    const attempt = await this.database.attempt.findFirst({
      where: {
        groupMembership: { group: { teacherId } },
        id: attemptId,
        status: {
          in: [
            AttemptStatus.SUBMITTED,
            AttemptStatus.REVIEW_REQUIRED,
            AttemptStatus.SCORED,
          ],
        },
        testVersion: { test: { skill: TestSkill.SPEAKING } },
      },
      include: {
        answers: { select: { questionId: true, responseMediaObjectId: true } },
        review: true,
        student: { select: { displayName: true } },
        testVersion: {
          include: {
            questions: {
              include: {
                section: { select: { position: true } },
                translations: {
                  where: { language },
                  select: { prompt: true },
                },
              },
              orderBy: { position: 'asc' },
            },
            translations: {
              where: { language },
              select: { title: true },
            },
          },
        },
      },
    });
    if (attempt === null) {
      throw notFound('Speaking attempt');
    }
    const title = attempt.testVersion.translations[0]?.title;
    if (title === undefined) {
      throw translationNotAvailable();
    }
    const answerByQuestion = new Map(
      attempt.answers.map((answer) => [answer.questionId, answer]),
    );
    const answers = await Promise.all(
      attempt.testVersion.questions.map(async (question) => {
        const prompt = question.translations[0]?.prompt;
        if (prompt === undefined) {
          throw translationNotAvailable();
        }
        if (question.section === null) {
          throw new ApplicationError(
            ErrorCode.INTERNAL_SERVER_ERROR,
            'The Speaking question is missing its section',
            500,
          );
        }
        const mediaObjectId =
          answerByQuestion.get(question.id)?.responseMediaObjectId ?? null;
        const intent =
          mediaObjectId === null
            ? null
            : await this.assetsService.createAuthorizedMediaDownloadIntent(
                mediaObjectId,
              );
        return {
          audioUrl: intent?.url ?? null,
          audioUrlExpiresAt: intent?.expiresAt ?? null,
          position: question.position,
          prompt,
          questionId: question.id,
          responseMediaObjectId: mediaObjectId,
          sectionPosition: question.section.position,
        };
      }),
    );
    return {
      answers,
      attemptId: attempt.id,
      review: mapSpeakingReview(attempt.review),
      status: attempt.status,
      studentDisplayName: attempt.student.displayName,
      title,
    };
  }

  async saveWritingAttemptReview(
    teacherId: string,
    input: SaveWritingAttemptReviewInput,
  ): Promise<void> {
    const attemptId = parseUuid(input.attemptId, 'attemptId');
    const task1 = {
      taskAchievement: input.task1.taskAchievement,
      coherenceCohesion: input.task1.coherenceCohesion,
      lexicalResource: input.task1.lexicalResource,
      grammaticalRangeAccuracy: input.task1.grammaticalRangeAccuracy,
      feedback: input.task1.feedback?.trim() ?? null,
    };
    const task2 = {
      taskAchievement: input.task2.taskAchievement,
      coherenceCohesion: input.task2.coherenceCohesion,
      lexicalResource: input.task2.lexicalResource,
      grammaticalRangeAccuracy: input.task2.grammaticalRangeAccuracy,
      feedback: input.task2.feedback?.trim() ?? null,
    };
    validateWritingTaskScores(task1);
    validateWritingTaskScores(task2);
    const feedback = input.feedback?.trim() ?? null;
    if (feedback !== null && feedback.length > 5000) {
      throw new ApplicationError(
        ErrorCode.BAD_USER_INPUT,
        'Feedback is too long',
        400,
      );
    }
    const practiceBand = writingPracticeBand(task1, task2);
    const now = new Date();
    try {
      await this.database.$transaction(async (transaction) => {
        const attempt = await transaction.attempt.findFirst({
          where: {
            groupMembership: { group: { teacherId } },
            id: attemptId,
            status: {
              in: [AttemptStatus.SUBMITTED, AttemptStatus.REVIEW_REQUIRED],
            },
            testVersion: { test: { skill: TestSkill.WRITING } },
          },
          select: {
            review: { select: { updatedAt: true } },
            testVersion: {
              select: {
                passingPercentage: true,
                _count: { select: { questions: true } },
              },
            },
          },
        });
        if (attempt === null) throw notFound('Writing attempt awaiting review');
        const previous = attempt.review;
        if (previous === null) {
          if (input.expectedUpdatedAt !== undefined) throw reviewConflict();
          await transaction.attemptReview.create({
            data: {
              attemptId,
              feedback,
              practiceBand,
              releasedAt: input.release ? now : null,
              reviewedAt: now,
              reviewerId: teacherId,
              rubricScores: { task1, task2 },
              rubricVersion: 'ielts-academic-writing-v1',
            },
          });
        } else {
          if (
            input.expectedUpdatedAt?.getTime() !== previous.updatedAt.getTime()
          ) {
            throw reviewConflict();
          }
          const updated = await transaction.attemptReview.updateMany({
            where: { attemptId, updatedAt: previous.updatedAt },
            data: {
              feedback,
              practiceBand,
              releasedAt: input.release ? now : null,
              reviewedAt: now,
              reviewerId: teacherId,
              rubricScores: { task1, task2 },
              rubricVersion: 'ielts-academic-writing-v1',
            },
          });
          if (updated.count !== 1) throw reviewConflict();
        }
        if (input.release) {
          await transaction.attempt.update({
            where: { id: attemptId },
            data: {
              correctAnswerCount: 0,
              passed:
                (practiceBand / 9) * 100 >=
                attempt.testVersion.passingPercentage,
              percentage: (practiceBand / 9) * 100,
              passingPercentage: attempt.testVersion.passingPercentage,
              scoringRuleVersion: 'manual-rubric-v1',
              status: AttemptStatus.SCORED,
              totalQuestionCount: attempt.testVersion._count.questions,
            },
          });
        }
        await transaction.auditLog.create({
          data: {
            action: input.release
              ? 'WRITING_REVIEW_RELEASED'
              : 'WRITING_REVIEW_SAVED',
            actorId: teacherId,
            newValues: { practiceBand, task1, task2 },
            targetId: attemptId,
            targetType: 'AttemptReview',
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034')
      ) {
        throw reviewConflict();
      }
      throw error;
    }
  }

  async getWritingAttemptReview(
    teacherId: string,
    attemptIdInput: string,
    language: Language,
  ): Promise<TeacherWritingAttemptReviewObject> {
    const attemptId = parseUuid(attemptIdInput, 'attemptId');
    const attempt = await this.database.attempt.findFirst({
      where: {
        groupMembership: { group: { teacherId } },
        id: attemptId,
        status: {
          in: [
            AttemptStatus.SUBMITTED,
            AttemptStatus.REVIEW_REQUIRED,
            AttemptStatus.SCORED,
          ],
        },
        testVersion: { test: { skill: TestSkill.WRITING } },
      },
      include: {
        answers: { select: { questionId: true, textValue: true } },
        review: true,
        student: { select: { displayName: true } },
        testVersion: {
          include: {
            questions: {
              include: {
                section: { select: { position: true } },
                translations: { where: { language }, select: { prompt: true } },
              },
              orderBy: { position: 'asc' },
            },
            translations: { where: { language }, select: { title: true } },
          },
        },
      },
    });
    if (attempt === null) throw notFound('Writing attempt');
    const title = attempt.testVersion.translations[0]?.title;
    if (title === undefined) throw translationNotAvailable();
    const answerByQuestion = new Map(
      attempt.answers.map((answer) => [answer.questionId, answer.textValue]),
    );
    const answers = attempt.testVersion.questions.map((question) => {
      const prompt = question.translations[0]?.prompt;
      if (prompt === undefined || question.section === null)
        throw translationNotAvailable();
      return {
        questionId: question.id,
        sectionPosition: question.section.position,
        prompt,
        textValue: answerByQuestion.get(question.id) ?? null,
      };
    });
    const review = attempt.review;
    const rubric =
      review === null ? null : parseWritingRubric(review.rubricScores);
    return {
      answers,
      attemptId: attempt.id,
      review:
        review === null || rubric === null
          ? null
          : {
              feedback: review.feedback,
              practiceBand: review.practiceBand.toNumber(),
              releasedAt: review.releasedAt,
              reviewedAt: review.reviewedAt,
              updatedAt: review.updatedAt,
              task1: { ...rubric.task1, band: writingTaskBand(rubric.task1) },
              task2: { ...rubric.task2, band: writingTaskBand(rubric.task2) },
            },
      status: attempt.status,
      studentDisplayName: attempt.student.displayName,
      title,
    };
  }
}

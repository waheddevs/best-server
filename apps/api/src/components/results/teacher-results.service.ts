import {
  AttemptStatus,
  ContentStatus,
  Language,
  Prisma,
  TestSkill,
  TestVersionStatus,
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
import type { TeacherAttemptConnectionObject } from '../../schemas/results/teacher-attempt.object';
import type { TeacherResultInboxConnectionObject } from '../../schemas/results/teacher-result-inbox.object';
import type { TeacherObjectiveAttemptResultObject } from '../../schemas/results/teacher-objective-attempt-result.object';
import type { TeacherAttemptReviewObject } from '../../schemas/results/teacher-attempt-review.object';
import type { TeacherSpeakingAttemptReviewObject } from '../../schemas/results/teacher-speaking-attempt-review.object';
import type { TeacherWritingAttemptReviewObject } from '../../schemas/results/writing-attempt-review.object';
import type { SaveSpeakingAttemptReviewInput } from '../../schemas/results/save-speaking-attempt-review.input';
import type { SaveWritingAttemptReviewInput } from '../../schemas/results/save-writing-attempt-review.input';
import type { TeacherGroupProgressObject } from '../../schemas/results/teacher-group-progress.object';
import type { TeacherStudentProgressConnectionObject } from '../../schemas/results/teacher-student-progress.object';
import { TeacherStudentTestProgressStatus } from '../../schemas/results/teacher-student-test-progress.enum';
import { AssetsService } from '../assets/assets.service';
import type { TeacherStudentTestProgressConnectionObject } from '../../schemas/results/teacher-student-test-progress.object';

import {
  calculateProgress,
  type ProgressAttempt,
  type ProgressMetrics,
} from './results-progress';
import {
  parseWritingRubric,
  validateWritingTaskScores,
  writingPracticeBand,
  writingTaskBand,
} from './writing-review-rubric';

@Injectable()
export class TeacherResultsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly assetsService: AssetsService,
  ) {}

  async getResultAttemptSkill(
    teacherId: string,
    attemptIdInput: string,
  ): Promise<TestSkill> {
    const attemptId = parseUuid(attemptIdInput, 'attemptId');
    const attempt = await this.database.attempt.findFirst({
      where: {
        id: attemptId,
        groupMembership: { group: { teacherId } },
        status: {
          in: [
            AttemptStatus.SUBMITTED,
            AttemptStatus.REVIEW_REQUIRED,
            AttemptStatus.SCORED,
          ],
        },
      },
      select: {
        testVersion: { select: { test: { select: { skill: true } } } },
      },
    });
    if (attempt?.testVersion.test.skill == null) throw notFound('Result');
    return attempt.testVersion.test.skill;
  }

  async getObjectiveAttemptResult(
    teacherId: string,
    attemptIdInput: string,
    language: Language,
  ): Promise<TeacherObjectiveAttemptResultObject> {
    const attemptId = parseUuid(attemptIdInput, 'attemptId');
    const attempt = await this.database.attempt.findFirst({
      where: {
        id: attemptId,
        status: AttemptStatus.SCORED,
        groupMembership: { group: { teacherId } },
        testVersion: {
          test: { skill: { in: [TestSkill.LISTENING, TestSkill.READING] } },
        },
      },
      include: {
        answers: {
          include: {
            selectedOption: {
              include: { translations: { where: { language } } },
            },
            selections: {
              include: {
                answerOption: {
                  include: { translations: { where: { language } } },
                },
              },
              orderBy: { position: 'asc' },
            },
          },
        },
        student: { select: { displayName: true } },
        testVersion: {
          include: {
            test: { select: { skill: true } },
            translations: { where: { language }, select: { title: true } },
            questions: {
              orderBy: { position: 'asc' },
              include: {
                acceptedAnswers: { orderBy: { position: 'asc' } },
                options: {
                  orderBy: { position: 'asc' },
                  include: {
                    translations: {
                      where: { language },
                      select: { text: true },
                    },
                  },
                },
                translations: { where: { language }, select: { prompt: true } },
              },
            },
          },
        },
      },
    });
    if (attempt === null) throw notFound('Objective result');
    const title = attempt.testVersion.translations[0]?.title;
    if (
      title === undefined ||
      attempt.percentage === null ||
      attempt.correctAnswerCount === null ||
      attempt.totalQuestionCount === null ||
      attempt.testVersion.test.skill === null
    ) {
      throw translationNotAvailable();
    }
    const answerByQuestion = new Map(
      attempt.answers.map((answer) => [answer.questionId, answer]),
    );
    const answers = attempt.testVersion.questions.map((question) => {
      const prompt = question.translations[0]?.prompt;
      if (prompt === undefined) throw translationNotAvailable();
      const response = answerByQuestion.get(question.id);
      const correctOptions = question.options.filter(
        (option) => option.isCorrect,
      );
      const correctIds = correctOptions.map((option) => option.id).sort();
      const selectedIds = [
        ...(response?.selectedOptionId ? [response.selectedOptionId] : []),
        ...(response?.selections.map((selection) => selection.answerOptionId) ??
          []),
      ].sort();
      const correctAnswer =
        question.acceptedAnswers.length > 0
          ? question.acceptedAnswers.map((answer) => answer.displayValue)
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
          ? question.acceptedAnswers.some(
              (answer) =>
                answer.normalizedValue ===
                normalizeObjectiveText(response?.textValue ?? ''),
            )
          : correctIds.length === selectedIds.length &&
            correctIds.every((id, index) => id === selectedIds[index]);
      return {
        correctAnswer,
        isCorrect,
        position: question.position,
        prompt,
        studentAnswer,
      };
    });
    return {
      answers,
      attemptId: attempt.id,
      correctAnswerCount: attempt.correctAnswerCount,
      percentage: attempt.percentage.toNumber(),
      skill: attempt.testVersion.test.skill,
      studentDisplayName: attempt.student.displayName,
      title,
      totalQuestionCount: attempt.totalQuestionCount,
    };
  }

  async getResultInbox(
    teacherId: string,
    language: Language,
    groupIdInput: string | undefined,
    paperIdInput: string | undefined,
    skill: TestSkill | undefined,
    status: AttemptStatus | undefined,
    searchInput: string | undefined,
    first: number | undefined,
    after: string | undefined,
  ): Promise<TeacherResultInboxConnectionObject> {
    const groupId =
      groupIdInput === undefined
        ? undefined
        : parseUuid(groupIdInput, 'groupId');
    const paperId =
      paperIdInput === undefined
        ? undefined
        : parseUuid(paperIdInput, 'paperId');
    if (groupId !== undefined) await this.requireOwnedGroup(teacherId, groupId);
    if (paperId !== undefined) {
      const paper = await this.database.testPaper.findFirst({
        where: { id: paperId, group: { teacherId } },
        select: { id: true },
      });
      if (paper === null) throw notFound('Practice test');
    }
    const search = searchInput?.trim();
    if (search !== undefined && search.length > 80) {
      throw new ApplicationError(
        ErrorCode.BAD_USER_INPUT,
        'search is too long',
        400,
      );
    }
    const pageSize = parsePageSize(first);
    const afterId = decodeCursor(after);
    const where: Prisma.AttemptWhereInput = {
      groupMembership: {
        group: { teacherId, ...(groupId ? { id: groupId } : {}) },
      },
      ...(search
        ? {
            student: { displayName: { contains: search, mode: 'insensitive' } },
          }
        : {}),
      status: status ?? {
        in: [
          AttemptStatus.SUBMITTED,
          AttemptStatus.REVIEW_REQUIRED,
          AttemptStatus.SCORED,
        ],
      },
      submittedAt: { not: null },
      testVersion: {
        test: { ...(paperId ? { paperId } : {}), ...(skill ? { skill } : {}) },
      },
    };
    const [attempts, pendingReviewCount] = await Promise.all([
      this.database.attempt.findMany({
        where,
        include: {
          groupMembership: {
            include: { group: { select: { id: true, name: true } } },
          },
          review: { select: { practiceBand: true, releasedAt: true } },
          student: { select: { displayName: true } },
          testVersion: {
            include: {
              test: {
                include: {
                  paper: { select: { id: true, practiceNumber: true } },
                },
              },
              translations: { where: { language }, select: { title: true } },
            },
          },
        },
        orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
        ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
        take: pageSize + 1,
      }),
      skill === TestSkill.LISTENING || skill === TestSkill.READING
        ? Promise.resolve(0)
        : this.database.attempt.count({
            where: {
              ...where,
              status: {
                in: [AttemptStatus.SUBMITTED, AttemptStatus.REVIEW_REQUIRED],
              },
              testVersion: {
                test: {
                  ...(paperId ? { paperId } : {}),
                  skill: skill ?? {
                    in: [TestSkill.WRITING, TestSkill.SPEAKING],
                  },
                },
              },
            },
          }),
    ]);
    const hasNextPage = attempts.length > pageSize;
    const page = hasNextPage ? attempts.slice(0, pageSize) : attempts;
    const edges = page.map((attempt) => {
      const title = attempt.testVersion.translations[0]?.title;
      if (title === undefined || attempt.submittedAt === null)
        throw translationNotAvailable();
      return {
        cursor: encodeCursor(attempt.id),
        node: {
          attemptId: attempt.id,
          attemptNumber: attempt.attemptNumber,
          groupId: attempt.groupMembership.group.id,
          groupName: attempt.groupMembership.group.name,
          paperId: attempt.testVersion.test.paper?.id ?? null,
          percentage: attempt.percentage?.toNumber() ?? null,
          practiceBand: attempt.review?.practiceBand.toNumber() ?? null,
          practiceNumber:
            attempt.testVersion.test.paper?.practiceNumber ?? null,
          releasedAt: attempt.review?.releasedAt ?? null,
          skill: attempt.testVersion.test.skill,
          status: attempt.status,
          studentDisplayName: attempt.student.displayName,
          studentId: attempt.studentId,
          submittedAt: attempt.submittedAt,
          title,
        },
      };
    });
    return {
      edges,
      pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
      pendingReviewCount,
    };
  }

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

  async getGroupProgress(
    teacherId: string,
    groupIdInput: string,
  ): Promise<TeacherGroupProgressObject> {
    const group = await this.requireOwnedGroup(teacherId, groupIdInput);
    const [assignedTestIds, memberships] = await Promise.all([
      this.getAssignedTestIds(group.id),
      this.database.groupMembership.findMany({
        where: { endedAt: null, groupId: group.id },
        select: { id: true },
      }),
    ]);
    const membershipIds = memberships.map(({ id }) => id);
    const attempts =
      membershipIds.length === 0 || assignedTestIds.length === 0
        ? []
        : await this.database.attempt.findMany({
            where: {
              groupMembershipId: { in: membershipIds },
              testVersion: { testId: { in: assignedTestIds } },
            },
            select: {
              groupMembershipId: true,
              passed: true,
              percentage: true,
              status: true,
              testVersion: { select: { testId: true } },
              updatedAt: true,
            },
          });
    const progress = calculateProgress(
      membershipIds.length * assignedTestIds.length,
      attempts.map((attempt) => ({
        assignmentKey: `${attempt.groupMembershipId}:${attempt.testVersion.testId}`,
        passed: attempt.passed,
        percentage: attempt.percentage,
        status: attempt.status,
        updatedAt: attempt.updatedAt,
      })),
    );

    return {
      activeStudentCount: membershipIds.length,
      assignedTestCount: assignedTestIds.length,
      averagePercentage: progress.averagePercentage,
      awaitingScoreAssignmentCount: progress.awaitingScoreCount,
      completedAssignmentCount: progress.completedCount,
      completionPercentage: progress.completionPercentage,
      failedAssignmentCount: progress.failedCount,
      groupId: group.id,
      groupName: group.name,
      highestPercentage: progress.highestPercentage,
      lowestPercentage: progress.lowestPercentage,
      passedAssignmentCount: progress.passedCount,
      remainingAssignmentCount: progress.remainingCount,
      scoredAssignmentCount: progress.scoredCount,
      totalAssignmentCount: progress.assignedCount,
    };
  }

  async getGroupStudents(
    teacherId: string,
    groupIdInput: string,
    first: number | undefined,
    after: string | undefined,
  ): Promise<TeacherStudentProgressConnectionObject> {
    const group = await this.requireOwnedGroup(teacherId, groupIdInput);
    const pageSize = parsePageSize(first);
    const afterId = decodeCursor(after);
    const [assignedTestIds, memberships] = await Promise.all([
      this.getAssignedTestIds(group.id),
      this.database.groupMembership.findMany({
        where: {
          ...(afterId === undefined ? {} : { id: { gt: afterId } }),
          endedAt: null,
          groupId: group.id,
        },
        include: { student: { select: { displayName: true, id: true } } },
        orderBy: { id: 'asc' },
        take: pageSize + 1,
      }),
    ]);
    const hasNextPage = memberships.length > pageSize;
    const page = hasNextPage ? memberships.slice(0, pageSize) : memberships;
    const membershipIds = page.map(({ id }) => id);
    const attempts =
      membershipIds.length === 0 || assignedTestIds.length === 0
        ? []
        : await this.database.attempt.findMany({
            where: {
              groupMembershipId: { in: membershipIds },
              testVersion: { testId: { in: assignedTestIds } },
            },
            select: {
              groupMembershipId: true,
              passed: true,
              percentage: true,
              status: true,
              testVersion: { select: { testId: true } },
              updatedAt: true,
            },
          });
    const attemptsByMembershipId = new Map<string, ProgressAttempt[]>();

    for (const attempt of attempts) {
      const values =
        attemptsByMembershipId.get(attempt.groupMembershipId) ?? [];
      values.push({
        assignmentKey: attempt.testVersion.testId,
        passed: attempt.passed,
        percentage: attempt.percentage,
        status: attempt.status,
        updatedAt: attempt.updatedAt,
      });
      attemptsByMembershipId.set(attempt.groupMembershipId, values);
    }

    const edges = page.map((membership) => {
      const progress = calculateProgress(
        assignedTestIds.length,
        attemptsByMembershipId.get(membership.id) ?? [],
      );

      return {
        cursor: encodeCursor(membership.id),
        node: {
          assignedTestCount: progress.assignedCount,
          averagePercentage: progress.averagePercentage,
          awaitingScoreTestCount: progress.awaitingScoreCount,
          completedTestCount: progress.completedCount,
          completionPercentage: progress.completionPercentage,
          displayName: membership.student.displayName,
          failedTestCount: progress.failedCount,
          highestPercentage: progress.highestPercentage,
          latestActivityAt: progress.latestActivityAt,
          lowestPercentage: progress.lowestPercentage,
          passedTestCount: progress.passedCount,
          remainingTestCount: progress.remainingCount,
          scoredTestCount: progress.scoredCount,
          studentId: membership.student.id,
        },
      };
    });

    return {
      edges,
      pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
    };
  }

  async getStudentTests(
    teacherId: string,
    groupIdInput: string,
    studentIdInput: string,
    language: Language,
    first: number | undefined,
    after: string | undefined,
  ): Promise<TeacherStudentTestProgressConnectionObject> {
    const group = await this.requireOwnedGroup(teacherId, groupIdInput);
    const studentId = parseUuid(studentIdInput, 'studentId');
    const membership = await this.database.groupMembership.findFirst({
      where: { endedAt: null, groupId: group.id, studentId },
      select: { id: true },
    });

    if (membership === null) {
      throw notFound('Group Student');
    }

    const pageSize = parsePageSize(first);
    const afterId = decodeCursor(after);
    const now = new Date();
    const tests = await this.database.test.findMany({
      where: {
        ...(afterId === undefined ? {} : { id: { gt: afterId } }),
        groupId: group.id,
        status: ContentStatus.ACTIVE,
        versions: {
          some: {
            OR: [
              { availabilityStartsAt: null },
              { availabilityStartsAt: { lte: now } },
            ],
            status: TestVersionStatus.PUBLISHED,
          },
        },
      },
      include: {
        versions: {
          where: {
            OR: [
              { availabilityStartsAt: null },
              { availabilityStartsAt: { lte: now } },
            ],
            status: TestVersionStatus.PUBLISHED,
          },
          orderBy: { version: 'desc' },
          take: 1,
          select: {
            translations: {
              where: { language },
              select: { title: true },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
      take: pageSize + 1,
    });
    const hasNextPage = tests.length > pageSize;
    const page = hasNextPage ? tests.slice(0, pageSize) : tests;
    const testIds = page.map(({ id }) => id);
    const attempts =
      testIds.length === 0
        ? []
        : await this.database.attempt.findMany({
            where: {
              groupMembershipId: membership.id,
              testVersion: { testId: { in: testIds } },
            },
            select: {
              passed: true,
              percentage: true,
              status: true,
              testVersion: { select: { testId: true } },
              updatedAt: true,
            },
          });
    const attemptsByTestId = new Map<string, typeof attempts>();

    for (const attempt of attempts) {
      const testId = attempt.testVersion.testId;
      const values = attemptsByTestId.get(testId) ?? [];
      values.push(attempt);
      attemptsByTestId.set(testId, values);
    }

    const edges = page.map((test) => {
      const title = test.versions[0]?.translations[0]?.title;

      if (title === undefined) {
        throw translationNotAvailable();
      }

      const testAttempts = attemptsByTestId.get(test.id) ?? [];
      const progress = calculateProgress(
        1,
        testAttempts.map((attempt) => ({
          assignmentKey: test.id,
          passed: attempt.passed,
          percentage: attempt.percentage,
          status: attempt.status,
          updatedAt: attempt.updatedAt,
        })),
      );

      return {
        cursor: encodeCursor(test.id),
        node: {
          attemptCount: testAttempts.length,
          highestPercentage: progress.highestPercentage,
          latestActivityAt: progress.latestActivityAt,
          status: resolveTestProgressStatus(testAttempts, progress),
          testId: test.id,
          title,
        },
      };
    });

    return {
      edges,
      pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
    };
  }

  async getStudentAttempts(
    teacherId: string,
    groupIdInput: string,
    studentIdInput: string,
    language: Language,
    first: number | undefined,
    after: string | undefined,
  ): Promise<TeacherAttemptConnectionObject> {
    const group = await this.requireOwnedGroup(teacherId, groupIdInput);
    const studentId = parseUuid(studentIdInput, 'studentId');
    const membershipExists = await this.database.groupMembership.findFirst({
      where: { groupId: group.id, studentId },
      select: { id: true },
    });

    if (membershipExists === null) {
      throw notFound('Group Student');
    }

    const pageSize = parsePageSize(first);
    const afterId = decodeCursor(after);
    const attempts = await this.database.attempt.findMany({
      where: {
        ...(afterId === undefined ? {} : { id: { gt: afterId } }),
        groupMembership: { groupId: group.id },
        studentId,
      },
      include: {
        testVersion: {
          include: {
            test: { select: { id: true, skill: true } },
            translations: {
              where: { language },
              select: { title: true },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
      take: pageSize + 1,
    });
    const hasNextPage = attempts.length > pageSize;
    const page = hasNextPage ? attempts.slice(0, pageSize) : attempts;
    const edges = page.map((attempt) => {
      const title = attempt.testVersion.translations[0]?.title;

      if (title === undefined) {
        throw translationNotAvailable();
      }

      return {
        cursor: encodeCursor(attempt.id),
        node: {
          attemptId: attempt.id,
          attemptNumber: attempt.attemptNumber,
          passed: attempt.passed,
          percentage: attempt.percentage?.toNumber() ?? null,
          skill: attempt.testVersion.test.skill,
          startedAt: attempt.startedAt,
          status: attempt.status,
          submittedAt: attempt.submittedAt,
          testId: attempt.testVersion.test.id,
          title,
        },
      };
    });

    return {
      edges,
      pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
    };
  }

  async getAttemptReview(
    teacherId: string,
    attemptIdInput: string,
    language: Language,
  ): Promise<TeacherAttemptReviewObject> {
    const attemptId = parseUuid(attemptIdInput, 'attemptId');
    const attempt = await this.database.attempt.findFirst({
      where: { groupMembership: { group: { teacherId } }, id: attemptId },
      include: {
        answers: { select: { questionId: true, selectedOptionId: true } },
        student: { select: { displayName: true, id: true } },
        testVersion: {
          include: {
            questions: {
              include: {
                options: {
                  include: {
                    translations: {
                      where: { language },
                      select: { text: true },
                    },
                  },
                  orderBy: { position: 'asc' },
                },
                translations: {
                  where: { language },
                  select: { prompt: true },
                },
              },
              orderBy: { position: 'asc' },
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
      throw notFound('Attempt');
    }

    const title = attempt.testVersion.translations[0]?.title;

    if (title === undefined) {
      throw translationNotAvailable();
    }

    const selectedOptionByQuestionId = new Map(
      attempt.answers.map((answer) => [
        answer.questionId,
        answer.selectedOptionId,
      ]),
    );
    const answers = attempt.testVersion.questions.map((question) => {
      const prompt = question.translations[0]?.prompt;
      const correctOption = question.options.find(({ isCorrect }) => isCorrect);
      const selectedOptionId =
        selectedOptionByQuestionId.get(question.id) ?? null;
      const selectedOption =
        selectedOptionId === null
          ? undefined
          : question.options.find(({ id }) => id === selectedOptionId);
      const selectedOptionText = selectedOption?.translations[0]?.text;
      const correctOptionText = correctOption?.translations[0]?.text;
      const selectedTranslationMissing =
        selectedOptionId === null ? false : selectedOptionText === undefined;

      if (
        prompt === undefined ||
        correctOption === undefined ||
        correctOptionText === undefined ||
        selectedTranslationMissing
      ) {
        throw translationNotAvailable();
      }

      return {
        correctOptionId: correctOption.id,
        correctOptionText,
        isCorrect: selectedOptionId === correctOption.id,
        position: question.position,
        prompt,
        questionId: question.id,
        selectedOptionId,
        selectedOptionText: selectedOptionText ?? null,
      };
    });

    return {
      answers,
      attemptId: attempt.id,
      attemptNumber: attempt.attemptNumber,
      passed: attempt.passed,
      percentage: attempt.percentage?.toNumber() ?? null,
      startedAt: attempt.startedAt,
      status: attempt.status,
      studentDisplayName: attempt.student.displayName,
      studentId: attempt.student.id,
      submittedAt: attempt.submittedAt,
      testId: attempt.testVersion.test.id,
      title,
    };
  }

  private async requireOwnedGroup(teacherId: string, groupIdInput: string) {
    const groupId = parseUuid(groupIdInput, 'groupId');
    const group = await this.database.group.findFirst({
      where: { id: groupId, teacherId },
      select: { id: true, name: true },
    });

    if (group === null) {
      throw notFound('Group');
    }

    return group;
  }

  private async getAssignedTestIds(groupId: string): Promise<string[]> {
    const now = new Date();
    const tests = await this.database.test.findMany({
      where: {
        groupId,
        status: ContentStatus.ACTIVE,
        versions: {
          some: {
            OR: [
              { availabilityStartsAt: null },
              { availabilityStartsAt: { lte: now } },
            ],
            status: TestVersionStatus.PUBLISHED,
          },
        },
      },
      select: { id: true },
    });

    return tests.map(({ id }) => id);
  }
}

function notFound(resourceName: string): ApplicationError {
  return new ApplicationError(
    ErrorCode.NOT_FOUND,
    `${resourceName} was not found`,
    404,
  );
}

function translationNotAvailable(): ApplicationError {
  return new ApplicationError(
    ErrorCode.TRANSLATION_NOT_AVAILABLE,
    'The requested result translation is not available',
    400,
  );
}

function reviewConflict(): ApplicationError {
  return new ApplicationError(
    ErrorCode.CONFLICT,
    'The Writing review changed in another session. Reload before saving.',
    409,
  );
}

function isIeltsBand(value: number): boolean {
  return (
    Number.isFinite(value) && value >= 0 && value <= 9 && (value * 2) % 1 === 0
  );
}

function mapSpeakingReview(
  review: {
    feedback: string | null;
    practiceBand: { toNumber(): number };
    releasedAt: Date | null;
    reviewedAt: Date;
    rubricScores: unknown;
  } | null,
) {
  if (review === null) {
    return null;
  }
  const scores = review.rubricScores;
  if (!isRecord(scores)) {
    throw new ApplicationError(
      ErrorCode.INTERNAL_SERVER_ERROR,
      'The Speaking review rubric is invalid',
      500,
    );
  }
  return {
    feedback: review.feedback,
    fluencyCoherence: requireRubricScore(scores, 'fluencyCoherence'),
    grammaticalRangeAccuracy: requireRubricScore(
      scores,
      'grammaticalRangeAccuracy',
    ),
    lexicalResource: requireRubricScore(scores, 'lexicalResource'),
    practiceBand: review.practiceBand.toNumber(),
    pronunciation: requireRubricScore(scores, 'pronunciation'),
    releasedAt: review.releasedAt,
    reviewedAt: review.reviewedAt,
  };
}

function requireRubricScore(
  scores: Record<string, unknown>,
  key: string,
): number {
  const value = scores[key];
  if (typeof value !== 'number' || !isIeltsBand(value)) {
    throw new ApplicationError(
      ErrorCode.INTERNAL_SERVER_ERROR,
      'The Speaking review rubric is invalid',
      500,
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeObjectiveText(value: string): string {
  return value.trim().toLocaleLowerCase('en').replace(/\s+/gu, ' ');
}

function resolveTestProgressStatus(
  attempts: readonly { readonly status: AttemptStatus }[],
  progress: ProgressMetrics,
): TeacherStudentTestProgressStatus {
  if (
    attempts.some(
      ({ status }) =>
        status === AttemptStatus.SUBMITTED ||
        status === AttemptStatus.REVIEW_REQUIRED,
    )
  ) {
    return TeacherStudentTestProgressStatus.AWAITING_SCORE;
  }

  if (progress.scoredCount > 0) {
    return progress.passedCount > 0
      ? TeacherStudentTestProgressStatus.PASSED
      : TeacherStudentTestProgressStatus.FAILED;
  }

  if (attempts.some(({ status }) => status === AttemptStatus.IN_PROGRESS)) {
    return TeacherStudentTestProgressStatus.IN_PROGRESS;
  }

  return TeacherStudentTestProgressStatus.NOT_STARTED;
}

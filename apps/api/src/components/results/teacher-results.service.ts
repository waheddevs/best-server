import { AttemptStatus, Language, Prisma, TestSkill } from '@best/database';
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
import type { TeacherStudentTestProgressConnectionObject } from '../../schemas/results/teacher-student-test-progress.object';
import { normalizeObjectiveText } from '@best/scoring';
import { TeacherProgressService } from './teacher-progress.service';
import { TeacherReviewService } from './teacher-review.service';
import { notFound, translationNotAvailable } from './teacher-result-errors';

@Injectable()
export class TeacherResultsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly teacherProgressService: TeacherProgressService,
    private readonly teacherReviewService: TeacherReviewService,
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
    if (groupId !== undefined)
      await this.teacherProgressService.requireOwnedGroup(teacherId, groupId);
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
    return this.teacherReviewService.saveSpeakingAttemptReview(
      teacherId,
      input,
    );
  }

  async getSpeakingAttemptReview(
    teacherId: string,
    attemptIdInput: string,
    language: Language,
  ): Promise<TeacherSpeakingAttemptReviewObject> {
    return this.teacherReviewService.getSpeakingAttemptReview(
      teacherId,
      attemptIdInput,
      language,
    );
  }

  async saveWritingAttemptReview(
    teacherId: string,
    input: SaveWritingAttemptReviewInput,
  ): Promise<void> {
    return this.teacherReviewService.saveWritingAttemptReview(teacherId, input);
  }

  async getWritingAttemptReview(
    teacherId: string,
    attemptIdInput: string,
    language: Language,
  ): Promise<TeacherWritingAttemptReviewObject> {
    return this.teacherReviewService.getWritingAttemptReview(
      teacherId,
      attemptIdInput,
      language,
    );
  }

  async getGroupProgress(
    teacherId: string,
    groupIdInput: string,
  ): Promise<TeacherGroupProgressObject> {
    return this.teacherProgressService.getGroupProgress(
      teacherId,
      groupIdInput,
    );
  }

  async getGroupStudents(
    teacherId: string,
    groupIdInput: string,
    first: number | undefined,
    after: string | undefined,
  ): Promise<TeacherStudentProgressConnectionObject> {
    return this.teacherProgressService.getGroupStudents(
      teacherId,
      groupIdInput,
      first,
      after,
    );
  }

  async getStudentTests(
    teacherId: string,
    groupIdInput: string,
    studentIdInput: string,
    language: Language,
    first: number | undefined,
    after: string | undefined,
  ): Promise<TeacherStudentTestProgressConnectionObject> {
    return this.teacherProgressService.getStudentTests(
      teacherId,
      groupIdInput,
      studentIdInput,
      language,
      first,
      after,
    );
  }

  async getStudentAttempts(
    teacherId: string,
    groupIdInput: string,
    studentIdInput: string,
    language: Language,
    first: number | undefined,
    after: string | undefined,
  ): Promise<TeacherAttemptConnectionObject> {
    return this.teacherProgressService.getStudentAttempts(
      teacherId,
      groupIdInput,
      studentIdInput,
      language,
      first,
      after,
    );
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
}

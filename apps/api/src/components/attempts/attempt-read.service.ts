import {
  AttemptStatus,
  Language,
  TestSectionBlockKind,
  TestSkill,
} from '@best/database';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ErrorCode } from '../../libs/enums/error-code.enum';
import { ApplicationError } from '../../libs/errors/application.error';
import { parseUuid } from '../../libs/pagination/cursor-pagination';
import type { StudentAttemptObject } from '../../schemas/attempts/student-attempt.object';
import type { StudentAttemptSaveState } from '../../schemas/attempts/student-attempt.object';
import type { StudentReleasedAttemptResultObject } from '../../schemas/attempts/student-released-attempt-result.object';
import {
  isObjectiveAnswerCorrect,
  resolveObjectiveOptionIds,
} from '@best/scoring';
import {
  mapStudentTablePayload,
  mapResult,
  hasCompleteTranslation,
} from './attempt-view';
import {
  inaccessibleAttemptError,
  unavailableTranslationError,
} from './attempt-errors';

@Injectable()
export class AttemptReadService {
  constructor(private readonly database: DatabaseService) {}

  async loadStudentAttemptSaveState(
    studentId: string,
    attemptId: string,
  ): Promise<StudentAttemptSaveState> {
    const attempt = await this.database.attempt.findFirst({
      where: { id: attemptId, studentId },
      select: {
        id: true,
        status: true,
        answers: {
          orderBy: { questionId: 'asc' },
          select: {
            questionId: true,
            responseMediaObjectId: true,
            savedAt: true,
            selectedOptionId: true,
            textValue: true,
            selections: {
              orderBy: { position: 'asc' },
              select: { answerOptionId: true },
            },
          },
        },
        sectionNotes: {
          orderBy: { savedAt: 'asc' },
          select: { sectionId: true, text: true, savedAt: true },
        },
      },
    });
    if (attempt === null) throw inaccessibleAttemptError();
    return {
      id: attempt.id,
      status: attempt.status,
      serverTime: new Date(),
      answers: attempt.answers.map(({ selections, ...answer }) => ({
        ...answer,
        selectedOptionIds: selections.map(
          ({ answerOptionId }) => answerOptionId,
        ),
      })),
      notes: attempt.sectionNotes,
    };
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
      const selectedOptionIds = resolveObjectiveOptionIds(
        response?.selectedOptionId,
        response?.selections.map((selection) => selection.answerOptionId),
      );
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
      if (question.kind === 'LONG_TEXT' || question.kind === 'AUDIO_RESPONSE') {
        throw new ApplicationError(
          ErrorCode.INTERNAL_SERVER_ERROR,
          'An objective result contains a manual-response question',
          500,
        );
      }
      const isCorrect = isObjectiveAnswerCorrect({
        questionId: question.id,
        kind: question.kind,
        correctOptionIds,
        selectedOptionIds,
        acceptedTextValues: question.acceptedAnswers.map(
          (answer) => answer.normalizedValue,
        ),
        textValue: response?.textValue ?? '',
      });

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

  async loadStudentAttempt(
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

  async ensureAttemptTranslation(
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

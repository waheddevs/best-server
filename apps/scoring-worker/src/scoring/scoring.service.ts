import { AttemptStatus, TestSkill } from '@best/database';
import { scoreObjective, scoreSingleChoice } from '@best/scoring';
import { Injectable } from '@nestjs/common';

import { ScoringDatabaseService } from '../database/scoring-database.service';

@Injectable()
export class ScoringService {
  constructor(private readonly database: ScoringDatabaseService) {}

  async scoreAttempt(
    attemptId: string,
    correlationId: string | undefined,
  ): Promise<void> {
    const attempt = await this.database.attempt.findUnique({
      where: { id: attemptId },
      include: {
        groupMembership: {
          select: { groupId: true, group: { select: { teacherId: true } } },
        },
        answers: {
          select: {
            questionId: true,
            selectedOptionId: true,
            selections: { select: { answerOptionId: true } },
            textValue: true,
          },
        },
        testVersion: {
          include: {
            test: { select: { skill: true } },
            questions: {
              orderBy: { position: 'asc' },
              include: {
                acceptedAnswers: {
                  orderBy: { position: 'asc' },
                  select: { normalizedValue: true },
                },
                options: {
                  orderBy: { position: 'asc' },
                  select: { id: true },
                  where: { isCorrect: true },
                },
              },
            },
          },
        },
      },
    });

    if (attempt === null) {
      throw new Error('Scoring attempt does not exist');
    }

    if (attempt.status === AttemptStatus.SCORED) {
      return;
    }

    if (attempt.status !== AttemptStatus.SUBMITTED) {
      throw new Error('Only submitted attempts can be scored');
    }

    if (attempt.testVersion.scoringRuleVersion === 'manual-rubric-v1') {
      // SUBMITTED is the database-backed pending-review state. The original
      // lifecycle constraint does not permit REVIEW_REQUIRED without a migration.
      const skill = attempt.testVersion.test.skill;
      if (skill === TestSkill.WRITING || skill === TestSkill.SPEAKING) {
        const recipientId = attempt.groupMembership.group.teacherId;
        const eventKey = `review-required:${attempt.id}`;
        await this.database.notification.upsert({
          where: { recipientId_eventKey: { recipientId, eventKey } },
          create: {
            recipientId,
            eventKey,
            kind: 'REVIEW_REQUIRED',
            title: `${skill === TestSkill.WRITING ? 'Writing' : 'Speaking'} review required`,
            body: 'A student submitted a test for your review.',
            payload: {
              attemptId: attempt.id,
              groupId: attempt.groupMembership.groupId,
              studentId: attempt.studentId,
            },
          },
          update: {},
        });
      }
      return;
    }

    const answerByQuestion = new Map(
      attempt.answers.map((answer) => [answer.questionId, answer]),
    );
    const score =
      attempt.testVersion.scoringRuleVersion === 'single-choice-v1'
        ? scoreSingleChoice({
            passingPercentage: attempt.testVersion.passingPercentage,
            questions: attempt.testVersion.questions.map((question) => {
              const correctOption = question.options[0];

              if (
                correctOption === undefined ||
                question.options.length !== 1
              ) {
                throw new Error(
                  'Published question has invalid correct-answer data',
                );
              }

              const selectedOptionId = answerByQuestion.get(
                question.id,
              )?.selectedOptionId;

              return selectedOptionId == null
                ? {
                    correctOptionId: correctOption.id,
                    questionId: question.id,
                  }
                : {
                    correctOptionId: correctOption.id,
                    questionId: question.id,
                    selectedOptionId,
                  };
            }),
          })
        : attempt.testVersion.scoringRuleVersion === 'objective-v2'
          ? scoreObjective({
              passingPercentage: attempt.testVersion.passingPercentage,
              questions: attempt.testVersion.questions.map((question) => {
                const answer = answerByQuestion.get(question.id);
                const selectedOptionIds =
                  answer?.selections.map(
                    ({ answerOptionId }) => answerOptionId,
                  ) ??
                  (answer?.selectedOptionId === null ||
                  answer?.selectedOptionId === undefined
                    ? []
                    : [answer.selectedOptionId]);

                if (question.kind === 'SHORT_TEXT') {
                  return {
                    acceptedTextValues: question.acceptedAnswers.map(
                      ({ normalizedValue }) => normalizedValue,
                    ),
                    kind: question.kind,
                    questionId: question.id,
                    ...(answer?.textValue === null ||
                    answer?.textValue === undefined
                      ? {}
                      : { textValue: answer.textValue }),
                  };
                }

                if (
                  question.kind === 'LONG_TEXT' ||
                  question.kind === 'AUDIO_RESPONSE'
                ) {
                  throw new Error(
                    'Objective scoring cannot score a manual-response question',
                  );
                }

                return {
                  correctOptionIds: question.options.map(({ id }) => id),
                  kind: question.kind,
                  questionId: question.id,
                  selectedOptionIds,
                };
              }),
            })
          : (() => {
              throw new Error('The scoring rule version is not supported');
            })();

    await this.database.$transaction(async (transaction) => {
      const update = await transaction.attempt.updateMany({
        where: { id: attemptId, status: AttemptStatus.SUBMITTED },
        data: {
          correctAnswerCount: score.correctAnswerCount,
          passed: score.passed,
          passingPercentage: attempt.testVersion.passingPercentage,
          percentage: score.percentage,
          scoringRuleVersion: score.scoringRuleVersion,
          status: AttemptStatus.SCORED,
          totalQuestionCount: score.totalQuestionCount,
        },
      });

      if (update.count === 0) {
        return;
      }

      await transaction.auditLog.create({
        data: {
          action: 'TEST_ATTEMPT_SCORED',
          correlationId: correlationId ?? null,
          newValues: {
            correctAnswerCount: score.correctAnswerCount,
            passed: score.passed,
            percentage: score.percentage,
            scoringRuleVersion: score.scoringRuleVersion,
            totalQuestionCount: score.totalQuestionCount,
          },
          targetId: attemptId,
          targetType: 'Attempt',
        },
      });
    });
  }
}

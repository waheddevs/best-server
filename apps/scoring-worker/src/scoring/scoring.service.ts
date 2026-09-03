import { AttemptStatus } from '@best/database';
import { scoreSingleChoice } from '@best/scoring';
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
        answers: {
          select: { questionId: true, selectedOptionId: true },
        },
        testVersion: {
          include: {
            questions: {
              orderBy: { position: 'asc' },
              include: {
                options: {
                  where: { isCorrect: true },
                  select: { id: true },
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

    const selectedOptionByQuestion = new Map(
      attempt.answers.map((answer) => [
        answer.questionId,
        answer.selectedOptionId,
      ]),
    );
    const score = scoreSingleChoice({
      passingPercentage: attempt.testVersion.passingPercentage,
      questions: attempt.testVersion.questions.map((question) => {
        const correctOption = question.options[0];

        if (correctOption === undefined || question.options.length !== 1) {
          throw new Error('Published question has invalid correct-answer data');
        }

        const selectedOptionId = selectedOptionByQuestion.get(question.id);

        return selectedOptionId === undefined
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
    });

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

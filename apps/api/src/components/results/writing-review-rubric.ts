import { ApplicationError } from '../../libs/errors/application.error';
import { ErrorCode } from '../../libs/enums/error-code.enum';

export interface WritingTaskScores {
  taskAchievement: number;
  coherenceCohesion: number;
  lexicalResource: number;
  grammaticalRangeAccuracy: number;
  feedback: string | null;
}

export function validateWritingTaskScores(scores: WritingTaskScores): void {
  for (const value of [
    scores.taskAchievement,
    scores.coherenceCohesion,
    scores.lexicalResource,
    scores.grammaticalRangeAccuracy,
  ]) {
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > 9 ||
      (value * 2) % 1 !== 0
    ) {
      throw new ApplicationError(
        ErrorCode.BAD_USER_INPUT,
        'Writing rubric scores must be half-band values from 0 to 9',
        400,
      );
    }
  }
  if (scores.feedback !== null && scores.feedback.length > 5000) {
    throw new ApplicationError(
      ErrorCode.BAD_USER_INPUT,
      'Task feedback is too long',
      400,
    );
  }
}

export function writingTaskBand(scores: WritingTaskScores): number {
  return (
    (scores.taskAchievement +
      scores.coherenceCohesion +
      scores.lexicalResource +
      scores.grammaticalRangeAccuracy) /
    4
  );
}

export function writingPracticeBand(
  task1: WritingTaskScores,
  task2: WritingTaskScores,
): number {
  return (
    Math.round(
      ((writingTaskBand(task1) + 2 * writingTaskBand(task2)) / 3) * 2,
    ) / 2
  );
}

export function parseWritingRubric(value: unknown): {
  task1: WritingTaskScores;
  task2: WritingTaskScores;
} {
  if (!isRecord(value) || !isRecord(value.task1) || !isRecord(value.task2)) {
    throw invalidRubric();
  }
  const task1 = parseTask(value.task1);
  const task2 = parseTask(value.task2);
  return { task1, task2 };
}

function parseTask(value: Record<string, unknown>): WritingTaskScores {
  for (const key of [
    'taskAchievement',
    'coherenceCohesion',
    'lexicalResource',
    'grammaticalRangeAccuracy',
  ]) {
    if (typeof value[key] !== 'number') throw invalidRubric();
  }
  const scores: WritingTaskScores = {
    taskAchievement: Number(value.taskAchievement),
    coherenceCohesion: Number(value.coherenceCohesion),
    lexicalResource: Number(value.lexicalResource),
    grammaticalRangeAccuracy: Number(value.grammaticalRangeAccuracy),
    feedback: typeof value.feedback === 'string' ? value.feedback : null,
  };
  try {
    validateWritingTaskScores(scores);
  } catch {
    throw invalidRubric();
  }
  return scores;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidRubric(): ApplicationError {
  return new ApplicationError(
    ErrorCode.INTERNAL_SERVER_ERROR,
    'The Writing review rubric is invalid',
    500,
  );
}

import { AttemptStatus } from '@best/database';
import { TeacherStudentTestProgressStatus } from '../../schemas/results/teacher-student-test-progress.enum';
import { type ProgressMetrics } from './results-progress';

export function resolveTestProgressStatus(
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

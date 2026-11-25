import { registerEnumType } from '@nestjs/graphql';

export enum TeacherStudentTestProgressStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  AWAITING_SCORE = 'AWAITING_SCORE',
  PASSED = 'PASSED',
  FAILED = 'FAILED',
}

registerEnumType(TeacherStudentTestProgressStatus, {
  name: 'TeacherStudentTestProgressStatus',
});

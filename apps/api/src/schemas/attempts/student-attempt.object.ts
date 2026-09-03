import { AttemptStatus, Language } from '@best/database';
import {
  Field,
  Float,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';

import { StudentQuestionObject } from './student-question.object';

@ObjectType('StudentSavedAnswer')
export class StudentSavedAnswerObject {
  @Field(() => ID)
  questionId!: string;

  @Field(() => ID)
  selectedOptionId!: string;

  @Field(() => GraphQLISODateTime)
  savedAt!: Date;
}

@ObjectType('StudentAttemptResult')
export class StudentAttemptResultObject {
  @Field(() => Int)
  correctAnswerCount!: number;

  @Field(() => Int)
  totalQuestionCount!: number;

  @Field(() => Float)
  percentage!: number;

  @Field(() => Boolean)
  passed!: boolean;
}

@ObjectType('StudentAttempt')
export class StudentAttemptObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  testId!: string;

  @Field(() => ID)
  testVersionId!: string;

  @Field(() => String)
  title!: string;

  @Field(() => Language)
  language!: Language;

  @Field(() => AttemptStatus)
  status!: AttemptStatus;

  @Field(() => Int)
  attemptNumber!: number;

  @Field(() => GraphQLISODateTime)
  startedAt!: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  expiresAt!: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  submittedAt!: Date | null;

  @Field(() => GraphQLISODateTime)
  serverTime!: Date;

  @Field(() => [StudentQuestionObject])
  questions!: StudentQuestionObject[];

  @Field(() => [StudentSavedAnswerObject])
  answers!: StudentSavedAnswerObject[];

  @Field(() => StudentAttemptResultObject, { nullable: true })
  result!: StudentAttemptResultObject | null;
}

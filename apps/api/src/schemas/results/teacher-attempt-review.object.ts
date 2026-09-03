import {
  Field,
  Float,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';
import { AttemptStatus } from '@best/database';

@ObjectType('TeacherAnswerReview')
export class TeacherAnswerReviewObject {
  @Field(() => ID)
  questionId!: string;

  @Field(() => Int)
  position!: number;

  @Field(() => String)
  prompt!: string;

  @Field(() => ID, { nullable: true })
  selectedOptionId!: string | null;

  @Field(() => String, { nullable: true })
  selectedOptionText!: string | null;

  @Field(() => ID)
  correctOptionId!: string;

  @Field(() => String)
  correctOptionText!: string;

  @Field(() => Boolean)
  isCorrect!: boolean;
}

@ObjectType('TeacherAttemptReview')
export class TeacherAttemptReviewObject {
  @Field(() => ID)
  attemptId!: string;

  @Field(() => ID)
  studentId!: string;

  @Field(() => String)
  studentDisplayName!: string;

  @Field(() => ID)
  testId!: string;

  @Field(() => String)
  title!: string;

  @Field(() => Int)
  attemptNumber!: number;

  @Field(() => AttemptStatus)
  status!: AttemptStatus;

  @Field(() => GraphQLISODateTime)
  startedAt!: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  submittedAt!: Date | null;

  @Field(() => Float, { nullable: true })
  percentage!: number | null;

  @Field(() => Boolean, { nullable: true })
  passed!: boolean | null;

  @Field(() => [TeacherAnswerReviewObject])
  answers!: TeacherAnswerReviewObject[];
}

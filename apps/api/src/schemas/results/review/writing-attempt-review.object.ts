import { AttemptStatus } from '@best/database';
import {
  Field,
  Float,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';

@ObjectType('WritingTaskRubric')
export class WritingTaskRubricObject {
  @Field(() => Float)
  taskAchievement!: number;

  @Field(() => Float)
  coherenceCohesion!: number;

  @Field(() => Float)
  lexicalResource!: number;

  @Field(() => Float)
  grammaticalRangeAccuracy!: number;

  @Field(() => String, { nullable: true })
  feedback!: string | null;

  @Field(() => Float)
  band!: number;
}

@ObjectType('TeacherWritingAnswerReview')
export class TeacherWritingAnswerReviewObject {
  @Field(() => ID)
  questionId!: string;

  @Field(() => Int)
  sectionPosition!: number;

  @Field(() => String)
  prompt!: string;

  @Field(() => String, { nullable: true })
  textValue!: string | null;
}

@ObjectType('WritingRubricReview')
export class WritingRubricReviewObject {
  @Field(() => WritingTaskRubricObject)
  task1!: WritingTaskRubricObject;

  @Field(() => WritingTaskRubricObject)
  task2!: WritingTaskRubricObject;

  @Field(() => Float)
  practiceBand!: number;

  @Field(() => String, { nullable: true })
  feedback!: string | null;

  @Field(() => GraphQLISODateTime)
  reviewedAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  releasedAt!: Date | null;
}

@ObjectType('TeacherWritingAttemptReview')
export class TeacherWritingAttemptReviewObject {
  @Field(() => ID)
  attemptId!: string;

  @Field(() => String)
  studentDisplayName!: string;

  @Field(() => String)
  title!: string;

  @Field(() => AttemptStatus)
  status!: AttemptStatus;

  @Field(() => [TeacherWritingAnswerReviewObject])
  answers!: TeacherWritingAnswerReviewObject[];

  @Field(() => WritingRubricReviewObject, { nullable: true })
  review!: WritingRubricReviewObject | null;
}

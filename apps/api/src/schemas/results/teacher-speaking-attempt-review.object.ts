import { AttemptStatus } from '@best/database';
import {
  Field,
  Float,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';

@ObjectType('TeacherSpeakingAnswerReview')
export class TeacherSpeakingAnswerReviewObject {
  @Field(() => ID)
  questionId!: string;

  @Field(() => Int)
  position!: number;

  @Field(() => Int)
  sectionPosition!: number;

  @Field(() => String)
  prompt!: string;

  @Field(() => ID, { nullable: true })
  responseMediaObjectId!: string | null;

  @Field(() => String, { nullable: true })
  audioUrl!: string | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  audioUrlExpiresAt!: Date | null;
}

@ObjectType('SpeakingRubricReview')
export class SpeakingRubricReviewObject {
  @Field(() => Float)
  fluencyCoherence!: number;

  @Field(() => Float)
  lexicalResource!: number;

  @Field(() => Float)
  grammaticalRangeAccuracy!: number;

  @Field(() => Float)
  pronunciation!: number;

  @Field(() => Float)
  practiceBand!: number;

  @Field(() => String, { nullable: true })
  feedback!: string | null;

  @Field(() => GraphQLISODateTime)
  reviewedAt!: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  releasedAt!: Date | null;
}

@ObjectType('TeacherSpeakingAttemptReview')
export class TeacherSpeakingAttemptReviewObject {
  @Field(() => ID)
  attemptId!: string;

  @Field(() => String)
  studentDisplayName!: string;

  @Field(() => String)
  title!: string;

  @Field(() => AttemptStatus)
  status!: AttemptStatus;

  @Field(() => [TeacherSpeakingAnswerReviewObject])
  answers!: TeacherSpeakingAnswerReviewObject[];

  @Field(() => SpeakingRubricReviewObject, { nullable: true })
  review!: SpeakingRubricReviewObject | null;
}

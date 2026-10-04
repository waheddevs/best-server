import {
  Field,
  Float,
  GraphQLISODateTime,
  ID,
  InputType,
} from '@nestjs/graphql';

@InputType('WritingTaskRubricInput')
export class WritingTaskRubricInput {
  @Field(() => Float)
  taskAchievement!: number;

  @Field(() => Float)
  coherenceCohesion!: number;

  @Field(() => Float)
  lexicalResource!: number;

  @Field(() => Float)
  grammaticalRangeAccuracy!: number;

  @Field(() => String, { nullable: true })
  feedback?: string;
}

@InputType('SaveWritingAttemptReviewInput')
export class SaveWritingAttemptReviewInput {
  @Field(() => ID)
  attemptId!: string;

  @Field(() => WritingTaskRubricInput)
  task1!: WritingTaskRubricInput;

  @Field(() => WritingTaskRubricInput)
  task2!: WritingTaskRubricInput;

  @Field(() => String, { nullable: true })
  feedback?: string;

  @Field(() => Boolean)
  release!: boolean;

  @Field(() => GraphQLISODateTime, { nullable: true })
  expectedUpdatedAt?: Date;
}

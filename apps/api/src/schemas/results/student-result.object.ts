import {
  Field,
  Float,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';

@ObjectType('StudentResult')
export class StudentResultObject {
  @Field(() => ID)
  attemptId!: string;

  @Field(() => ID)
  testId!: string;

  @Field(() => String)
  title!: string;

  @Field(() => Int)
  attemptNumber!: number;

  @Field(() => Int)
  correctAnswerCount!: number;

  @Field(() => Int)
  totalQuestionCount!: number;

  @Field(() => Float)
  percentage!: number;

  @Field(() => Float)
  highestPercentage!: number;

  @Field(() => Boolean)
  passed!: boolean;

  @Field(() => GraphQLISODateTime)
  submittedAt!: Date;
}

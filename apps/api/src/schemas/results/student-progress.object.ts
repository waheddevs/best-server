import {
  Field,
  Float,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';

@ObjectType('StudentProgress')
export class StudentProgressObject {
  @Field(() => ID, { nullable: true })
  groupId!: string | null;

  @Field(() => String, { nullable: true })
  groupName!: string | null;

  @Field(() => Int)
  assignedTestCount!: number;

  @Field(() => Int)
  completedTestCount!: number;

  @Field(() => Int)
  remainingTestCount!: number;

  @Field(() => Int)
  awaitingScoreTestCount!: number;

  @Field(() => Int)
  scoredTestCount!: number;

  @Field(() => Int)
  passedTestCount!: number;

  @Field(() => Int)
  failedTestCount!: number;

  @Field(() => Float)
  completionPercentage!: number;

  @Field(() => Float, { nullable: true })
  averagePercentage!: number | null;

  @Field(() => Float, { nullable: true })
  highestPercentage!: number | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  latestActivityAt!: Date | null;
}

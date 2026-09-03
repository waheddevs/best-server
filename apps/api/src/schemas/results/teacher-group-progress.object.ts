import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('TeacherGroupProgress')
export class TeacherGroupProgressObject {
  @Field(() => ID)
  groupId!: string;

  @Field(() => String)
  groupName!: string;

  @Field(() => Int)
  activeStudentCount!: number;

  @Field(() => Int)
  assignedTestCount!: number;

  @Field(() => Int)
  totalAssignmentCount!: number;

  @Field(() => Int)
  completedAssignmentCount!: number;

  @Field(() => Int)
  remainingAssignmentCount!: number;

  @Field(() => Int)
  awaitingScoreAssignmentCount!: number;

  @Field(() => Int)
  scoredAssignmentCount!: number;

  @Field(() => Int)
  passedAssignmentCount!: number;

  @Field(() => Int)
  failedAssignmentCount!: number;

  @Field(() => Float)
  completionPercentage!: number;

  @Field(() => Float, { nullable: true })
  averagePercentage!: number | null;

  @Field(() => Float, { nullable: true })
  highestPercentage!: number | null;

  @Field(() => Float, { nullable: true })
  lowestPercentage!: number | null;
}

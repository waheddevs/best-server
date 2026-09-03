import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('AdminAcademicOverview')
export class AdminAcademicOverviewObject {
  @Field(() => Int)
  activeTeacherCount!: number;

  @Field(() => Int)
  activeStudentCount!: number;

  @Field(() => Int)
  activeGroupCount!: number;

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

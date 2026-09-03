import {
  Field,
  Float,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';

import { PageInfoObject } from '../pagination/page-info.object';

@ObjectType('TeacherStudentProgress')
export class TeacherStudentProgressObject {
  @Field(() => ID)
  studentId!: string;

  @Field(() => String)
  displayName!: string;

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

  @Field(() => Float, { nullable: true })
  lowestPercentage!: number | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  latestActivityAt!: Date | null;
}

@ObjectType('TeacherStudentProgressEdge')
export class TeacherStudentProgressEdgeObject {
  @Field(() => String)
  cursor!: string;

  @Field(() => TeacherStudentProgressObject)
  node!: TeacherStudentProgressObject;
}

@ObjectType('TeacherStudentProgressConnection')
export class TeacherStudentProgressConnectionObject {
  @Field(() => [TeacherStudentProgressEdgeObject])
  edges!: TeacherStudentProgressEdgeObject[];

  @Field(() => PageInfoObject)
  pageInfo!: PageInfoObject;
}

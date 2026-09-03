import { UserStatus } from '@best/database';
import {
  Field,
  Float,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';

import { PageInfoObject } from '../pagination/page-info.object';

@ObjectType('AdminStudent')
export class AdminStudentObject {
  @Field(() => ID)
  studentId!: string;

  @Field(() => String)
  displayName!: string;

  @Field(() => UserStatus)
  status!: UserStatus;

  @Field(() => ID, { nullable: true })
  currentGroupId!: string | null;

  @Field(() => String, { nullable: true })
  currentGroupName!: string | null;

  @Field(() => Int)
  scoredAttemptCount!: number;

  @Field(() => Int)
  scoredTestCount!: number;

  @Field(() => Int)
  passedTestCount!: number;

  @Field(() => Int)
  failedTestCount!: number;

  @Field(() => Float, { nullable: true })
  averagePercentage!: number | null;

  @Field(() => Float, { nullable: true })
  highestPercentage!: number | null;

  @Field(() => Float, { nullable: true })
  lowestPercentage!: number | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  latestResultAt!: Date | null;
}

@ObjectType('AdminStudentEdge')
export class AdminStudentEdgeObject {
  @Field(() => String)
  cursor!: string;

  @Field(() => AdminStudentObject)
  node!: AdminStudentObject;
}

@ObjectType('AdminStudentConnection')
export class AdminStudentConnectionObject {
  @Field(() => [AdminStudentEdgeObject])
  edges!: AdminStudentEdgeObject[];

  @Field(() => PageInfoObject)
  pageInfo!: PageInfoObject;
}

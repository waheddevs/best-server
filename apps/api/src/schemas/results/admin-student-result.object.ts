import {
  Field,
  Float,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';

import { PageInfoObject } from '../pagination/page-info.object';

@ObjectType('AdminStudentResult')
export class AdminStudentResultObject {
  @Field(() => ID)
  attemptId!: string;

  @Field(() => ID)
  testId!: string;

  @Field(() => String)
  title!: string;

  @Field(() => ID)
  groupId!: string;

  @Field(() => String)
  groupName!: string;

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

@ObjectType('AdminStudentResultEdge')
export class AdminStudentResultEdgeObject {
  @Field(() => String)
  cursor!: string;

  @Field(() => AdminStudentResultObject)
  node!: AdminStudentResultObject;
}

@ObjectType('AdminStudentResultConnection')
export class AdminStudentResultConnectionObject {
  @Field(() => [AdminStudentResultEdgeObject])
  edges!: AdminStudentResultEdgeObject[];

  @Field(() => PageInfoObject)
  pageInfo!: PageInfoObject;
}

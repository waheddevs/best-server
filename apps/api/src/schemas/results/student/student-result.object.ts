import { TestSkill } from '@best/database';
import {
  Field,
  Float,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';

import { PageInfoObject } from '../../pagination/page-info.object';

@ObjectType('StudentResult')
export class StudentResultObject {
  @Field(() => ID)
  attemptId!: string;

  @Field(() => ID)
  testId!: string;

  @Field(() => String)
  title!: string;

  @Field(() => TestSkill, { nullable: true })
  skill!: TestSkill | null;

  @Field(() => Int)
  attemptNumber!: number;

  @Field(() => Int)
  correctAnswerCount!: number;

  @Field(() => Int)
  totalQuestionCount!: number;

  @Field(() => Float)
  percentage!: number;

  @Field(() => Float, { nullable: true })
  practiceBand!: number | null;

  @Field(() => Float)
  highestPercentage!: number;

  @Field(() => Boolean)
  passed!: boolean;

  @Field(() => GraphQLISODateTime)
  submittedAt!: Date;
}

@ObjectType('StudentResultEdge')
export class StudentResultEdgeObject {
  @Field(() => String)
  cursor!: string;

  @Field(() => StudentResultObject)
  node!: StudentResultObject;
}

@ObjectType('StudentResultConnection')
export class StudentResultConnectionObject {
  @Field(() => [StudentResultEdgeObject])
  edges!: StudentResultEdgeObject[];

  @Field(() => PageInfoObject)
  pageInfo!: PageInfoObject;
}

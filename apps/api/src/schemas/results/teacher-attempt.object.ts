import {
  Field,
  Float,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';
import { AttemptStatus, TestSkill } from '@best/database';

import { PageInfoObject } from '../pagination/page-info.object';

@ObjectType('TeacherAttempt')
export class TeacherAttemptObject {
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

  @Field(() => AttemptStatus)
  status!: AttemptStatus;

  @Field(() => GraphQLISODateTime)
  startedAt!: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  submittedAt!: Date | null;

  @Field(() => Float, { nullable: true })
  percentage!: number | null;

  @Field(() => Boolean, { nullable: true })
  passed!: boolean | null;
}

@ObjectType('TeacherAttemptEdge')
export class TeacherAttemptEdgeObject {
  @Field(() => String)
  cursor!: string;

  @Field(() => TeacherAttemptObject)
  node!: TeacherAttemptObject;
}

@ObjectType('TeacherAttemptConnection')
export class TeacherAttemptConnectionObject {
  @Field(() => [TeacherAttemptEdgeObject])
  edges!: TeacherAttemptEdgeObject[];

  @Field(() => PageInfoObject)
  pageInfo!: PageInfoObject;
}

import {
  Field,
  Float,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';

import { PageInfoObject } from '../pagination/page-info.object';
import { TeacherStudentTestProgressStatus } from './teacher-student-test-progress.enum';

@ObjectType('TeacherStudentTestProgress')
export class TeacherStudentTestProgressObject {
  @Field(() => ID)
  testId!: string;

  @Field(() => String)
  title!: string;

  @Field(() => TeacherStudentTestProgressStatus)
  status!: TeacherStudentTestProgressStatus;

  @Field(() => Int)
  attemptCount!: number;

  @Field(() => Float, { nullable: true })
  highestPercentage!: number | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  latestActivityAt!: Date | null;
}

@ObjectType('TeacherStudentTestProgressEdge')
export class TeacherStudentTestProgressEdgeObject {
  @Field(() => String)
  cursor!: string;

  @Field(() => TeacherStudentTestProgressObject)
  node!: TeacherStudentTestProgressObject;
}

@ObjectType('TeacherStudentTestProgressConnection')
export class TeacherStudentTestProgressConnectionObject {
  @Field(() => [TeacherStudentTestProgressEdgeObject])
  edges!: TeacherStudentTestProgressEdgeObject[];

  @Field(() => PageInfoObject)
  pageInfo!: PageInfoObject;
}

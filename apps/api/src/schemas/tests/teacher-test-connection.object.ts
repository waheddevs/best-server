import { Field, ObjectType } from '@nestjs/graphql';
import { PageInfoObject } from '../pagination/page-info.object';
import { AttemptGrantObject, TeacherTestObject } from './teacher-test.object';

@ObjectType('TeacherTestEdge')
export class TeacherTestEdgeObject {
  @Field(() => String)
  cursor!: string;
  @Field(() => TeacherTestObject)
  node!: TeacherTestObject;
}

@ObjectType('TeacherTestConnection')
export class TeacherTestConnectionObject {
  @Field(() => [TeacherTestEdgeObject])
  edges!: TeacherTestEdgeObject[];
  @Field(() => PageInfoObject)
  pageInfo!: PageInfoObject;
}

@ObjectType('AttemptGrantEdge')
export class AttemptGrantEdgeObject {
  @Field(() => String)
  cursor!: string;
  @Field(() => AttemptGrantObject)
  node!: AttemptGrantObject;
}

@ObjectType('AttemptGrantConnection')
export class AttemptGrantConnectionObject {
  @Field(() => [AttemptGrantEdgeObject])
  edges!: AttemptGrantEdgeObject[];
  @Field(() => PageInfoObject)
  pageInfo!: PageInfoObject;
}

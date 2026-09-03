import { Field, ObjectType } from '@nestjs/graphql';

import { PageInfoObject } from '../pagination/page-info.object';
import { StudentTestObject } from './student-test.object';

@ObjectType('StudentTestEdge')
export class StudentTestEdgeObject {
  @Field(() => String)
  cursor!: string;

  @Field(() => StudentTestObject)
  node!: StudentTestObject;
}

@ObjectType('StudentTestConnection')
export class StudentTestConnectionObject {
  @Field(() => [StudentTestEdgeObject])
  edges!: StudentTestEdgeObject[];

  @Field(() => PageInfoObject)
  pageInfo!: PageInfoObject;
}

import { Field, ObjectType } from '@nestjs/graphql';

import { PageInfoObject } from '../pagination/page-info.object';
import { StudentResultObject } from './student-result.object';

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

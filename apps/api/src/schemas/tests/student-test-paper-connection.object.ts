import { Field, ObjectType } from '@nestjs/graphql';

import { PageInfoObject } from '../pagination/page-info.object';
import { StudentTestPaperObject } from './student-test-paper.object';

@ObjectType('StudentTestPaperEdge')
export class StudentTestPaperEdgeObject {
  @Field(() => String)
  cursor!: string;

  @Field(() => StudentTestPaperObject)
  node!: StudentTestPaperObject;
}

@ObjectType('StudentTestPaperConnection')
export class StudentTestPaperConnectionObject {
  @Field(() => [StudentTestPaperEdgeObject])
  edges!: StudentTestPaperEdgeObject[];

  @Field(() => PageInfoObject)
  pageInfo!: PageInfoObject;
}

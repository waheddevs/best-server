import { Field, ObjectType } from '@nestjs/graphql';

import { NumericPageInfoObject } from '../pagination/numeric-page-info.object';
import { TeacherTestPaperObject } from './teacher-test-paper.object';

@ObjectType('TeacherTestPaperPage')
export class TeacherTestPaperPageObject {
  @Field(() => [TeacherTestPaperObject])
  items!: TeacherTestPaperObject[];

  @Field(() => NumericPageInfoObject)
  pageInfo!: NumericPageInfoObject;
}

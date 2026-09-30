import { Field, ObjectType } from '@nestjs/graphql';

import { TeacherTestPaperObject } from './teacher-test-paper.object';

@ObjectType('TeacherTestPaperPayload')
export class TeacherTestPaperPayloadObject {
  @Field(() => TeacherTestPaperObject)
  testPaper!: TeacherTestPaperObject;
}

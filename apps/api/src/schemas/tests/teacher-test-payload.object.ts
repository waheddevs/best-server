import { Field, ObjectType } from '@nestjs/graphql';
import {
  AttemptGrantObject,
  TeacherTestObject,
  TeacherTestVersionObject,
  TestCategoryObject,
} from './teacher-test.object';

@ObjectType('TestCategoryPayload')
export class TestCategoryPayloadObject {
  @Field(() => TestCategoryObject)
  category!: TestCategoryObject;
}

@ObjectType('TeacherTestPayload')
export class TeacherTestPayloadObject {
  @Field(() => TeacherTestObject)
  test!: TeacherTestObject;
}

@ObjectType('TeacherTestVersionPayload')
export class TeacherTestVersionPayloadObject {
  @Field(() => TeacherTestVersionObject)
  testVersion!: TeacherTestVersionObject;
}

@ObjectType('AttemptGrantPayload')
export class AttemptGrantPayloadObject {
  @Field(() => AttemptGrantObject)
  grant!: AttemptGrantObject;
}

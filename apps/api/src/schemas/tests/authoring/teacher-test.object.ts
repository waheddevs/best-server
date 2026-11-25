import { ContentStatus } from '@best/database';
import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';

import { TeacherTestVersionObject } from './test-draft.object';

@ObjectType('TestCategory')
export class TestCategoryObject {
  @Field(() => ID)
  id!: string;
  @Field(() => String)
  name!: string;
}

@ObjectType('TeacherTest')
export class TeacherTestObject {
  @Field(() => ID)
  id!: string;
  @Field(() => ID)
  groupId!: string;
  @Field(() => TestCategoryObject)
  category!: TestCategoryObject;
  @Field(() => ContentStatus)
  status!: ContentStatus;
  @Field(() => GraphQLISODateTime, { nullable: true })
  archivedAt!: Date | null;
  @Field(() => TeacherTestVersionObject, { nullable: true })
  latestVersion!: TeacherTestVersionObject | null;
  @Field(() => GraphQLISODateTime)
  createdAt!: Date;
  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;
}

@ObjectType('AttemptGrant')
export class AttemptGrantObject {
  @Field(() => ID)
  id!: string;
  @Field(() => ID)
  testId!: string;
  @Field(() => ID)
  studentId!: string;
  @Field(() => Int)
  additionalAttempts!: number;
  @Field(() => String, { nullable: true })
  reason!: string | null;
  @Field(() => GraphQLISODateTime)
  createdAt!: Date;
}

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

@ObjectType('AttemptGrantPayload')
export class AttemptGrantPayloadObject {
  @Field(() => AttemptGrantObject)
  grant!: AttemptGrantObject;
}

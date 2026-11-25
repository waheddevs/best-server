import { Field, ID, InputType, Int } from '@nestjs/graphql';

@InputType('CreateTestCategoryInput')
export class CreateTestCategoryInput {
  @Field(() => String)
  name!: string;
}

@InputType('UpdateTestCategoryInput')
export class UpdateTestCategoryInput extends CreateTestCategoryInput {
  @Field(() => ID)
  categoryId!: string;
}

@InputType('SetTestArchivedInput')
export class SetTestArchivedInput {
  @Field(() => ID)
  testId!: string;

  @Field(() => Boolean)
  archived!: boolean;
}

@InputType('GrantAdditionalTestAttemptInput')
export class GrantAdditionalTestAttemptInput {
  @Field(() => ID)
  testId!: string;

  @Field(() => ID)
  studentId!: string;

  @Field(() => Int)
  additionalAttempts!: number;

  @Field(() => String)
  reason!: string;
}

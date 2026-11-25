import { Language } from '@best/database';
import { Field, GraphQLISODateTime, ID, InputType, Int } from '@nestjs/graphql';

@InputType('TestTranslationInput')
export class TestTranslationInput {
  @Field(() => Language)
  language!: Language;

  @Field(() => String)
  title!: string;

  @Field(() => String, { nullable: true })
  description?: string;
}

@InputType('CreateTestDraftInput')
export class CreateTestDraftInput {
  @Field(() => ID)
  groupId!: string;

  @Field(() => ID)
  categoryId!: string;

  @Field(() => Language)
  primaryLanguage!: Language;

  @Field(() => [TestTranslationInput])
  translations!: TestTranslationInput[];
}

@InputType('UpdateTestDraftSettingsInput')
export class UpdateTestDraftSettingsInput {
  @Field(() => GraphQLISODateTime)
  expectedUpdatedAt!: Date;

  @Field(() => ID)
  testVersionId!: string;

  @Field(() => Language)
  primaryLanguage!: Language;

  @Field(() => GraphQLISODateTime, { nullable: true })
  availabilityStartsAt?: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  availabilityEndsAt?: Date;

  @Field(() => Int, { nullable: true })
  durationMinutes?: number;

  @Field(() => Int)
  attemptLimit!: number;

  @Field(() => Int)
  passingPercentage!: number;
}

@InputType('ReplaceTestDraftTranslationsInput')
export class ReplaceTestDraftTranslationsInput {
  @Field(() => GraphQLISODateTime)
  expectedUpdatedAt!: Date;

  @Field(() => ID)
  testVersionId!: string;

  @Field(() => [TestTranslationInput])
  translations!: TestTranslationInput[];
}

@InputType('TestVersionIdInput')
export class TestVersionIdInput {
  @Field(() => GraphQLISODateTime)
  expectedUpdatedAt!: Date;

  @Field(() => ID)
  testVersionId!: string;
}

@InputType('CreateNextTestVersionInput')
export class CreateNextTestVersionInput {
  @Field(() => ID)
  testId!: string;
}

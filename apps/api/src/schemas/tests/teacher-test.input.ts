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

@InputType('QuestionTranslationInput')
export class QuestionTranslationInput {
  @Field(() => Language)
  language!: Language;

  @Field(() => String)
  prompt!: string;
}

@InputType('AnswerOptionTranslationInput')
export class AnswerOptionTranslationInput {
  @Field(() => Language)
  language!: Language;

  @Field(() => String)
  text!: string;
}

@InputType('AnswerOptionDraftInput')
export class AnswerOptionDraftInput {
  @Field(() => Boolean)
  isCorrect!: boolean;

  @Field(() => [AnswerOptionTranslationInput])
  translations!: AnswerOptionTranslationInput[];
}

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
  @Field(() => ID)
  testVersionId!: string;

  @Field(() => [TestTranslationInput])
  translations!: TestTranslationInput[];
}

@InputType('CreateTestQuestionInput')
export class CreateTestQuestionInput {
  @Field(() => ID)
  testVersionId!: string;

  @Field(() => [QuestionTranslationInput])
  translations!: QuestionTranslationInput[];

  @Field(() => [AnswerOptionDraftInput])
  options!: AnswerOptionDraftInput[];
}

@InputType('UpdateTestQuestionInput')
export class UpdateTestQuestionInput {
  @Field(() => ID)
  questionId!: string;

  @Field(() => [QuestionTranslationInput])
  translations!: QuestionTranslationInput[];

  @Field(() => [AnswerOptionDraftInput])
  options!: AnswerOptionDraftInput[];
}

@InputType('ReorderTestQuestionsInput')
export class ReorderTestQuestionsInput {
  @Field(() => ID)
  testVersionId!: string;

  @Field(() => [ID])
  questionIds!: string[];
}

@InputType('TestVersionIdInput')
export class TestVersionIdInput {
  @Field(() => ID)
  testVersionId!: string;
}

@InputType('CreateNextTestVersionInput')
export class CreateNextTestVersionInput {
  @Field(() => ID)
  testId!: string;
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

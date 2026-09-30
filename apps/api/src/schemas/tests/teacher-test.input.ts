import {
  Language,
  QuestionKind,
  TestSectionBlockKind,
  TestSkill,
} from '@best/database';
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

  @Field(() => String, { nullable: true })
  rationale?: string;
}

@InputType('TestSectionTranslationInput')
export class TestSectionTranslationInput {
  @Field(() => Language)
  language!: Language;

  @Field(() => String)
  title!: string;

  @Field(() => String)
  instructions!: string;

  @Field(() => String, { nullable: true })
  content?: string;
}

@InputType('TestSectionBlockTranslationInput')
export class TestSectionBlockTranslationInput {
  @Field(() => Language)
  language!: Language;

  @Field(() => String, { nullable: true })
  text?: string;

  @Field(() => String, { nullable: true })
  altText?: string;

  @Field(() => String, { nullable: true })
  caption?: string;
}

@InputType('TestTableRowInput')
export class TestTableRowInput {
  @Field(() => [String])
  cells!: string[];
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

@InputType('CreateTestPaperSkillDraftInput')
export class CreateTestPaperSkillDraftInput {
  @Field(() => ID)
  testPaperId!: string;

  @Field(() => TestSkill)
  skill!: TestSkill;
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

  @Field(() => ID, { nullable: true })
  sectionId?: string;

  @Field(() => QuestionKind, { nullable: true })
  kind?: QuestionKind;

  @Field(() => Int, { nullable: true })
  answerLimit?: number;

  @Field(() => Int, { nullable: true })
  maxSelections?: number;

  @Field(() => [String], { nullable: true })
  acceptedAnswers?: string[];
}

@InputType('UpdateTestQuestionInput')
export class UpdateTestQuestionInput {
  @Field(() => ID)
  questionId!: string;

  @Field(() => [QuestionTranslationInput])
  translations!: QuestionTranslationInput[];

  @Field(() => [AnswerOptionDraftInput])
  options!: AnswerOptionDraftInput[];

  @Field(() => ID, { nullable: true })
  sectionId?: string;

  @Field(() => QuestionKind, { nullable: true })
  kind?: QuestionKind;

  @Field(() => Int, { nullable: true })
  answerLimit?: number;

  @Field(() => Int, { nullable: true })
  maxSelections?: number;

  @Field(() => [String], { nullable: true })
  acceptedAnswers?: string[];
}

@InputType('CreateTestSectionInput')
export class CreateTestSectionInput {
  @Field(() => ID)
  testVersionId!: string;

  @Field(() => [TestSectionTranslationInput])
  translations!: TestSectionTranslationInput[];

  @Field(() => ID, { nullable: true })
  mediaObjectId?: string;

  @Field(() => Int, { nullable: true })
  suggestedMinutes?: number;

  @Field(() => Int, { nullable: true })
  minimumWords?: number;

  @Field(() => Int, { nullable: true })
  preparationSeconds?: number;

  @Field(() => Int, { nullable: true })
  responseSeconds?: number;
}

@InputType('UpdateTestSectionInput')
export class UpdateTestSectionInput {
  @Field(() => ID)
  testSectionId!: string;

  @Field(() => [TestSectionTranslationInput])
  translations!: TestSectionTranslationInput[];

  @Field(() => ID, { nullable: true })
  mediaObjectId?: string;

  @Field(() => Int, { nullable: true })
  suggestedMinutes?: number;

  @Field(() => Int, { nullable: true })
  minimumWords?: number;

  @Field(() => Int, { nullable: true })
  preparationSeconds?: number;

  @Field(() => Int, { nullable: true })
  responseSeconds?: number;
}

@InputType('ReorderTestSectionsInput')
export class ReorderTestSectionsInput {
  @Field(() => ID)
  testVersionId!: string;

  @Field(() => [ID])
  testSectionIds!: string[];
}

@InputType('CreateTestSectionBlockInput')
export class CreateTestSectionBlockInput {
  @Field(() => ID)
  testSectionId!: string;

  @Field(() => TestSectionBlockKind)
  kind!: TestSectionBlockKind;

  @Field(() => ID, { nullable: true })
  mediaObjectId?: string;

  @Field(() => Int, { nullable: true })
  headingLevel?: number;

  @Field(() => [TestSectionBlockTranslationInput])
  translations!: TestSectionBlockTranslationInput[];

  @Field(() => [TestTableRowInput], { nullable: true })
  tableHeaderRows?: TestTableRowInput[];

  @Field(() => [TestTableRowInput], { nullable: true })
  tableRows?: TestTableRowInput[];

  @Field(() => [ID], { nullable: true })
  questionIds?: string[];
}

@InputType('UpdateTestSectionBlockInput')
export class UpdateTestSectionBlockInput {
  @Field(() => ID)
  testSectionBlockId!: string;

  @Field(() => TestSectionBlockKind)
  kind!: TestSectionBlockKind;

  @Field(() => ID, { nullable: true })
  mediaObjectId?: string;

  @Field(() => Int, { nullable: true })
  headingLevel?: number;

  @Field(() => [TestSectionBlockTranslationInput])
  translations!: TestSectionBlockTranslationInput[];

  @Field(() => [TestTableRowInput], { nullable: true })
  tableHeaderRows?: TestTableRowInput[];

  @Field(() => [TestTableRowInput], { nullable: true })
  tableRows?: TestTableRowInput[];

  @Field(() => [ID], { nullable: true })
  questionIds?: string[];
}

@InputType('ReorderTestSectionBlocksInput')
export class ReorderTestSectionBlocksInput {
  @Field(() => ID)
  testSectionId!: string;

  @Field(() => [ID])
  testSectionBlockIds!: string[];
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

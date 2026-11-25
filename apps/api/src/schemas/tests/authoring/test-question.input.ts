import { Language, QuestionKind } from '@best/database';
import { Field, GraphQLISODateTime, ID, InputType, Int } from '@nestjs/graphql';

@InputType('QuestionTranslationInput')
export class QuestionTranslationInput {
  @Field(() => Language)
  language!: Language;

  @Field(() => String)
  prompt!: string;

  @Field(() => String, { nullable: true })
  rationale?: string;
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

@InputType('CreateTestQuestionInput')
export class CreateTestQuestionInput {
  @Field(() => GraphQLISODateTime)
  expectedUpdatedAt!: Date;

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
  @Field(() => GraphQLISODateTime)
  expectedUpdatedAt!: Date;

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

@InputType('ReorderTestQuestionsInput')
export class ReorderTestQuestionsInput {
  @Field(() => GraphQLISODateTime)
  expectedUpdatedAt!: Date;

  @Field(() => ID)
  testVersionId!: string;

  @Field(() => [ID])
  questionIds!: string[];
}

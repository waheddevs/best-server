import {
  ContentStatus,
  Language,
  QuestionKind,
  TestSectionBlockKind,
  TestVersionStatus,
} from '@best/database';
import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';

@ObjectType('TestCategory')
export class TestCategoryObject {
  @Field(() => ID)
  id!: string;
  @Field(() => String)
  name!: string;
}

@ObjectType('TeacherTestTranslation')
export class TeacherTestTranslationObject {
  @Field(() => Language)
  language!: Language;
  @Field(() => String)
  title!: string;
  @Field(() => String, { nullable: true })
  description!: string | null;
}

@ObjectType('TeacherTestSectionTranslation')
export class TeacherTestSectionTranslationObject {
  @Field(() => Language)
  language!: Language;
  @Field(() => String)
  title!: string;
  @Field(() => String)
  instructions!: string;
  @Field(() => String, { nullable: true })
  content!: string | null;
}

@ObjectType('TeacherTestSectionBlockTranslation')
export class TeacherTestSectionBlockTranslationObject {
  @Field(() => Language)
  language!: Language;
  @Field(() => String, { nullable: true })
  text!: string | null;
  @Field(() => String, { nullable: true })
  altText!: string | null;
  @Field(() => String, { nullable: true })
  caption!: string | null;
}

@ObjectType('TeacherTestTableRow')
export class TeacherTestTableRowObject {
  @Field(() => [String])
  cells!: string[];
}

@ObjectType('TeacherTestSectionBlock')
export class TeacherTestSectionBlockObject {
  @Field(() => ID)
  id!: string;
  @Field(() => Int)
  position!: number;
  @Field(() => TestSectionBlockKind)
  kind!: TestSectionBlockKind;
  @Field(() => ID, { nullable: true })
  mediaObjectId!: string | null;
  @Field(() => Int, { nullable: true })
  mediaWidthPixels!: number | null;
  @Field(() => Int, { nullable: true })
  mediaHeightPixels!: number | null;
  @Field(() => Int, { nullable: true })
  mediaDurationSeconds!: number | null;
  @Field(() => Int, { nullable: true })
  headingLevel!: number | null;
  @Field(() => [TeacherTestTableRowObject])
  tableHeaderRows!: TeacherTestTableRowObject[];
  @Field(() => [TeacherTestTableRowObject])
  tableRows!: TeacherTestTableRowObject[];
  @Field(() => [ID])
  questionIds!: string[];
  @Field(() => [TeacherTestSectionBlockTranslationObject])
  translations!: TeacherTestSectionBlockTranslationObject[];
}

@ObjectType('TeacherTestSection')
export class TeacherTestSectionObject {
  @Field(() => ID)
  id!: string;
  @Field(() => Int)
  position!: number;
  @Field(() => ID, { nullable: true })
  mediaObjectId!: string | null;
  @Field(() => Int, { nullable: true })
  suggestedMinutes!: number | null;
  @Field(() => Int, { nullable: true })
  minimumWords!: number | null;
  @Field(() => Int, { nullable: true })
  preparationSeconds!: number | null;
  @Field(() => Int, { nullable: true })
  responseSeconds!: number | null;
  @Field(() => [TeacherTestSectionTranslationObject])
  translations!: TeacherTestSectionTranslationObject[];
  @Field(() => [TeacherTestSectionBlockObject])
  blocks!: TeacherTestSectionBlockObject[];
}

@ObjectType('TeacherQuestionTranslation')
export class TeacherQuestionTranslationObject {
  @Field(() => Language)
  language!: Language;
  @Field(() => String)
  prompt!: string;
  @Field(() => String, { nullable: true })
  rationale!: string | null;
}

@ObjectType('TeacherAnswerOptionTranslation')
export class TeacherAnswerOptionTranslationObject {
  @Field(() => Language)
  language!: Language;
  @Field(() => String)
  text!: string;
}

@ObjectType('TeacherAnswerOption')
export class TeacherAnswerOptionObject {
  @Field(() => ID)
  id!: string;
  @Field(() => Int)
  position!: number;
  @Field(() => Boolean)
  isCorrect!: boolean;
  @Field(() => [TeacherAnswerOptionTranslationObject])
  translations!: TeacherAnswerOptionTranslationObject[];
}

@ObjectType('TeacherTestQuestion')
export class TeacherTestQuestionObject {
  @Field(() => ID)
  id!: string;
  @Field(() => Int)
  position!: number;
  @Field(() => ID, { nullable: true })
  sectionId!: string | null;
  @Field(() => Int, { nullable: true })
  sectionPosition!: number | null;
  @Field(() => QuestionKind)
  kind!: QuestionKind;
  @Field(() => Int, { nullable: true })
  answerLimit!: number | null;
  @Field(() => Int, { nullable: true })
  maxSelections!: number | null;
  @Field(() => [String])
  acceptedAnswers!: string[];
  @Field(() => [TeacherQuestionTranslationObject])
  translations!: TeacherQuestionTranslationObject[];
  @Field(() => [TeacherAnswerOptionObject])
  options!: TeacherAnswerOptionObject[];
}

@ObjectType('TeacherTestVersion')
export class TeacherTestVersionObject {
  @Field(() => ID)
  id!: string;
  @Field(() => ID)
  testId!: string;
  @Field(() => Int)
  version!: number;
  @Field(() => TestVersionStatus)
  status!: TestVersionStatus;
  @Field(() => Language)
  primaryLanguage!: Language;
  @Field(() => GraphQLISODateTime, { nullable: true })
  availabilityStartsAt!: Date | null;
  @Field(() => GraphQLISODateTime, { nullable: true })
  availabilityEndsAt!: Date | null;
  @Field(() => Int, { nullable: true })
  durationMinutes!: number | null;
  @Field(() => Int)
  attemptLimit!: number;
  @Field(() => Int)
  passingPercentage!: number;
  @Field(() => String)
  scoringRuleVersion!: string;
  @Field(() => GraphQLISODateTime, { nullable: true })
  publishedAt!: Date | null;
  @Field(() => [TeacherTestTranslationObject])
  translations!: TeacherTestTranslationObject[];
  @Field(() => [TeacherTestSectionObject])
  sections!: TeacherTestSectionObject[];
  @Field(() => [TeacherTestQuestionObject])
  questions!: TeacherTestQuestionObject[];
}

@ObjectType('TeacherTestDraftValidationIssue')
export class TeacherTestDraftValidationIssueObject {
  @Field(() => String)
  code!: string;
  @Field(() => String)
  severity!: 'ERROR';
  @Field(() => String)
  path!: string;
  @Field(() => String)
  message!: string;
}

@ObjectType('TeacherTestDraftValidation')
export class TeacherTestDraftValidationObject {
  @Field(() => Boolean)
  isPublishable!: boolean;
  @Field(() => [TeacherTestDraftValidationIssueObject])
  issues!: TeacherTestDraftValidationIssueObject[];
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

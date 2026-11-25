import { Language, TestVersionStatus } from '@best/database';
import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';

import { TeacherTestQuestionObject } from './test-question.object';
import { TeacherTestSectionObject } from './test-section.object';

@ObjectType('TeacherTestTranslation')
export class TeacherTestTranslationObject {
  @Field(() => Language)
  language!: Language;
  @Field(() => String)
  title!: string;
  @Field(() => String, { nullable: true })
  description!: string | null;
}

@ObjectType('TeacherTestVersion')
export class TeacherTestVersionObject {
  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;

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

@ObjectType('TeacherTestVersionPayload')
export class TeacherTestVersionPayloadObject {
  @Field(() => TeacherTestVersionObject)
  testVersion!: TeacherTestVersionObject;
}

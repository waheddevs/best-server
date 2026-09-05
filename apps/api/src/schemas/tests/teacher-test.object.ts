import { ContentStatus, Language, TestVersionStatus } from '@best/database';
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

@ObjectType('TeacherQuestionTranslation')
export class TeacherQuestionTranslationObject {
  @Field(() => Language)
  language!: Language;
  @Field(() => String)
  prompt!: string;
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
  @Field(() => [TeacherTestQuestionObject])
  questions!: TeacherTestQuestionObject[];
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

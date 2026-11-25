import { Language } from '@best/database';
import { Field, GraphQLISODateTime, ID, InputType, Int } from '@nestjs/graphql';

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

@InputType('CreateTestSectionInput')
export class CreateTestSectionInput {
  @Field(() => GraphQLISODateTime)
  expectedUpdatedAt!: Date;

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
  @Field(() => GraphQLISODateTime)
  expectedUpdatedAt!: Date;

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
  @Field(() => GraphQLISODateTime)
  expectedUpdatedAt!: Date;

  @Field(() => ID)
  testVersionId!: string;

  @Field(() => [ID])
  testSectionIds!: string[];
}

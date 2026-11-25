import { Language, TestSectionBlockKind } from '@best/database';
import { Field, GraphQLISODateTime, ID, InputType, Int } from '@nestjs/graphql';

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

@InputType('CreateTestSectionBlockInput')
export class CreateTestSectionBlockInput {
  @Field(() => GraphQLISODateTime)
  expectedUpdatedAt!: Date;

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
  @Field(() => GraphQLISODateTime)
  expectedUpdatedAt!: Date;

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
  @Field(() => GraphQLISODateTime)
  expectedUpdatedAt!: Date;

  @Field(() => ID)
  testSectionId!: string;

  @Field(() => [ID])
  testSectionBlockIds!: string[];
}

import { Language, TestSectionBlockKind } from '@best/database';
import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

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

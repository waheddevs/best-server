import { Language } from '@best/database';
import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

import { TeacherTestSectionBlockObject } from './test-section-block.object';

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

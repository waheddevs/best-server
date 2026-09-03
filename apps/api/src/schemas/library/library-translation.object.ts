import { Language } from '@best/database';
import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType('LibraryTranslation')
export class LibraryTranslationObject {
  @Field(() => Language)
  language!: Language;

  @Field(() => String)
  title!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;
}

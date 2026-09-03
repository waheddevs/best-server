import { Language } from '@best/database';
import { Field, InputType } from '@nestjs/graphql';

@InputType('LibraryTranslationInput')
export class LibraryTranslationInput {
  @Field(() => Language)
  language!: Language;

  @Field(() => String)
  title!: string;

  @Field(() => String, { nullable: true })
  description?: string;
}

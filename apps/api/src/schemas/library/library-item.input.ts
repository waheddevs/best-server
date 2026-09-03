import { Language, LibraryVisibility } from '@best/database';
import { Field, ID, InputType } from '@nestjs/graphql';

import { LibraryTranslationInput } from './library-translation.input';

@InputType('CreateLibraryItemInput')
export class CreateLibraryItemInput {
  @Field(() => ID)
  categoryId!: string;

  @Field(() => Language)
  primaryLanguage!: Language;

  @Field(() => LibraryVisibility)
  visibility!: LibraryVisibility;

  @Field(() => [LibraryTranslationInput])
  translations!: LibraryTranslationInput[];

  @Field(() => [ID])
  groupIds!: string[];

  @Field(() => [ID])
  mediaObjectIds!: string[];
}

@InputType('UpdateLibraryItemInput')
export class UpdateLibraryItemInput extends CreateLibraryItemInput {
  @Field(() => ID)
  libraryItemId!: string;
}

@InputType('SetLibraryItemArchivedInput')
export class SetLibraryItemArchivedInput {
  @Field(() => ID)
  libraryItemId!: string;

  @Field(() => Boolean)
  archived!: boolean;
}

@InputType('CreateLibraryDownloadIntentInput')
export class CreateLibraryDownloadIntentInput {
  @Field(() => ID)
  libraryItemId!: string;

  @Field(() => ID)
  mediaObjectId!: string;
}

import { Field, ObjectType } from '@nestjs/graphql';

import { MediaDownloadIntentObject } from '../assets/media-download-intent.object';
import { LibraryCategoryObject } from './library-category.object';
import { TeacherLibraryItemObject } from './library-item.object';

@ObjectType('LibraryCategoryPayload')
export class LibraryCategoryPayloadObject {
  @Field(() => LibraryCategoryObject)
  category!: LibraryCategoryObject;
}

@ObjectType('LibraryItemPayload')
export class LibraryItemPayloadObject {
  @Field(() => TeacherLibraryItemObject)
  item!: TeacherLibraryItemObject;
}

@ObjectType('LibraryDownloadIntentPayload')
export class LibraryDownloadIntentPayloadObject {
  @Field(() => MediaDownloadIntentObject)
  downloadIntent!: MediaDownloadIntentObject;
}

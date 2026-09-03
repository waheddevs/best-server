import { ContentStatus, Language, LibraryVisibility } from '@best/database';
import { Field, GraphQLISODateTime, ID, ObjectType } from '@nestjs/graphql';

import { LibraryAttachmentObject } from './library-attachment.object';
import { LibraryCategoryObject } from './library-category.object';
import { LibraryTranslationObject } from './library-translation.object';

@ObjectType('TeacherLibraryItem')
export class TeacherLibraryItemObject {
  @Field(() => ID)
  id!: string;

  @Field(() => LibraryCategoryObject)
  category!: LibraryCategoryObject;

  @Field(() => Language)
  primaryLanguage!: Language;

  @Field(() => LibraryVisibility)
  visibility!: LibraryVisibility;

  @Field(() => ContentStatus)
  status!: ContentStatus;

  @Field(() => GraphQLISODateTime, { nullable: true })
  archivedAt!: Date | null;

  @Field(() => [LibraryTranslationObject])
  translations!: LibraryTranslationObject[];

  @Field(() => [ID])
  groupIds!: string[];

  @Field(() => [LibraryAttachmentObject])
  attachments!: LibraryAttachmentObject[];

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;
}

@ObjectType('StudentLibraryItem')
export class StudentLibraryItemObject {
  @Field(() => ID)
  id!: string;

  @Field(() => LibraryCategoryObject)
  category!: LibraryCategoryObject;

  @Field(() => Language)
  language!: Language;

  @Field(() => String)
  title!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => [LibraryAttachmentObject])
  attachments!: LibraryAttachmentObject[];

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;
}

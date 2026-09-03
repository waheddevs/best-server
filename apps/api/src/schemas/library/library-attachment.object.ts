import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

import { MediaObjectObject } from '../assets/media-object.object';

@ObjectType('LibraryAttachment')
export class LibraryAttachmentObject {
  @Field(() => ID)
  id!: string;

  @Field(() => Int)
  position!: number;

  @Field(() => MediaObjectObject)
  mediaObject!: MediaObjectObject;
}

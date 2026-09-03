import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';

import { MediaUploadHeaderObject } from './media-upload-header.object';

@ObjectType('MediaUploadIntent')
export class MediaUploadIntentObject {
  @Field(() => ID)
  mediaObjectId!: string;

  @Field(() => String)
  method!: string;

  @Field(() => String)
  url!: string;

  @Field(() => [MediaUploadHeaderObject])
  requiredHeaders!: readonly MediaUploadHeaderObject[];

  @Field(() => Int)
  sizeBytes!: number;

  @Field(() => GraphQLISODateTime)
  expiresAt!: Date;
}

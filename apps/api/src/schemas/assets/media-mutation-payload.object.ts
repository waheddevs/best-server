import { Field, ObjectType } from '@nestjs/graphql';

import { MediaDownloadIntentObject } from './media-download-intent.object';
import { MediaObjectObject } from './media-object.object';
import { MediaUploadIntentObject } from './media-upload-intent.object';

@ObjectType('CreateMediaUploadIntentPayload')
export class CreateMediaUploadIntentPayloadObject {
  @Field(() => MediaUploadIntentObject)
  uploadIntent!: MediaUploadIntentObject;
}

@ObjectType('ConfirmMediaUploadPayload')
export class ConfirmMediaUploadPayloadObject {
  @Field(() => MediaObjectObject)
  mediaObject!: MediaObjectObject;
}

@ObjectType('CreateMediaDownloadIntentPayload')
export class CreateMediaDownloadIntentPayloadObject {
  @Field(() => MediaDownloadIntentObject)
  downloadIntent!: MediaDownloadIntentObject;
}

import {
  Field,
  ObjectType,
  GraphQLISODateTime,
  ID,
  Int,
} from '@nestjs/graphql';

@ObjectType('MediaUploadHeader')
export class MediaUploadHeaderObject {
  @Field(() => String)
  name!: string;

  @Field(() => String)
  value!: string;
}

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

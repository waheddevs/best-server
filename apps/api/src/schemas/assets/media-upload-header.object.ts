import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType('MediaUploadHeader')
export class MediaUploadHeaderObject {
  @Field(() => String)
  name!: string;

  @Field(() => String)
  value!: string;
}

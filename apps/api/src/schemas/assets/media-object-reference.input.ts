import { Field, ID, InputType } from '@nestjs/graphql';

@InputType('MediaObjectReferenceInput')
export class MediaObjectReferenceInput {
  @Field(() => ID)
  mediaObjectId!: string;
}

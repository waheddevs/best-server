import { Field, InputType, Int } from '@nestjs/graphql';

@InputType('CreateMediaUploadIntentInput')
export class CreateMediaUploadIntentInput {
  @Field(() => String)
  originalName!: string;

  @Field(() => String)
  mimeType!: string;

  @Field(() => Int)
  sizeBytes!: number;
}

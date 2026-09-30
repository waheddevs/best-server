import { Field, ID, InputType, Int } from '@nestjs/graphql';

@InputType('CreateAttemptAudioUploadInput')
export class CreateAttemptAudioUploadInput {
  @Field(() => ID)
  attemptId!: string;

  @Field(() => ID)
  questionId!: string;

  @Field(() => String)
  originalName!: string;

  @Field(() => String)
  mimeType!: string;

  @Field(() => Int)
  sizeBytes!: number;
}

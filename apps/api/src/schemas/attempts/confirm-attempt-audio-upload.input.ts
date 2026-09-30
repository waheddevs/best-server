import { Field, ID, InputType } from '@nestjs/graphql';

@InputType('ConfirmAttemptAudioUploadInput')
export class ConfirmAttemptAudioUploadInput {
  @Field(() => ID)
  attemptId!: string;

  @Field(() => ID)
  questionId!: string;

  @Field(() => ID)
  mediaObjectId!: string;
}

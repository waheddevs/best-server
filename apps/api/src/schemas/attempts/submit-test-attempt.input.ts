import { Field, ID, InputType } from '@nestjs/graphql';

@InputType('SubmitTestAttemptInput')
export class SubmitTestAttemptInput {
  @Field(() => ID)
  attemptId!: string;
}

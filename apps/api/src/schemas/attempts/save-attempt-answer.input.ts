import { Field, ID, InputType } from '@nestjs/graphql';

@InputType('SaveAttemptAnswerInput')
export class SaveAttemptAnswerInput {
  @Field(() => ID)
  attemptId!: string;

  @Field(() => ID)
  questionId!: string;

  @Field(() => ID)
  selectedOptionId!: string;
}

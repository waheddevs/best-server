import { Field, ID, InputType } from '@nestjs/graphql';

@InputType('SaveAttemptAnswerInput')
export class SaveAttemptAnswerInput {
  @Field(() => ID)
  attemptId!: string;

  @Field(() => ID)
  questionId!: string;

  @Field(() => ID, { nullable: true })
  selectedOptionId?: string;

  @Field(() => [ID], { nullable: true })
  selectedOptionIds?: string[];

  @Field(() => String, { nullable: true })
  textValue?: string;

  @Field(() => ID, { nullable: true })
  responseMediaObjectId?: string;
}

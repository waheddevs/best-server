import { Language } from '@best/database';
import { Field, ID, InputType } from '@nestjs/graphql';

@InputType('StartTestAttemptInput')
export class StartTestAttemptInput {
  @Field(() => ID)
  testId!: string;

  @Field(() => Language)
  language!: Language;
}

import { Field, ID, InputType } from '@nestjs/graphql';

@InputType('SetPracticeBookmarkInput')
export class SetPracticeBookmarkInput {
  @Field(() => ID)
  testPaperId!: string;

  @Field(() => Boolean)
  saved!: boolean;
}

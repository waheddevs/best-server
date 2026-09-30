import { Field, ID, InputType } from '@nestjs/graphql';

@InputType('CreateTeacherPracticeTestInput')
export class CreateTeacherPracticeTestInput {
  @Field(() => ID)
  groupId!: string;
}

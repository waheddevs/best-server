import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('StudentAnswerOption')
export class StudentAnswerOptionObject {
  @Field(() => ID)
  id!: string;

  @Field(() => Int)
  position!: number;

  @Field(() => String)
  text!: string;
}

@ObjectType('StudentQuestion')
export class StudentQuestionObject {
  @Field(() => ID)
  id!: string;

  @Field(() => Int)
  position!: number;

  @Field(() => String)
  prompt!: string;

  @Field(() => [StudentAnswerOptionObject])
  options!: StudentAnswerOptionObject[];
}

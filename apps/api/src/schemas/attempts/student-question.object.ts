import { QuestionKind } from '@best/database';
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

  @Field(() => ID, { nullable: true })
  sectionId!: string | null;

  @Field(() => QuestionKind)
  kind!: QuestionKind;

  @Field(() => Int, { nullable: true })
  answerLimit!: number | null;

  @Field(() => Int, { nullable: true })
  maxSelections!: number | null;

  @Field(() => String)
  prompt!: string;

  @Field(() => [StudentAnswerOptionObject])
  options!: StudentAnswerOptionObject[];
}

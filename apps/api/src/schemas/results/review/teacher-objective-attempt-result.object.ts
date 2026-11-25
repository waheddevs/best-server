import { TestSkill } from '@best/database';
import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('TeacherObjectiveResultAnswer')
export class TeacherObjectiveResultAnswerObject {
  @Field(() => Int)
  position!: number;

  @Field(() => String)
  prompt!: string;

  @Field(() => [String])
  studentAnswer!: string[];

  @Field(() => [String])
  correctAnswer!: string[];

  @Field(() => Boolean)
  isCorrect!: boolean;
}

@ObjectType('TeacherObjectiveAttemptResult')
export class TeacherObjectiveAttemptResultObject {
  @Field(() => ID)
  attemptId!: string;

  @Field(() => String)
  studentDisplayName!: string;

  @Field(() => String)
  title!: string;

  @Field(() => TestSkill)
  skill!: TestSkill;

  @Field(() => Int)
  correctAnswerCount!: number;

  @Field(() => Int)
  totalQuestionCount!: number;

  @Field(() => Float)
  percentage!: number;

  @Field(() => [TeacherObjectiveResultAnswerObject])
  answers!: TeacherObjectiveResultAnswerObject[];
}

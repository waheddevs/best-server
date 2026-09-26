import { TestSkill } from '@best/database';
import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('StudentReleasedResultSection')
export class StudentReleasedResultSectionObject {
  @Field(() => ID)
  id!: string;

  @Field(() => Int)
  position!: number;

  @Field(() => String)
  title!: string;

  @Field(() => String)
  content!: string;
}

@ObjectType('StudentReleasedResultAnswer')
export class StudentReleasedResultAnswerObject {
  @Field(() => ID)
  questionId!: string;

  @Field(() => ID, { nullable: true })
  sectionId!: string | null;

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

  @Field(() => Int, { nullable: true })
  evidenceStartOffset!: number | null;

  @Field(() => Int, { nullable: true })
  evidenceEndOffset!: number | null;
}

@ObjectType('StudentReleasedAttemptResult')
export class StudentReleasedAttemptResultObject {
  @Field(() => ID)
  attemptId!: string;

  @Field(() => ID)
  testId!: string;

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

  @Field(() => [StudentReleasedResultSectionObject])
  sections!: StudentReleasedResultSectionObject[];

  @Field(() => [StudentReleasedResultAnswerObject])
  answers!: StudentReleasedResultAnswerObject[];
}

import { AttemptStatus, TestSkill } from '@best/database';
import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('StudentTestPaperSkill')
export class StudentTestPaperSkillObject {
  @Field(() => ID)
  testId!: string;

  @Field(() => ID)
  testVersionId!: string;

  @Field(() => TestSkill)
  skill!: TestSkill;

  @Field(() => String)
  title!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => Int, { nullable: true })
  durationMinutes!: number | null;

  @Field(() => Int)
  questionCount!: number;

  @Field(() => ID, { nullable: true })
  attemptId!: string | null;

  @Field(() => AttemptStatus, { nullable: true })
  attemptStatus!: AttemptStatus | null;
}

@ObjectType('StudentTestPaper')
export class StudentTestPaperObject {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  slug!: string;

  @Field(() => Int)
  academicYear!: number;

  @Field(() => String)
  title!: string;

  @Field(() => String)
  sourceLabel!: string;

  @Field(() => [StudentTestPaperSkillObject])
  skills!: StudentTestPaperSkillObject[];
}

import { IeltsModule, TestSkill, TestVersionStatus } from '@best/database';
import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';

@ObjectType('TeacherTestPaperSkill')
export class TeacherTestPaperSkillObject {
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

  @Field(() => TestVersionStatus)
  status!: TestVersionStatus;
}

@ObjectType('TeacherTestPaper')
export class TeacherTestPaperObject {
  @Field(() => ID)
  id!: string;

  @Field(() => Int)
  practiceNumber!: number;

  @Field(() => String)
  slug!: string;

  @Field(() => Int)
  academicYear!: number;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => Int)
  completedStudentCount!: number;

  @Field(() => IeltsModule)
  ieltsModule!: IeltsModule;

  @Field(() => String)
  title!: string;

  @Field(() => String)
  sourceLabel!: string;

  @Field(() => Boolean)
  isSaved!: boolean;

  @Field(() => [TeacherTestPaperSkillObject])
  skills!: TeacherTestPaperSkillObject[];
}

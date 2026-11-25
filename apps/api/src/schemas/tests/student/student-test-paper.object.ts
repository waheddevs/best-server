import { AttemptStatus, IeltsModule, TestSkill } from '@best/database';
import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

import { PageInfoObject } from '../../pagination/page-info.object';

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

  @Field(() => IeltsModule)
  ieltsModule!: IeltsModule;

  @Field(() => String)
  title!: string;

  @Field(() => String)
  sourceLabel!: string;

  @Field(() => Boolean)
  isSaved!: boolean;

  @Field(() => [StudentTestPaperSkillObject])
  skills!: StudentTestPaperSkillObject[];
}

@ObjectType('StudentTestPaperEdge')
export class StudentTestPaperEdgeObject {
  @Field(() => String)
  cursor!: string;

  @Field(() => StudentTestPaperObject)
  node!: StudentTestPaperObject;
}

@ObjectType('StudentTestPaperConnection')
export class StudentTestPaperConnectionObject {
  @Field(() => [StudentTestPaperEdgeObject])
  edges!: StudentTestPaperEdgeObject[];

  @Field(() => PageInfoObject)
  pageInfo!: PageInfoObject;
}

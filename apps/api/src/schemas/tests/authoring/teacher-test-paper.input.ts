import { TestSkill } from '@best/database';
import { Field, ID, InputType } from '@nestjs/graphql';

@InputType('CreateTeacherPracticeTestInput')
export class CreateTeacherPracticeTestInput {
  @Field(() => ID)
  groupId!: string;
}

@InputType('CreateTestPaperSkillDraftInput')
export class CreateTestPaperSkillDraftInput {
  @Field(() => ID)
  testPaperId!: string;

  @Field(() => TestSkill)
  skill!: TestSkill;
}

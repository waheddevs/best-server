import { ContentStatus } from '@best/database';
import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('TeacherTestPaperDeletionPayload')
export class TeacherTestPaperDeletionPayloadObject {
  @Field(() => ID)
  testPaperId!: string;

  @Field(() => ContentStatus)
  status!: ContentStatus;

  @Field(() => Int)
  deletedSkillCount!: number;
}

import { AttemptStatus, TestSkill } from '@best/database';
import {
  Field,
  Float,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';

import { PageInfoObject } from '../pagination/page-info.object';

@ObjectType('TeacherResultInboxItem')
export class TeacherResultInboxItemObject {
  @Field(() => ID)
  attemptId!: string;

  @Field(() => ID)
  studentId!: string;

  @Field(() => String)
  studentDisplayName!: string;

  @Field(() => ID)
  groupId!: string;

  @Field(() => String)
  groupName!: string;

  @Field(() => ID, { nullable: true })
  paperId!: string | null;

  @Field(() => Int, { nullable: true })
  practiceNumber!: number | null;

  @Field(() => String)
  title!: string;

  @Field(() => TestSkill, { nullable: true })
  skill!: TestSkill | null;

  @Field(() => AttemptStatus)
  status!: AttemptStatus;

  @Field(() => Int)
  attemptNumber!: number;

  @Field(() => GraphQLISODateTime)
  submittedAt!: Date;

  @Field(() => Float, { nullable: true })
  percentage!: number | null;

  @Field(() => Float, { nullable: true })
  practiceBand!: number | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  releasedAt!: Date | null;
}

@ObjectType('TeacherResultInboxEdge')
export class TeacherResultInboxEdgeObject {
  @Field(() => String)
  cursor!: string;

  @Field(() => TeacherResultInboxItemObject)
  node!: TeacherResultInboxItemObject;
}

@ObjectType('TeacherResultInboxConnection')
export class TeacherResultInboxConnectionObject {
  @Field(() => [TeacherResultInboxEdgeObject])
  edges!: TeacherResultInboxEdgeObject[];

  @Field(() => PageInfoObject)
  pageInfo!: PageInfoObject;

  @Field(() => Int)
  pendingReviewCount!: number;
}

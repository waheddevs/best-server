import { ContentStatus, Language, TestVersionStatus } from '@best/database';
import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

import { PageInfoObject } from '../pagination/page-info.object';

@ObjectType('AdminTestSummary')
export class AdminTestSummaryObject {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  title!: string;

  @Field(() => Language)
  language!: Language;

  @Field(() => ContentStatus)
  status!: ContentStatus;

  @Field(() => ID)
  groupId!: string;

  @Field(() => String)
  groupName!: string;

  @Field(() => ID)
  teacherId!: string;

  @Field(() => String)
  teacherDisplayName!: string;

  @Field(() => Int, { nullable: true })
  latestVersionNumber!: number | null;

  @Field(() => TestVersionStatus, { nullable: true })
  latestVersionStatus!: TestVersionStatus | null;

  @Field(() => Int)
  questionCount!: number;

  @Field(() => Int)
  attemptCount!: number;

  @Field(() => Int)
  awaitingReviewCount!: number;
}

@ObjectType('AdminTestSummaryEdge')
export class AdminTestSummaryEdgeObject {
  @Field(() => String)
  cursor!: string;

  @Field(() => AdminTestSummaryObject)
  node!: AdminTestSummaryObject;
}

@ObjectType('AdminTestSummaryConnection')
export class AdminTestSummaryConnectionObject {
  @Field(() => [AdminTestSummaryEdgeObject])
  edges!: AdminTestSummaryEdgeObject[];

  @Field(() => PageInfoObject)
  pageInfo!: PageInfoObject;
}

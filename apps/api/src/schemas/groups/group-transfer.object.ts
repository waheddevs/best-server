import { TransferRequestStatus } from '@best/database';
import { Field, GraphQLISODateTime, ID, ObjectType } from '@nestjs/graphql';
import { PageInfoObject } from '../pagination/page-info.object';

@ObjectType('GroupTransferRequest')
export class GroupTransferRequestObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  studentId!: string;

  @Field()
  studentDisplayName!: string;

  @Field(() => ID)
  fromGroupId!: string;

  @Field()
  fromGroupName!: string;

  @Field(() => ID)
  toGroupId!: string;

  @Field()
  toGroupName!: string;

  @Field(() => TransferRequestStatus)
  status!: TransferRequestStatus;

  @Field()
  reason!: string;

  @Field(() => String, { nullable: true })
  reviewNote?: string | null;

  @Field()
  createdAt!: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  reviewedAt?: Date | null;
}

@ObjectType('GroupTransferRequestEdge')
export class GroupTransferRequestEdgeObject {
  @Field()
  cursor!: string;

  @Field(() => GroupTransferRequestObject)
  node!: GroupTransferRequestObject;
}

@ObjectType('GroupTransferRequestConnection')
export class GroupTransferRequestConnectionObject {
  @Field(() => [GroupTransferRequestEdgeObject])
  edges!: GroupTransferRequestEdgeObject[];

  @Field(() => PageInfoObject)
  pageInfo!: PageInfoObject;
}

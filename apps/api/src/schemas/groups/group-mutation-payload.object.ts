import { Field, ObjectType } from '@nestjs/graphql';

import { GroupTransferRequestObject } from './group-transfer.object';
import { GroupObject, GroupRosterMemberObject } from './group.object';

@ObjectType('GroupMutationPayload')
export class GroupMutationPayloadObject {
  @Field(() => GroupObject)
  group!: GroupObject;
}

@ObjectType('MembershipMutationPayload')
export class MembershipMutationPayloadObject {
  @Field(() => GroupRosterMemberObject)
  membership!: GroupRosterMemberObject;
}

@ObjectType('TransferRequestMutationPayload')
export class TransferRequestMutationPayloadObject {
  @Field(() => GroupTransferRequestObject)
  transferRequest!: GroupTransferRequestObject;
}

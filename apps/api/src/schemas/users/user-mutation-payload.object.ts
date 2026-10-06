import { Field, ObjectType } from '@nestjs/graphql';

import { AdminUserObject } from './admin-user.object';
import { UserProfileObject } from './user-profile.object';

@ObjectType('UpdateMyProfilePayload')
export class UpdateMyProfilePayloadObject {
  @Field(() => UserProfileObject)
  profile!: UserProfileObject;
}

@ObjectType('ChangeMyPasswordPayload')
export class ChangeMyPasswordPayloadObject {
  @Field()
  changed!: boolean;
}

@ObjectType('DeleteMyAccountPayload')
export class DeleteMyAccountPayloadObject {
  @Field()
  deleted!: boolean;
}

@ObjectType('AdminUserMutationPayload')
export class AdminUserMutationPayloadObject {
  @Field(() => AdminUserObject)
  user!: AdminUserObject;
}

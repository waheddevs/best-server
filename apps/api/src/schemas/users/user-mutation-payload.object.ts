import { Field, ObjectType } from '@nestjs/graphql';

import { AdminUserObject } from './admin-user.object';
import { UserProfileObject } from './user-profile.object';

@ObjectType('UpdateMyProfilePayload')
export class UpdateMyProfilePayloadObject {
  @Field(() => UserProfileObject)
  profile!: UserProfileObject;
}

@ObjectType('AdminUserMutationPayload')
export class AdminUserMutationPayloadObject {
  @Field(() => AdminUserObject)
  user!: AdminUserObject;
}

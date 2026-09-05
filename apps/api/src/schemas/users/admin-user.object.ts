import { Field, ObjectType } from '@nestjs/graphql';

import { UserProfileObject } from './user-profile.object';

@ObjectType('AdminUser')
export class AdminUserObject extends UserProfileObject {
  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

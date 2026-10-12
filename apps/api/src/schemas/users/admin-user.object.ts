import { Field, GraphQLISODateTime, ID, ObjectType } from '@nestjs/graphql';

import { UserProfileObject } from './user-profile.object';

@ObjectType('AdminUser')
export class AdminUserObject extends UserProfileObject {
  @Field(() => ID, { nullable: true })
  activeGroupId?: string | null;

  @Field(() => String, { nullable: true })
  activeGroupName?: string | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  activeMembershipStartedAt?: Date | null;

  @Field(() => ID, { nullable: true })
  activeTeacherId?: string | null;

  @Field(() => String, { nullable: true })
  activeTeacherName?: string | null;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

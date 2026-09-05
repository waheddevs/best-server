import { UserRole, UserStatus } from '@best/database';
import { Field, ID, InputType } from '@nestjs/graphql';

@InputType('AdminSetUserStatusInput')
export class AdminSetUserStatusInput {
  @Field(() => ID)
  userId!: string;

  @Field(() => UserStatus)
  status!: UserStatus;

  @Field()
  reason!: string;
}

@InputType('AdminSetUserRoleInput')
export class AdminSetUserRoleInput {
  @Field(() => ID)
  userId!: string;

  @Field(() => UserRole)
  role!: UserRole;

  @Field()
  reason!: string;
}

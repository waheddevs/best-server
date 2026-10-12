import { UserRole, UserStatus } from '@best/database';
import { Field, ID, InputType } from '@nestjs/graphql';

@InputType('AdminProvisionUserInput')
export class AdminProvisionUserInput {
  @Field()
  displayName!: string;

  @Field()
  email!: string;

  @Field()
  password!: string;

  @Field(() => ID, { nullable: true })
  groupId?: string;

  @Field(() => UserRole)
  role!: UserRole;
}

@InputType('AdminDeleteStudentInput')
export class AdminDeleteStudentInput {
  @Field(() => ID)
  studentId!: string;
}

@InputType('AdminDeleteTeacherInput')
export class AdminDeleteTeacherInput {
  @Field(() => ID)
  teacherId!: string;
}

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

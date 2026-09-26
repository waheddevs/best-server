import { GroupMembershipStatus, TransferRequestStatus } from '@best/database';
import { Field, ID, InputType } from '@nestjs/graphql';

@InputType('AddStudentToGroupInput')
export class AddStudentToGroupInput {
  @Field(() => ID)
  groupId!: string;

  @Field(() => ID)
  studentId!: string;
}

@InputType('TeacherCreateStudentInGroupInput')
export class TeacherCreateStudentInGroupInput {
  @Field(() => ID)
  groupId!: string;

  @Field()
  firstName!: string;

  @Field()
  lastName!: string;

  @Field()
  phone!: string;

  @Field()
  email!: string;

  @Field()
  password!: string;
}

@InputType('EndGroupMembershipInput')
export class EndGroupMembershipInput {
  @Field(() => ID)
  membershipId!: string;

  @Field()
  reason!: string;
}

@InputType('TeacherDeleteStudentInput')
export class TeacherDeleteStudentInput {
  @Field(() => ID)
  membershipId!: string;
}

@InputType('SetGroupMembershipParticipationStatusInput')
export class SetGroupMembershipParticipationStatusInput {
  @Field(() => ID)
  membershipId!: string;

  @Field(() => GroupMembershipStatus)
  status!: GroupMembershipStatus;

  @Field()
  reason!: string;
}

@InputType('RequestStudentTransferInput')
export class RequestStudentTransferInput {
  @Field(() => ID)
  studentId!: string;

  @Field(() => ID)
  toGroupId!: string;

  @Field()
  reason!: string;
}

@InputType('ReviewStudentTransferInput')
export class ReviewStudentTransferInput {
  @Field(() => ID)
  transferRequestId!: string;

  @Field(() => TransferRequestStatus)
  decision!: TransferRequestStatus;

  @Field()
  reviewNote!: string;
}

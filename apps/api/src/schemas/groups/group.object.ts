import { ContentStatus, GroupCategory, UserStatus } from '@best/database';
import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';

import { GroupRosterStatus } from './group-roster-status.enum';

@ObjectType('Group')
export class GroupObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  teacherId!: string;

  @Field()
  name!: string;

  @Field(() => GroupCategory, { nullable: true })
  category?: GroupCategory | null;

  @Field()
  slug!: string;

  @Field(() => Int)
  activeStudentCount!: number;

  @Field(() => String, { nullable: true })
  monthlyTuitionUzs?: string | null;

  @Field(() => String, { nullable: true })
  room?: string | null;

  @Field(() => [Int])
  scheduleDays!: number[];

  @Field(() => Int, { nullable: true })
  startsAtMinutes?: number | null;

  @Field(() => Int, { nullable: true })
  endsAtMinutes?: number | null;

  @Field()
  timeZone!: string;

  @Field(() => ContentStatus)
  status!: ContentStatus;

  @Field(() => GraphQLISODateTime, { nullable: true })
  archivedAt?: Date | null;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@ObjectType('StudentCurrentGroup')
export class StudentCurrentGroupObject {
  @Field(() => ID)
  membershipId!: string;

  @Field()
  startedAt!: Date;

  @Field(() => GroupObject)
  group!: GroupObject;
}

@ObjectType('GroupRosterPayment')
export class GroupRosterPaymentObject {
  @Field(() => ID)
  id!: string;

  @Field()
  amountUzs!: string;

  @Field(() => GraphQLISODateTime)
  paidAt!: Date;
}

@ObjectType('GroupRosterMember')
export class GroupRosterMemberObject {
  @Field(() => ID)
  membershipId!: string;

  @Field(() => ID)
  studentId!: string;

  @Field()
  displayName!: string;

  @Field(() => String, { nullable: true })
  email?: string | null;

  @Field(() => String, { nullable: true })
  phone?: string | null;

  @Field(() => UserStatus)
  status!: UserStatus;

  @Field(() => GroupRosterStatus)
  rosterStatus!: GroupRosterStatus;

  @Field()
  outstandingBalanceUzs!: string;

  @Field()
  paidAmountUzs!: string;

  @Field(() => [GroupRosterPaymentObject])
  recentPayments!: GroupRosterPaymentObject[];

  @Field()
  startedAt!: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  endedAt?: Date | null;
}

@ObjectType('TeacherGroupRosterSummary')
export class TeacherGroupRosterSummaryObject {
  @Field(() => Int)
  currentTotal!: number;

  @Field(() => Int)
  historicalTotal!: number;

  @Field(() => Int)
  active!: number;

  @Field(() => Int)
  paused!: number;

  @Field(() => Int)
  debtors!: number;

  @Field(() => Int)
  departed!: number;
}

@ObjectType('TeacherGroupOverview')
export class TeacherGroupOverviewObject {
  @Field(() => Int)
  activeAssignmentCount!: number;

  @Field(() => Int)
  scheduledTestCount!: number;

  @Field(() => Int)
  materialCount!: number;

  @Field(() => Int)
  currentStudentCount!: number;
}

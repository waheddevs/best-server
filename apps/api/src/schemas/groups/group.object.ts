import { ContentStatus, UserStatus } from '@best/database';
import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';

@ObjectType('Group')
export class GroupObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  teacherId!: string;

  @Field()
  name!: string;

  @Field()
  slug!: string;

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

  @Field()
  startedAt!: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  endedAt?: Date | null;
}

import { Field, ID, InputType, Int } from '@nestjs/graphql';

@InputType('CreateTeacherGroupInput')
export class CreateTeacherGroupInput {
  @Field()
  name!: string;

  @Field()
  slug!: string;

  @Field(() => String, { nullable: true })
  room?: string;

  @Field(() => [Int])
  scheduleDays!: number[];

  @Field(() => Int, { nullable: true })
  startsAtMinutes?: number;

  @Field(() => Int, { nullable: true })
  endsAtMinutes?: number;

  @Field(() => String, { nullable: true })
  timeZone?: string;
}

@InputType('UpdateTeacherGroupInput')
export class UpdateTeacherGroupInput extends CreateTeacherGroupInput {
  @Field(() => ID)
  groupId!: string;
}

@InputType('SetTeacherGroupArchivedInput')
export class SetTeacherGroupArchivedInput {
  @Field(() => ID)
  groupId!: string;

  @Field()
  archived!: boolean;

  @Field()
  reason!: string;
}

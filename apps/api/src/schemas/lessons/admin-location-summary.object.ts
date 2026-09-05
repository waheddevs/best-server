import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('AdminLocationSummary')
export class AdminLocationSummaryObject {
  @Field(() => String)
  room!: string;

  @Field(() => Int)
  activeGroupCount!: number;

  @Field(() => Int)
  scheduledLessonCount!: number;

  @Field(() => GraphQLISODateTime, { nullable: true })
  nextLessonAt!: Date | null;
}

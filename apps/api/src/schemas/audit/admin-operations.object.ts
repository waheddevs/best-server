import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('AdminOperationalOverview')
export class AdminOperationalOverviewObject {
  @Field(() => Int) activeUsers!: number;
  @Field(() => Int) activeGroups!: number;
  @Field(() => Int) pendingIntakes!: number;
  @Field(() => Int) unreadNotifications!: number;
}

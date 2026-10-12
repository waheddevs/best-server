import { Field, ObjectType, GraphQLISODateTime } from '@nestjs/graphql';
import { AdminMetric } from '../groups/admin-group.object';
@ObjectType('AdminOverviewItem')
export class AdminOverviewItemObject {
  @Field() id!: string;
  @Field() title!: string;
  @Field() subtitle!: string;
  @Field() href!: string;
  @Field(() => GraphQLISODateTime) date!: Date;
}
@ObjectType('AdminOverview')
export class AdminOverviewObject {
  @Field(() => [AdminMetric]) metrics!: AdminMetric[];
  @Field(() => [AdminOverviewItemObject]) lessons!: AdminOverviewItemObject[];
  @Field(() => [AdminOverviewItemObject]) requests!: AdminOverviewItemObject[];
  @Field(() => [AdminOverviewItemObject]) upcoming!: AdminOverviewItemObject[];
}

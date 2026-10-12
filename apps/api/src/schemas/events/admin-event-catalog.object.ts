import {
  Field,
  ObjectType,
  Int,
  ID,
  GraphQLISODateTime,
} from '@nestjs/graphql';
import { PublicEventObject } from './event.object';
import { AdminMetric } from '../groups/admin-group.object';
@ObjectType('AdminEventEntry')
export class AdminEventEntryObject {
  @Field(() => ID) id!: string;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
  @Field(() => Int) registrations!: number;
  @Field(() => [PublicEventObject]) versions!: PublicEventObject[];
}
@ObjectType('AdminEventCatalog')
export class AdminEventCatalogObject {
  @Field(() => [AdminEventEntryObject]) nodes!: AdminEventEntryObject[];
  @Field(() => [AdminMetric]) metrics!: AdminMetric[];
  @Field(() => Int) totalCount!: number;
  @Field(() => Int) page!: number;
  @Field(() => Int) pageCount!: number;
}

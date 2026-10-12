import {
  Field,
  ObjectType,
  Int,
  ID,
  GraphQLISODateTime,
} from '@nestjs/graphql';
import { PublicCourseObject } from './course.object';
import { AdminMetric } from '../groups/admin-group.object';
@ObjectType('AdminCourseEntry')
export class AdminCourseEntryObject {
  @Field(() => ID) id!: string;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
  @Field(() => Int) registrations!: number;
  @Field(() => [PublicCourseObject]) versions!: PublicCourseObject[];
}
@ObjectType('AdminCourseCatalog')
export class AdminCourseCatalogObject {
  @Field(() => [AdminCourseEntryObject]) nodes!: AdminCourseEntryObject[];
  @Field(() => [AdminMetric]) metrics!: AdminMetric[];
  @Field(() => Int) totalCount!: number;
  @Field(() => Int) page!: number;
  @Field(() => Int) pageCount!: number;
}

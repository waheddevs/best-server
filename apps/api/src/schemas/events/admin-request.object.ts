import { Field, ObjectType, Int, GraphQLISODateTime } from '@nestjs/graphql';
import { AdminIntakeRecordObject } from './event.object';
import { AdminMetric } from '../groups/admin-group.object';
@ObjectType('AdminRequest')
export class AdminRequestObject extends AdminIntakeRecordObject {
  @Field() subjectName!: string;
  @Field() subjectId!: string;
  @Field(() => String, { nullable: true }) currentLevel!: string | null;
  @Field(() => Int, { nullable: true }) participantCount!: number | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) sessionAt!: Date | null;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
}
@ObjectType('AdminRequestDirectory')
export class AdminRequestDirectoryObject {
  @Field(() => [AdminRequestObject]) nodes!: AdminRequestObject[];
  @Field(() => [AdminMetric]) metrics!: AdminMetric[];
  @Field(() => Int) totalCount!: number;
  @Field(() => Int) page!: number;
  @Field(() => Int) pageCount!: number;
}

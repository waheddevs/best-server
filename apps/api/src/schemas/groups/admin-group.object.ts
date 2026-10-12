import { Field, Int, ObjectType } from '@nestjs/graphql';
import { GroupObject } from './group.object';
@ObjectType('AdminGroupRow')
export class AdminGroupRow extends GroupObject {
  @Field() teacherName!: string;
}
@ObjectType('AdminMetric')
export class AdminMetric {
  @Field() key!: string;
  @Field() value!: string;
}
@ObjectType('AdminDirectoryOption')
export class AdminDirectoryOption {
  @Field() id!: string;
  @Field() label!: string;
  @Field(() => String, { nullable: true }) status?: string;
}
@ObjectType('AdminDirectoryOptions')
export class AdminDirectoryOptions {
  @Field(() => [AdminDirectoryOption]) teachers!: AdminDirectoryOption[];
  @Field(() => [AdminDirectoryOption]) groups!: AdminDirectoryOption[];
  @Field(() => [AdminDirectoryOption]) students!: AdminDirectoryOption[];
}
@ObjectType('AdminGroupDirectory')
export class AdminGroupDirectory {
  @Field(() => [AdminGroupRow]) nodes!: AdminGroupRow[];
  @Field(() => [AdminMetric]) metrics!: AdminMetric[];
  @Field(() => Int) totalCount!: number;
  @Field(() => Int) page!: number;
  @Field(() => Int) pageCount!: number;
}

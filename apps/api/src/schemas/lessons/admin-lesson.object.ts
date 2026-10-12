import { Field, Int, ObjectType } from '@nestjs/graphql';
import { LessonObject } from './lesson.object';
import { AdminMetric } from '../groups/admin-group.object';
@ObjectType('AdminLessonRow')
export class AdminLessonRow extends LessonObject {
  @Field() groupName!: string;
  @Field() teacherName!: string;
  @Field() teacherId!: string;
  @Field(() => Int) studentCount!: number;
  @Field() hasConflict!: boolean;
}
@ObjectType('AdminLessonDirectory')
export class AdminLessonDirectory {
  @Field(() => [AdminLessonRow]) nodes!: AdminLessonRow[];
  @Field(() => [AdminMetric]) metrics!: AdminMetric[];
  @Field(() => Int) totalCount!: number;
  @Field(() => Int) page!: number;
  @Field(() => Int) pageCount!: number;
}

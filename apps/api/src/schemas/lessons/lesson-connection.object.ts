import { Field, ObjectType } from '@nestjs/graphql';
import { PageInfoObject } from '../pagination/page-info.object';
import { LessonObject } from './lesson.object';

@ObjectType('LessonEdge')
export class LessonEdgeObject {
  @Field(() => String) cursor!: string;
  @Field(() => LessonObject) node!: LessonObject;
}

@ObjectType('LessonConnection')
export class LessonConnectionObject {
  @Field(() => [LessonEdgeObject]) edges!: LessonEdgeObject[];
  @Field(() => PageInfoObject) pageInfo!: PageInfoObject;
}

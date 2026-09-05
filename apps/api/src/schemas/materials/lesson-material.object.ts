import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';
import { PageInfoObject } from '../pagination/page-info.object';
@ObjectType('LessonMaterial')
export class LessonMaterialObject {
  @Field(() => ID) id!: string;
  @Field(() => ID) groupId!: string;
  @Field(() => ID, { nullable: true }) lessonId!: string | null;
  @Field(() => ID) libraryItemId!: string;
  @Field(() => Int) position!: number;
  @Field(() => GraphQLISODateTime, { nullable: true }) archivedAt!: Date | null;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
}
@ObjectType('LessonMaterialEdge')
export class LessonMaterialEdgeObject {
  @Field(() => String) cursor!: string;
  @Field(() => LessonMaterialObject) node!: LessonMaterialObject;
}
@ObjectType('LessonMaterialConnection')
export class LessonMaterialConnectionObject {
  @Field(() => [LessonMaterialEdgeObject]) edges!: LessonMaterialEdgeObject[];
  @Field(() => PageInfoObject) pageInfo!: PageInfoObject;
}
@ObjectType('LessonMaterialPayload')
export class LessonMaterialPayloadObject {
  @Field(() => LessonMaterialObject) material!: LessonMaterialObject;
}

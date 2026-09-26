import { LessonMaterialKind } from '@best/database';
import { Field, ID, InputType, Int } from '@nestjs/graphql';
@InputType('CreateLessonMaterialInput')
export class CreateLessonMaterialInput {
  @Field(() => ID) groupId!: string;
  @Field(() => ID, { nullable: true }) lessonId?: string;
  @Field(() => ID) libraryItemId!: string;
  @Field(() => LessonMaterialKind, {
    defaultValue: LessonMaterialKind.MATERIAL,
  })
  kind!: LessonMaterialKind;
  @Field(() => Int, { defaultValue: 1 }) position!: number;
}
@InputType('UpdateLessonMaterialInput')
export class UpdateLessonMaterialInput extends CreateLessonMaterialInput {
  @Field(() => ID) materialId!: string;
}
@InputType('SetLessonMaterialArchivedInput')
export class SetLessonMaterialArchivedInput {
  @Field(() => ID) materialId!: string;
  @Field(() => Boolean) archived!: boolean;
}

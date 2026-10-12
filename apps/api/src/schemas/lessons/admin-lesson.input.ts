import { Field, ID, InputType } from '@nestjs/graphql';
import { CreateLessonInput } from './lesson.input';
@InputType('AdminSaveLessonInput')
export class AdminSaveLessonInput extends CreateLessonInput {
  @Field(() => ID, { nullable: true }) lessonId?: string;
  @Field(() => String, { nullable: true }) expectedUpdatedAt?: string;
}

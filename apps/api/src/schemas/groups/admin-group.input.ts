import { Field, ID, InputType } from '@nestjs/graphql';
import { CreateTeacherGroupInput } from './group.input';
@InputType('AdminSaveGroupInput')
export class AdminSaveGroupInput extends CreateTeacherGroupInput {
  @Field(() => ID) teacherId!: string;
  @Field(() => ID, { nullable: true }) groupId?: string;
  @Field(() => String, { nullable: true }) expectedUpdatedAt?: string;
}

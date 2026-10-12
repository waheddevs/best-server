import { Field, InputType, Int } from '@nestjs/graphql';
@InputType('AdminDirectoryInput')
export class AdminDirectoryInput {
  @Field(() => Int, { defaultValue: 1 }) page = 1;
  @Field(() => Int, { defaultValue: 15 }) pageSize = 15;
  @Field(() => String, { nullable: true }) search?: string;
  @Field(() => String, { nullable: true }) status?: string;
  @Field(() => String, { nullable: true }) teacherId?: string;
  @Field(() => String, { nullable: true }) groupId?: string;
  @Field(() => String, { nullable: true }) studentId?: string;
  @Field(() => String, { nullable: true }) category?: string;
  @Field(() => String, { nullable: true }) month?: string;
  @Field(() => String, { nullable: true }) from?: string;
  @Field(() => String, { nullable: true }) to?: string;
  @Field(() => String, { nullable: true }) room?: string;
  @Field(() => String, { nullable: true }) sort?: string;
  @Field(() => Boolean, { defaultValue: false }) descending = false;
}

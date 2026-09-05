import { Language, PublicContentStatus } from '@best/database';
import { Field, ID, InputType } from '@nestjs/graphql';
@InputType('PublicContentTranslationInput')
export class PublicContentTranslationInput {
  @Field(() => Language) language!: Language;
  @Field(() => String) title!: string;
  @Field(() => String) description!: string;
}
@InputType('UpsertCourseInput')
export class UpsertCourseInput {
  @Field(() => String) slug!: string;
  @Field(() => ID, { nullable: true }) coverMediaId?: string;
  @Field(() => [PublicContentTranslationInput])
  translations!: PublicContentTranslationInput[];
}
@InputType('UpdateCourseInput')
export class UpdateCourseInput extends UpsertCourseInput {
  @Field(() => ID) courseId!: string;
}
@InputType('SetPublicCourseStatusInput')
export class SetPublicCourseStatusInput {
  @Field(() => ID) courseId!: string;
  @Field(() => PublicContentStatus) status!: PublicContentStatus;
  @Field(() => String, { nullable: true }) reason?: string;
}

@InputType('RegisterForCourseInput')
export class RegisterForCourseInput {
  @Field(() => String) courseSlug!: string;
  @Field(() => String) name!: string;
  @Field(() => String, { nullable: true }) email?: string;
  @Field(() => String) phone!: string;
  @Field(() => String, { nullable: true }) currentLevel?: string;
  @Field(() => String, { nullable: true }) message?: string;
  @Field(() => Language) locale!: Language;
  @Field(() => Boolean) consent!: boolean;
}

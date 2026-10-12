import { Language, PublicContentStatus } from '@best/database';
import { Field, ID, InputType, Int, GraphQLISODateTime } from '@nestjs/graphql';
@InputType('AdminExamTranslationInput')
export class AdminExamTranslationInput {
  @Field(() => Language) language!: Language;
  @Field() title!: string;
  @Field() description!: string;
  @Field() formatLabel!: string;
  @Field() duration!: string;
  @Field() level!: string;
  @Field(() => [String]) highlights!: string[];
}
@InputType('AdminSaveExamInput')
export class AdminSaveExamInput {
  @Field(() => ID, { nullable: true }) id?: string;
  @Field(() => String, { nullable: true }) revision?: string;
  @Field() key!: string;
  @Field(() => Int) position!: number;
  @Field(() => PublicContentStatus) status!: PublicContentStatus;
  @Field(() => [AdminExamTranslationInput])
  translations!: AdminExamTranslationInput[];
}
@InputType('AdminSaveExamSessionInput')
export class AdminSaveExamSessionInput {
  @Field(() => ID, { nullable: true }) id?: string;
  @Field(() => String, { nullable: true }) revision?: string;
  @Field(() => ID) offeringId!: string;
  @Field(() => GraphQLISODateTime) startsAt!: Date;
  @Field(() => Int, { nullable: true }) capacity?: number;
  @Field() active!: boolean;
}

@InputType('AdminRemoveExamInput')
export class AdminRemoveExamInput {
  @Field(() => ID) offeringId!: string;
  @Field() revision!: string;
}

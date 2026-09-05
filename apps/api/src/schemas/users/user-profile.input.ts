import { Language } from '@best/database';
import { Field, ID, InputType } from '@nestjs/graphql';

@InputType('UpdateMyProfileInput')
export class UpdateMyProfileInput {
  @Field()
  displayName!: string;

  @Field(() => Language)
  preferredLanguage!: Language;

  @Field(() => String, { nullable: true })
  phone?: string | null;

  @Field(() => String, { nullable: true })
  teacherSubject?: string | null;

  @Field(() => String, { nullable: true })
  branchName?: string | null;

  @Field(() => ID, { nullable: true })
  avatarMediaObjectId?: string | null;
}

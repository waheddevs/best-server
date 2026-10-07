import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('ProfileAvatarDownloadIntent')
export class ProfileAvatarDownloadIntentObject {
  @Field(() => ID)
  userId!: string;

  @Field(() => String)
  url!: string;
}

import { Field, GraphQLISODateTime, ObjectType } from '@nestjs/graphql';

@ObjectType('MediaDownloadIntent')
export class MediaDownloadIntentObject {
  @Field(() => String)
  url!: string;

  @Field(() => GraphQLISODateTime)
  expiresAt!: Date;
}

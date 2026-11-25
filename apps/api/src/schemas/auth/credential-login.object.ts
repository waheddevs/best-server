import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';

import { ViewerObject } from '../users/viewer.object';

@ObjectType('CredentialLoginSuccessPayload')
export class CredentialLoginSuccessPayloadObject {
  @Field()
  accessToken!: string;

  @Field(() => Int)
  expiresInSeconds!: number;

  @Field()
  refreshToken!: string;

  @Field(() => GraphQLISODateTime)
  refreshExpiresAt!: Date;

  @Field(() => ViewerObject)
  user!: ViewerObject;
}

@ObjectType('CredentialLoginPayload')
export class CredentialLoginPayloadObject {
  @Field(() => CredentialLoginSuccessPayloadObject)
  session!: CredentialLoginSuccessPayloadObject;
}

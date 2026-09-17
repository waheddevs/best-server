import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';

import { ViewerObject } from '../users/viewer.object';

@ObjectType('CredentialLoginChallengePayload')
export class CredentialLoginChallengePayloadObject {
  @Field(() => ID)
  challengeId!: string;

  @Field()
  maskedEmail!: string;

  @Field(() => GraphQLISODateTime)
  expiresAt!: Date;

  @Field(() => GraphQLISODateTime)
  resendAvailableAt!: Date;
}

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

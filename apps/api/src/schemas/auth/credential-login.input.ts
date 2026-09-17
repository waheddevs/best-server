import { UserRole } from '@best/database';
import { Field, ID, InputType } from '@nestjs/graphql';

@InputType('BeginCredentialLoginInput')
export class BeginCredentialLoginInput {
  @Field()
  name!: string;

  @Field({ nullable: true })
  firstName?: string;

  @Field({ nullable: true })
  lastName?: string;

  @Field()
  email!: string;

  @Field()
  password!: string;

  @Field(() => UserRole)
  expectedRole!: UserRole;
}

@InputType('VerifyCredentialLoginInput')
export class VerifyCredentialLoginInput {
  @Field(() => ID)
  challengeId!: string;

  @Field()
  code!: string;
}

@InputType('ResendCredentialLoginCodeInput')
export class ResendCredentialLoginCodeInput {
  @Field(() => ID)
  challengeId!: string;
}

@InputType('RefreshCredentialSessionInput')
export class RefreshCredentialSessionInput {
  @Field()
  refreshToken!: string;
}

@InputType('RevokeCredentialSessionInput')
export class RevokeCredentialSessionInput {
  @Field()
  refreshToken!: string;
}

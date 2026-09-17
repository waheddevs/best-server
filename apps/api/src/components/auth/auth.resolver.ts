import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';

import type { ApiGraphqlContext } from '../../libs/types/authenticated-request.type';
import {
  BeginCredentialLoginInput,
  RefreshCredentialSessionInput,
  ResendCredentialLoginCodeInput,
  RevokeCredentialSessionInput,
  VerifyCredentialLoginInput,
} from '../../schemas/auth/credential-login.input';
import {
  CredentialLoginChallengePayloadObject,
  CredentialLoginSuccessPayloadObject,
} from '../../schemas/auth/credential-login.object';
import { CredentialAuthService } from './credential-auth.service';

@Resolver()
export class AuthResolver {
  constructor(private readonly credentialAuthService: CredentialAuthService) {}

  @Mutation(() => CredentialLoginChallengePayloadObject, {
    name: 'beginCredentialLogin',
  })
  beginCredentialLogin(
    @Args('input') input: BeginCredentialLoginInput,
  ): Promise<CredentialLoginChallengePayloadObject> {
    return this.credentialAuthService.beginLogin(input);
  }

  @Mutation(() => CredentialLoginChallengePayloadObject, {
    name: 'resendCredentialLoginCode',
  })
  resendCredentialLoginCode(
    @Args('input') input: ResendCredentialLoginCodeInput,
  ): Promise<CredentialLoginChallengePayloadObject> {
    return this.credentialAuthService.resendCode(input);
  }

  @Mutation(() => CredentialLoginSuccessPayloadObject, {
    name: 'verifyCredentialLogin',
  })
  verifyCredentialLogin(
    @Args('input') input: VerifyCredentialLoginInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<CredentialLoginSuccessPayloadObject> {
    return this.credentialAuthService.verifyLogin(input, context.req.requestId);
  }

  @Mutation(() => CredentialLoginSuccessPayloadObject, {
    name: 'refreshCredentialSession',
  })
  refreshCredentialSession(
    @Args('input') input: RefreshCredentialSessionInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<CredentialLoginSuccessPayloadObject> {
    return this.credentialAuthService.refreshSession(
      input,
      context.req.requestId,
    );
  }

  @Mutation(() => Boolean, { name: 'revokeCredentialSession' })
  revokeCredentialSession(
    @Args('input') input: RevokeCredentialSessionInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<boolean> {
    return this.credentialAuthService.revokeSession(
      input,
      context.req.requestId,
    );
  }
}

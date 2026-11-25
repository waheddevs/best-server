import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';

import type { ApiGraphqlContext } from '../../libs/types/authenticated-request.type';
import {
  BeginCredentialLoginInput,
  RefreshCredentialSessionInput,
  RevokeCredentialSessionInput,
} from '../../schemas/auth/credential-login.input';
import {
  CredentialLoginPayloadObject,
  CredentialLoginSuccessPayloadObject,
} from '../../schemas/auth/credential-login.object';
import { CredentialLoginService } from './credentials/credential-login.service';
import { CredentialSessionService } from './credentials/credential-session.service';

@Resolver()
export class AuthResolver {
  constructor(
    private readonly credentialLoginService: CredentialLoginService,
    private readonly sessions: CredentialSessionService,
  ) {}

  @Mutation(() => CredentialLoginPayloadObject, { name: 'credentialLogin' })
  credentialLogin(
    @Args('input') input: BeginCredentialLoginInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<CredentialLoginPayloadObject> {
    return this.credentialLoginService.login(input, context.req.requestId);
  }

  @Mutation(() => CredentialLoginSuccessPayloadObject, {
    name: 'refreshCredentialSession',
  })
  refreshCredentialSession(
    @Args('input') input: RefreshCredentialSessionInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<CredentialLoginSuccessPayloadObject> {
    return this.sessions.refreshSession(input, context.req.requestId);
  }

  @Mutation(() => Boolean, { name: 'revokeCredentialSession' })
  revokeCredentialSession(
    @Args('input') input: RevokeCredentialSessionInput,
    @Context() context: ApiGraphqlContext,
  ): Promise<boolean> {
    return this.sessions.revokeSession(input, context.req.requestId);
  }
}

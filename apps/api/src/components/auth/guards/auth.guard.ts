import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import type { AccessTokenVerifier } from '../../../libs/types/access-token-verifier.type';
import { ACCESS_TOKEN_VERIFIER } from '../auth.constants';
import { getAuthenticatedRequest } from '../auth-context';
import { extractBearerToken } from '../bearer-token';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(ACCESS_TOKEN_VERIFIER)
    private readonly tokenVerifier: AccessTokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = getAuthenticatedRequest(context);
    const token = extractBearerToken(request);

    if (token === undefined) {
      throw new UnauthorizedException('Authentication is required');
    }

    request.authMember = await this.tokenVerifier.verifyAccessToken(token);

    return true;
  }
}

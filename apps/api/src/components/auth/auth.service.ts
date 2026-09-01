import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import type { AccessTokenVerifier } from '../../libs/types/access-token-verifier.type';
import type { AuthIdentityReader } from '../../libs/types/auth-identity-reader.type';
import type { AuthenticatedMember } from '../../libs/types/authenticated-member.type';
import { AUTH_IDENTITY_READER } from './auth.constants';

const ACCESS_TOKEN_TYPE = 'access';

@Injectable()
export class AuthService implements AccessTokenVerifier {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(AUTH_IDENTITY_READER)
    private readonly identityReader: AuthIdentityReader,
  ) {}

  async issueAccessToken(member: AuthenticatedMember): Promise<string> {
    return this.jwtService.signAsync({
      sub: member.id,
      tokenType: ACCESS_TOKEN_TYPE,
    });
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedMember> {
    let payload: Record<string, unknown>;

    try {
      payload =
        await this.jwtService.verifyAsync<Record<string, unknown>>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    if (
      typeof payload.sub !== 'string' ||
      payload.sub.length === 0 ||
      payload.tokenType !== ACCESS_TOKEN_TYPE
    ) {
      throw new UnauthorizedException('Invalid access token payload');
    }

    const member = await this.identityReader.findActiveMember(payload.sub);

    if (member === undefined) {
      throw new UnauthorizedException('Authenticated user is unavailable');
    }

    return member;
  }
}

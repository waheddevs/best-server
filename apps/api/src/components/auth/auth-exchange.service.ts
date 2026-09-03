import type { AuthEnvironment } from '@best/config';
import { AuthProvider } from '@best/database';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { AUTH_ENVIRONMENT, AUTH_IDENTITY_PROVISIONER } from './auth.constants';
import type {
  AuthExchangeResult,
  AuthIdentityProvisioner,
  SocialIdentity,
} from './auth-identity.type';
import { AuthService } from './auth.service';

const IDENTITY_EXCHANGE_TOKEN_TYPE = 'identity_exchange';
const MAXIMUM_ASSERTION_TTL_SECONDS = 60;
const MAXIMUM_CLOCK_SKEW_SECONDS = 5;
const MAXIMUM_ASSERTION_ID_LENGTH = 120;
const MAXIMUM_DISPLAY_NAME_LENGTH = 160;
const MAXIMUM_EMAIL_LENGTH = 320;
const MAXIMUM_PROVIDER_ACCOUNT_ID_LENGTH = 255;

@Injectable()
export class AuthExchangeService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    @Inject(AUTH_IDENTITY_PROVISIONER)
    private readonly identityProvisioner: AuthIdentityProvisioner,
    @Inject(AUTH_ENVIRONMENT)
    private readonly environment: AuthEnvironment,
  ) {}

  async exchangeIdentityAssertion(
    assertion: string,
  ): Promise<AuthExchangeResult> {
    const identity = await this.verifyIdentityAssertion(assertion);
    const member =
      await this.identityProvisioner.resolveOrProvisionSocialIdentity(identity);

    return {
      accessToken: await this.authService.issueAccessToken(member),
      expiresInSeconds: this.environment.accessTokenTtlSeconds,
    };
  }

  private async verifyIdentityAssertion(
    assertion: string,
  ): Promise<SocialIdentity> {
    let payload: Record<string, unknown>;

    try {
      payload = await this.jwtService.verifyAsync<Record<string, unknown>>(
        assertion,
        {
          algorithms: ['HS256'],
          audience: this.environment.identityExchangeAudience,
          issuer: this.environment.identityExchangeIssuer,
          secret: this.environment.identityExchangeSecret,
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid identity assertion');
    }

    return parseSocialIdentity(payload);
  }
}

function parseSocialIdentity(payload: Record<string, unknown>): SocialIdentity {
  const issuedAt = parseIntegerClaim(payload.iat);
  const expiresAt = parseIntegerClaim(payload.exp);
  const currentTime = Math.floor(Date.now() / 1000);

  if (
    payload.tokenType !== IDENTITY_EXCHANGE_TOKEN_TYPE ||
    issuedAt === undefined ||
    expiresAt === undefined ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > MAXIMUM_ASSERTION_TTL_SECONDS ||
    issuedAt > currentTime + MAXIMUM_CLOCK_SKEW_SECONDS
  ) {
    throw new UnauthorizedException('Invalid identity assertion');
  }

  const assertionId = parseRequiredTrimmedString(
    payload.jti,
    MAXIMUM_ASSERTION_ID_LENGTH,
  );
  const displayName = parseRequiredTrimmedString(
    payload.name,
    MAXIMUM_DISPLAY_NAME_LENGTH,
  );
  const providerAccountId = parseRequiredTrimmedString(
    payload.sub,
    MAXIMUM_PROVIDER_ACCOUNT_ID_LENGTH,
  );
  const provider = parseProvider(payload.provider);
  const email = parseOptionalEmail(payload.email);
  const emailClaimWasProvided =
    payload.email !== undefined && payload.email !== null;

  if (
    assertionId === undefined ||
    displayName === undefined ||
    providerAccountId === undefined ||
    provider === undefined ||
    (emailClaimWasProvided && email === undefined) ||
    typeof payload.emailVerified !== 'boolean' ||
    (payload.emailVerified && email === undefined)
  ) {
    throw new UnauthorizedException('Invalid identity assertion');
  }

  return {
    assertionId,
    displayName,
    ...(email === undefined ? {} : { email }),
    emailVerified: payload.emailVerified,
    provider,
    providerAccountId,
  };
}

function parseProvider(value: unknown): AuthProvider | undefined {
  switch (value) {
    case 'google':
      return AuthProvider.GOOGLE;
    case 'facebook':
      return AuthProvider.FACEBOOK;
    case 'apple':
      return AuthProvider.APPLE;
    default:
      return undefined;
  }
}

function parseIntegerClaim(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value)
    ? value
    : undefined;
}

function parseRequiredTrimmedString(
  value: unknown,
  maximumLength: number,
): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();

  return normalized.length > 0 && normalized.length <= maximumLength
    ? normalized
    : undefined;
}

function parseOptionalEmail(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = parseRequiredTrimmedString(value, MAXIMUM_EMAIL_LENGTH);

  if (normalized === undefined || !/^[^\s@]+@[^\s@]+$/.test(normalized)) {
    return undefined;
  }

  return normalized.toLowerCase();
}

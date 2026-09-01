import { UnauthorizedException } from '@nestjs/common';

import type { AuthenticatedRequest } from '../../libs/types/authenticated-request.type';

export function extractBearerToken(
  request: AuthenticatedRequest,
): string | undefined {
  const authorization = request.headers?.authorization;

  if (authorization === undefined) {
    return undefined;
  }

  if (Array.isArray(authorization)) {
    throw new UnauthorizedException('A single bearer token is required');
  }

  const [scheme, token, extraPart] = authorization.trim().split(/\s+/);

  if (
    scheme?.toLowerCase() !== 'bearer' ||
    token === undefined ||
    token.length === 0 ||
    extraPart !== undefined
  ) {
    throw new UnauthorizedException('A valid bearer token is required');
  }

  return token;
}

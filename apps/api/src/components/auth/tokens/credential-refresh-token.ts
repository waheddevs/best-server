import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
const REFRESH_SECRET_BYTES = 32;

interface RefreshTokenMaterial {
  readonly hash: string;
  readonly id: string;
  readonly token: string;
}

export function createRefreshTokenMaterial(): RefreshTokenMaterial {
  const id = randomUUID();
  const secret = randomBytes(REFRESH_SECRET_BYTES).toString('base64url');
  return {
    hash: hashRefreshSecret(secret),
    id,
    token: `${id}.${secret}`,
  };
}

export function parseRefreshToken(
  value: string,
): { readonly hash: string; readonly id: string } | undefined {
  const token = value.trim();
  const separator = token.indexOf('.');
  if (separator <= 0 || separator !== token.lastIndexOf('.')) return undefined;

  const id = token.slice(0, separator).toLowerCase();
  const secret = token.slice(separator + 1);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      id,
    ) ||
    !/^[A-Za-z0-9_-]{43}$/.test(secret)
  ) {
    return undefined;
  }

  return { hash: hashRefreshSecret(secret), id };
}

function hashRefreshSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function hashesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

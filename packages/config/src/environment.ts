import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

export type NodeEnvironment = 'development' | 'production' | 'test';

export interface ApiEnvironment {
  apiPort: number;
  nodeEnvironment: NodeEnvironment;
}

export interface AuthEnvironment {
  accessTokenAudience: string;
  accessTokenIssuer: string;
  accessTokenSecret: string;
  accessTokenTtlSeconds: number;
}

export interface WorkerEnvironment {
  nodeEnvironment: NodeEnvironment;
}

export interface InfrastructureEnvironment {
  postgres: {
    database: string;
    host: string;
    password: string;
    port: number;
    url: string;
    user: string;
  };
  redis: {
    host: string;
    port: number;
  };
}

type EnvironmentSource = Readonly<Record<string, string | undefined>>;
type PostgresConnectionParts = Omit<
  InfrastructureEnvironment['postgres'],
  'url'
>;

const DEFAULT_API_PORT = 4000;
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 900;
const DEFAULT_NODE_ENVIRONMENT: NodeEnvironment = 'development';
const MINIMUM_ACCESS_TOKEN_SECRET_LENGTH = 32;
const ROOT_ENVIRONMENT_FILE_PATH = resolve(__dirname, '..', '..', '..', '.env');

export class EnvironmentValidationError extends Error {
  constructor(variableName: string, expectation: string) {
    super(`Invalid environment variable ${variableName}: ${expectation}`);
    this.name = EnvironmentValidationError.name;
  }
}

export function parseApiEnvironment(source: EnvironmentSource): ApiEnvironment {
  return {
    apiPort: parsePort(source.API_PORT, 'API_PORT', DEFAULT_API_PORT),
    nodeEnvironment: parseNodeEnvironment(source.NODE_ENV),
  };
}

export function parseAuthEnvironment(
  source: EnvironmentSource,
): AuthEnvironment {
  const accessTokenSecret = parseRequiredString(
    source.JWT_ACCESS_SECRET,
    'JWT_ACCESS_SECRET',
  );

  if (accessTokenSecret.length < MINIMUM_ACCESS_TOKEN_SECRET_LENGTH) {
    throw new EnvironmentValidationError(
      'JWT_ACCESS_SECRET',
      `expected at least ${String(MINIMUM_ACCESS_TOKEN_SECRET_LENGTH)} characters`,
    );
  }

  return {
    accessTokenAudience: parseRequiredString(
      source.JWT_ACCESS_AUDIENCE,
      'JWT_ACCESS_AUDIENCE',
    ),
    accessTokenIssuer: parseRequiredString(
      source.JWT_ACCESS_ISSUER,
      'JWT_ACCESS_ISSUER',
    ),
    accessTokenSecret,
    accessTokenTtlSeconds: parseIntegerInRange(
      source.JWT_ACCESS_TTL_SECONDS,
      'JWT_ACCESS_TTL_SECONDS',
      60,
      3_600,
      DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
    ),
  };
}

export function parseWorkerEnvironment(
  source: EnvironmentSource,
): WorkerEnvironment {
  return {
    nodeEnvironment: parseNodeEnvironment(source.NODE_ENV),
  };
}

export function parseInfrastructureEnvironment(
  source: EnvironmentSource,
): InfrastructureEnvironment {
  const database = parseRequiredString(source.POSTGRES_DB, 'POSTGRES_DB');
  const host = parseRequiredString(source.POSTGRES_HOST, 'POSTGRES_HOST');
  const password = parseRequiredString(
    source.POSTGRES_PASSWORD,
    'POSTGRES_PASSWORD',
  );
  const port = parsePort(source.POSTGRES_PORT, 'POSTGRES_PORT');
  const user = parseRequiredString(source.POSTGRES_USER, 'POSTGRES_USER');

  return {
    postgres: {
      database,
      host,
      password,
      port,
      url:
        parseOptionalString(source.DATABASE_URL) ??
        buildPostgresUrl({ database, host, password, port, user }),
      user,
    },
    redis: {
      host: parseRequiredString(source.REDIS_HOST, 'REDIS_HOST'),
      port: parsePort(source.REDIS_PORT, 'REDIS_PORT'),
    },
  };
}

function buildPostgresUrl({
  database,
  host,
  password,
  port,
  user,
}: PostgresConnectionParts): string {
  const url = new URL('postgresql://localhost');
  url.hostname = host;
  url.password = password;
  url.port = String(port);
  url.username = user;
  url.pathname = database;
  url.searchParams.set('schema', 'public');

  return url.toString();
}

export function loadApiEnvironment(): ApiEnvironment {
  loadLocalEnvironmentFile();
  return parseApiEnvironment(process.env);
}

export function loadAuthEnvironment(): AuthEnvironment {
  loadLocalEnvironmentFile();
  return parseAuthEnvironment(process.env);
}

export function loadWorkerEnvironment(): WorkerEnvironment {
  loadLocalEnvironmentFile();
  return parseWorkerEnvironment(process.env);
}

export function loadInfrastructureEnvironment(): InfrastructureEnvironment {
  loadLocalEnvironmentFile();
  return parseInfrastructureEnvironment(process.env);
}

function loadLocalEnvironmentFile(): void {
  try {
    loadEnvFile(ROOT_ENVIRONMENT_FILE_PATH);
  } catch (error: unknown) {
    if (error instanceof Error && Reflect.get(error, 'code') === 'ENOENT') {
      return;
    }

    throw error;
  }
}

function parseNodeEnvironment(value: string | undefined): NodeEnvironment {
  const normalizedValue = value?.trim() ?? DEFAULT_NODE_ENVIRONMENT;

  switch (normalizedValue) {
    case 'development':
    case 'production':
    case 'test':
      return normalizedValue;
    default:
      throw new EnvironmentValidationError(
        'NODE_ENV',
        'expected development, production, or test',
      );
  }
}

function parsePort(
  value: string | undefined,
  variableName: string,
  defaultValue?: number,
): number {
  const normalizedValue = value?.trim();

  if (normalizedValue === undefined || normalizedValue.length === 0) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }

    throw new EnvironmentValidationError(
      variableName,
      'expected a TCP port between 1 and 65535',
    );
  }

  if (!/^\d+$/.test(normalizedValue)) {
    throw new EnvironmentValidationError(
      variableName,
      'expected a TCP port between 1 and 65535',
    );
  }

  const port = Number(normalizedValue);

  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new EnvironmentValidationError(
      variableName,
      'expected a TCP port between 1 and 65535',
    );
  }

  return port;
}

function parseIntegerInRange(
  value: string | undefined,
  variableName: string,
  minimum: number,
  maximum: number,
  defaultValue: number,
): number {
  const normalizedValue = value?.trim();
  const expectation = `expected an integer between ${String(minimum)} and ${String(maximum)}`;

  if (normalizedValue === undefined || normalizedValue.length === 0) {
    return defaultValue;
  }

  if (!/^\d+$/.test(normalizedValue)) {
    throw new EnvironmentValidationError(variableName, expectation);
  }

  const parsedValue = Number(normalizedValue);

  if (
    !Number.isSafeInteger(parsedValue) ||
    parsedValue < minimum ||
    parsedValue > maximum
  ) {
    throw new EnvironmentValidationError(variableName, expectation);
  }

  return parsedValue;
}

function parseRequiredString(
  value: string | undefined,
  variableName: string,
): string {
  const normalizedValue = value?.trim();

  if (normalizedValue === undefined || normalizedValue.length === 0) {
    throw new EnvironmentValidationError(
      variableName,
      'expected a non-empty value',
    );
  }

  return normalizedValue;
}

function parseOptionalString(value: string | undefined): string | undefined {
  const normalizedValue = value?.trim();
  return normalizedValue === undefined || normalizedValue.length === 0
    ? undefined
    : normalizedValue;
}

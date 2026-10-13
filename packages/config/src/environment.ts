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
  credentialEmail: CredentialEmailEnvironment | undefined;
  requireEmailVerification: boolean;
  allowReservedLoginEmails: boolean;
  otpHashSecret: string;
}

export interface CredentialEmailEnvironment {
  from: string;
  host: string;
  password: string | undefined;
  port: number;
  secure: boolean;
  user: string | undefined;
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

export interface ObjectStorageEnvironment {
  accessKeyId: string;
  bucket: string;
  downloadUrlTtlSeconds: number;
  endpoint: string;
  publicEndpoint?: string;
  forcePathStyle: boolean;
  maxUploadBytes: number;
  region: string;
  secretAccessKey: string;
  uploadUrlTtlSeconds: number;
}

export interface MalwareScannerEnvironment {
  connectTimeoutMilliseconds: number;
  host: string;
  port: number;
  scanTimeoutMilliseconds: number;
}

export interface TextToSpeechEnvironment {
  defaultVoice: string;
  maxTranscriptCharacters: number;
  modelDtype: 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16';
  modelId: string;
}

type EnvironmentSource = Readonly<Record<string, string | undefined>>;
type PostgresConnectionParts = Omit<
  InfrastructureEnvironment['postgres'],
  'url'
>;

const DEFAULT_API_PORT = 4000;
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 3600;
const DEFAULT_DOWNLOAD_URL_TTL_SECONDS = 300;
const DEFAULT_MAX_UPLOAD_BYTES = 52_428_800;
const DEFAULT_MALWARE_SCANNER_CONNECT_TIMEOUT_MILLISECONDS = 5_000;
const DEFAULT_MALWARE_SCANNER_SCAN_TIMEOUT_MILLISECONDS = 60_000;
const DEFAULT_NODE_ENVIRONMENT: NodeEnvironment = 'development';
const DEFAULT_TTS_MAX_TRANSCRIPT_CHARACTERS = 8_000;
const DEFAULT_TTS_MODEL_DTYPE: TextToSpeechEnvironment['modelDtype'] = 'q8';
const DEFAULT_TTS_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const DEFAULT_UPLOAD_URL_TTL_SECONDS = 300;
const MINIMUM_ACCESS_TOKEN_SECRET_LENGTH = 32;
const MINIMUM_STORAGE_SECRET_LENGTH = 16;
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
  const nodeEnvironment = parseNodeEnvironment(source.NODE_ENV);
  const requireEmailVerification = parseBoolean(
    source.AUTH_REQUIRE_EMAIL_VERIFICATION,
    'AUTH_REQUIRE_EMAIL_VERIFICATION',
    false,
  );
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

  const otpHashSecret = parseRequiredString(
    source.AUTH_OTP_HASH_SECRET,
    'AUTH_OTP_HASH_SECRET',
  );

  if (otpHashSecret.length < MINIMUM_ACCESS_TOKEN_SECRET_LENGTH) {
    throw new EnvironmentValidationError(
      'AUTH_OTP_HASH_SECRET',
      `expected at least ${String(MINIMUM_ACCESS_TOKEN_SECRET_LENGTH)} characters`,
    );
  }

  if (otpHashSecret === accessTokenSecret) {
    throw new EnvironmentValidationError(
      'AUTH_OTP_HASH_SECRET',
      'expected a value different from JWT_ACCESS_SECRET',
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
    credentialEmail: parseCredentialEmailEnvironment(
      source,
      requireEmailVerification,
    ),
    requireEmailVerification,
    allowReservedLoginEmails: nodeEnvironment !== 'production',
    otpHashSecret,
  };
}

function parseCredentialEmailEnvironment(
  source: EnvironmentSource,
  required: boolean,
): CredentialEmailEnvironment | undefined {
  const mode = parseOptionalString(
    source.AUTH_EMAIL_DELIVERY_MODE,
  )?.toLowerCase();
  const normalizedMode = mode ?? (required ? 'smtp' : 'disabled');

  if (normalizedMode === 'disabled') {
    if (required) {
      throw new EnvironmentValidationError(
        'AUTH_EMAIL_DELIVERY_MODE',
        'SMTP delivery is required when email verification is enabled',
      );
    }

    return undefined;
  }

  if (normalizedMode !== 'smtp') {
    throw new EnvironmentValidationError(
      'AUTH_EMAIL_DELIVERY_MODE',
      'expected smtp or disabled',
    );
  }

  const user = parseOptionalString(source.AUTH_SMTP_USER);
  const password = parseOptionalString(source.AUTH_SMTP_PASSWORD);

  if ((user === undefined) !== (password === undefined)) {
    throw new EnvironmentValidationError(
      user === undefined ? 'AUTH_SMTP_USER' : 'AUTH_SMTP_PASSWORD',
      'SMTP username and password must be configured together',
    );
  }

  return {
    from: parseRequiredString(source.AUTH_EMAIL_FROM, 'AUTH_EMAIL_FROM'),
    host: parseNetworkHost(source.AUTH_SMTP_HOST, 'AUTH_SMTP_HOST'),
    password,
    port: parsePort(source.AUTH_SMTP_PORT, 'AUTH_SMTP_PORT'),
    secure: parseBoolean(source.AUTH_SMTP_SECURE, 'AUTH_SMTP_SECURE', false),
    user,
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

export function parseObjectStorageEnvironment(
  source: EnvironmentSource,
): ObjectStorageEnvironment {
  const secretAccessKey = parseRequiredString(
    source.S3_SECRET_ACCESS_KEY,
    'S3_SECRET_ACCESS_KEY',
  );

  if (secretAccessKey.length < MINIMUM_STORAGE_SECRET_LENGTH) {
    throw new EnvironmentValidationError(
      'S3_SECRET_ACCESS_KEY',
      `expected at least ${String(MINIMUM_STORAGE_SECRET_LENGTH)} characters`,
    );
  }

  return {
    accessKeyId: parseRequiredString(
      source.S3_ACCESS_KEY_ID,
      'S3_ACCESS_KEY_ID',
    ),
    bucket: parseBucketName(source.S3_BUCKET),
    downloadUrlTtlSeconds: parseIntegerInRange(
      source.S3_DOWNLOAD_URL_TTL_SECONDS,
      'S3_DOWNLOAD_URL_TTL_SECONDS',
      60,
      3_600,
      DEFAULT_DOWNLOAD_URL_TTL_SECONDS,
    ),
    endpoint: parseHttpEndpoint(source.S3_ENDPOINT, 'S3_ENDPOINT'),
    ...(source.S3_PUBLIC_ENDPOINT?.trim()
      ? {
          publicEndpoint: parseHttpEndpoint(
            source.S3_PUBLIC_ENDPOINT,
            'S3_PUBLIC_ENDPOINT',
          ),
        }
      : {}),
    forcePathStyle: parseBoolean(
      source.S3_FORCE_PATH_STYLE,
      'S3_FORCE_PATH_STYLE',
      false,
    ),
    maxUploadBytes: parseIntegerInRange(
      source.S3_MAX_UPLOAD_BYTES,
      'S3_MAX_UPLOAD_BYTES',
      1,
      5_368_709_120,
      DEFAULT_MAX_UPLOAD_BYTES,
    ),
    region: parseRequiredString(source.S3_REGION, 'S3_REGION'),
    secretAccessKey,
    uploadUrlTtlSeconds: parseIntegerInRange(
      source.S3_UPLOAD_URL_TTL_SECONDS,
      'S3_UPLOAD_URL_TTL_SECONDS',
      60,
      900,
      DEFAULT_UPLOAD_URL_TTL_SECONDS,
    ),
  };
}

export function parseMalwareScannerEnvironment(
  source: EnvironmentSource,
): MalwareScannerEnvironment {
  return {
    connectTimeoutMilliseconds: parseIntegerInRange(
      source.CLAMAV_CONNECT_TIMEOUT_MS,
      'CLAMAV_CONNECT_TIMEOUT_MS',
      100,
      30_000,
      DEFAULT_MALWARE_SCANNER_CONNECT_TIMEOUT_MILLISECONDS,
    ),
    host: parseNetworkHost(source.CLAMAV_HOST, 'CLAMAV_HOST'),
    port: parsePort(source.CLAMAV_PORT, 'CLAMAV_PORT'),
    scanTimeoutMilliseconds: parseIntegerInRange(
      source.CLAMAV_SCAN_TIMEOUT_MS,
      'CLAMAV_SCAN_TIMEOUT_MS',
      1_000,
      300_000,
      DEFAULT_MALWARE_SCANNER_SCAN_TIMEOUT_MILLISECONDS,
    ),
  };
}

export function parseTextToSpeechEnvironment(
  source: EnvironmentSource,
): TextToSpeechEnvironment {
  const voice = parseRequiredString(
    source.TTS_DEFAULT_VOICE ?? 'bf_emma',
    'TTS_DEFAULT_VOICE',
  );

  if (!/^[a-z][a-z0-9_-]{1,79}$/i.test(voice)) {
    throw new EnvironmentValidationError(
      'TTS_DEFAULT_VOICE',
      'expected a provider voice identifier between 2 and 80 characters',
    );
  }

  const modelId = parseRequiredString(
    source.TTS_MODEL_ID ?? DEFAULT_TTS_MODEL_ID,
    'TTS_MODEL_ID',
  );

  if (
    !/^[a-z0-9][a-z0-9._-]{0,79}\/[a-z0-9][a-z0-9._-]{0,119}$/i.test(modelId)
  ) {
    throw new EnvironmentValidationError(
      'TTS_MODEL_ID',
      'expected a Hugging Face organization/model identifier',
    );
  }

  const modelDtype = parseTextToSpeechDtype(source.TTS_MODEL_DTYPE);

  return {
    defaultVoice: voice,
    maxTranscriptCharacters: parseIntegerInRange(
      source.TTS_MAX_TRANSCRIPT_CHARACTERS,
      'TTS_MAX_TRANSCRIPT_CHARACTERS',
      1,
      100_000,
      DEFAULT_TTS_MAX_TRANSCRIPT_CHARACTERS,
    ),
    modelDtype,
    modelId,
  };
}

function parseTextToSpeechDtype(
  value: string | undefined,
): TextToSpeechEnvironment['modelDtype'] {
  const dtype = value?.trim().toLowerCase() ?? DEFAULT_TTS_MODEL_DTYPE;

  switch (dtype) {
    case 'fp32':
    case 'fp16':
    case 'q8':
    case 'q4':
    case 'q4f16':
      return dtype;
    default:
      throw new EnvironmentValidationError(
        'TTS_MODEL_DTYPE',
        'expected fp32, fp16, q8, q4, or q4f16',
      );
  }
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

export function loadObjectStorageEnvironment(): ObjectStorageEnvironment {
  loadLocalEnvironmentFile();
  return parseObjectStorageEnvironment(process.env);
}

export function loadMalwareScannerEnvironment(): MalwareScannerEnvironment {
  loadLocalEnvironmentFile();
  return parseMalwareScannerEnvironment(process.env);
}

export function loadTextToSpeechEnvironment(): TextToSpeechEnvironment {
  loadLocalEnvironmentFile();
  return parseTextToSpeechEnvironment(process.env);
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

function parseBoolean(
  value: string | undefined,
  variableName: string,
  defaultValue: boolean,
): boolean {
  const normalizedValue = value?.trim().toLowerCase();

  if (normalizedValue === undefined || normalizedValue.length === 0) {
    return defaultValue;
  }

  if (normalizedValue === 'true') {
    return true;
  }

  if (normalizedValue === 'false') {
    return false;
  }

  throw new EnvironmentValidationError(variableName, 'expected true or false');
}

function parseBucketName(value: string | undefined): string {
  const bucket = parseRequiredString(value, 'S3_BUCKET');

  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new EnvironmentValidationError(
      'S3_BUCKET',
      'expected a lowercase S3 bucket name between 3 and 63 characters',
    );
  }

  return bucket;
}

function parseHttpEndpoint(
  value: string | undefined,
  variableName: string,
): string {
  const endpoint = parseRequiredString(value, variableName);

  try {
    const url = new URL(endpoint);

    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.search.length > 0 ||
      url.hash.length > 0
    ) {
      throw new Error('Invalid endpoint');
    }

    return url.toString().replace(/\/$/, '');
  } catch {
    throw new EnvironmentValidationError(
      variableName,
      'expected an HTTP or HTTPS URL without credentials, query, or fragment',
    );
  }
}

function parseNetworkHost(
  value: string | undefined,
  variableName: string,
): string {
  const host = parseRequiredString(value, variableName);

  if (
    host.length > 253 ||
    !/^[a-zA-Z0-9.-]+$/.test(host) ||
    host.startsWith('.') ||
    host.endsWith('.') ||
    host.includes('..')
  ) {
    throw new EnvironmentValidationError(
      variableName,
      'expected a valid IPv4 address or DNS hostname',
    );
  }

  return host;
}

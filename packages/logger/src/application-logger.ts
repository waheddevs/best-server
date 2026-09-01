import { ConsoleLogger } from '@nestjs/common';
import pino, { type DestinationStream, type Logger as PinoLogger } from 'pino';

export type ApplicationLogFormat = 'json' | 'pretty';

export interface ApplicationLoggerOptions {
  readonly format?: ApplicationLogFormat;
  readonly service: string;
}

export interface ApplicationLogger {
  debug(message: unknown, ...optionalParams: unknown[]): void;
  error(message: unknown, ...optionalParams: unknown[]): void;
  fatal(message: unknown, ...optionalParams: unknown[]): void;
  log(message: unknown, ...optionalParams: unknown[]): void;
  verbose(message: unknown, ...optionalParams: unknown[]): void;
  warn(message: unknown, ...optionalParams: unknown[]): void;
}

type ApplicationLogLevel =
  'debug' | 'error' | 'fatal' | 'info' | 'trace' | 'warn';

type LoggerBackend =
  | { readonly format: 'json'; readonly logger: PinoLogger }
  | { readonly format: 'pretty'; readonly logger: PrettyLogger };

interface PrettyLogger {
  debug(message: unknown, ...optionalParams: unknown[]): void;
  error(message: unknown, ...optionalParams: unknown[]): void;
  fatal(message: unknown, ...optionalParams: unknown[]): void;
  log(message: unknown, ...optionalParams: unknown[]): void;
  verbose(message: unknown, ...optionalParams: unknown[]): void;
  warn(message: unknown, ...optionalParams: unknown[]): void;
}

interface NormalizedLogEntry {
  readonly bindings: Record<string, unknown>;
  readonly message?: string;
}

const REDACTION_CENSOR = '[REDACTED]';
const SENSITIVE_FIELD_NAMES = [
  'Authorization',
  'Cookie',
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'POSTGRES_PASSWORD',
  'accessToken',
  'accessTokenSecret',
  'apiKey',
  'authorization',
  'cookie',
  'databaseUrl',
  'password',
  'providerToken',
  'refreshToken',
  'secret',
  'token',
] as const;
const NORMALIZED_SENSITIVE_FIELD_NAMES = new Set(
  SENSITIVE_FIELD_NAMES.map(normalizeFieldName),
);
const REDACTED_PATHS = SENSITIVE_FIELD_NAMES.flatMap((fieldName) => [
  fieldName,
  `*.${fieldName}`,
  `*.*.${fieldName}`,
  `*.*.*.${fieldName}`,
]);
REDACTED_PATHS.push('postgres.url', '*.postgres.url', '*.*.postgres.url');

class DefaultApplicationLogger implements ApplicationLogger {
  constructor(private readonly backend: LoggerBackend) {}

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('trace', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('fatal', message, optionalParams);
  }

  private write(
    level: ApplicationLogLevel,
    message: unknown,
    optionalParams: readonly unknown[],
  ): void {
    if (this.backend.format === 'pretty') {
      writePrettyLog(this.backend.logger, level, message, optionalParams);
      return;
    }

    const entry = normalizeLogEntry(message, optionalParams);
    this.backend.logger[level](entry.bindings, entry.message);
  }
}

export function createApplicationLogger(
  options: ApplicationLoggerOptions,
): ApplicationLogger {
  return options.format === 'pretty'
    ? new DefaultApplicationLogger({
        format: 'pretty',
        logger: new ConsoleLogger({
          colors: true,
          prefix: 'Nest',
          timestamp: true,
        }),
      })
    : new DefaultApplicationLogger({
        format: 'json',
        logger: createPinoLogger(options),
      });
}

export function createApplicationLoggerForDestination(
  options: ApplicationLoggerOptions,
  destination: DestinationStream,
): ApplicationLogger {
  return new DefaultApplicationLogger({
    format: 'json',
    logger: createPinoLogger(options, destination),
  });
}

export function createApplicationLoggerForPrettyBackend(
  logger: PrettyLogger,
): ApplicationLogger {
  return new DefaultApplicationLogger({ format: 'pretty', logger });
}

function createPinoLogger(
  options: ApplicationLoggerOptions,
  destination?: DestinationStream,
): PinoLogger {
  const loggerOptions: pino.LoggerOptions = {
    base: { service: options.service },
    formatters: {
      level: (label) => ({ level: label }),
    },
    redact: {
      censor: REDACTION_CENSOR,
      paths: REDACTED_PATHS,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  return destination === undefined
    ? pino(loggerOptions)
    : pino(loggerOptions, destination);
}

function writePrettyLog(
  logger: PrettyLogger,
  level: ApplicationLogLevel,
  message: unknown,
  optionalParams: readonly unknown[],
): void {
  const sanitizedMessage = sanitizeLogValue(message);
  const sanitizedOptionalParams = optionalParams.map((parameter) =>
    sanitizeLogValue(parameter),
  );

  switch (level) {
    case 'debug':
      logger.debug(sanitizedMessage, ...sanitizedOptionalParams);
      return;
    case 'error':
      logger.error(sanitizedMessage, ...sanitizedOptionalParams);
      return;
    case 'fatal':
      logger.fatal(sanitizedMessage, ...sanitizedOptionalParams);
      return;
    case 'info':
      logger.log(sanitizedMessage, ...sanitizedOptionalParams);
      return;
    case 'trace':
      logger.verbose(sanitizedMessage, ...sanitizedOptionalParams);
      return;
    case 'warn':
      logger.warn(sanitizedMessage, ...sanitizedOptionalParams);
  }
}

function normalizeLogEntry(
  message: unknown,
  optionalParams: readonly unknown[],
): NormalizedLogEntry {
  const context = getNestContext(optionalParams);
  const contextBinding = context === undefined ? {} : { context };

  if (typeof message === 'string') {
    return { bindings: contextBinding, message };
  }

  if (message instanceof Error) {
    return {
      bindings: {
        ...contextBinding,
        errorName: message.name,
      },
      message: message.message,
    };
  }

  const sanitizedMessage = sanitizeLogValue(message);

  if (isRecord(sanitizedMessage)) {
    return {
      bindings: {
        ...sanitizedMessage,
        ...contextBinding,
      },
    };
  }

  return {
    bindings: {
      ...contextBinding,
      value: sanitizedMessage,
    },
  };
}

function sanitizeLogValue(
  value: unknown,
  seenObjects = new WeakSet<object>(),
): unknown {
  if (value instanceof Error) {
    return { errorName: value.name, message: value.message };
  }

  if (Array.isArray(value)) {
    if (seenObjects.has(value)) {
      return '[Circular]';
    }

    seenObjects.add(value);
    return value.map((item) => sanitizeLogValue(item, seenObjects));
  }

  if (!isRecord(value)) {
    return value;
  }

  if (seenObjects.has(value)) {
    return '[Circular]';
  }

  seenObjects.add(value);
  const sanitizedValue: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    sanitizedValue[key] = isSensitiveFieldName(key)
      ? REDACTION_CENSOR
      : sanitizeLogValue(nestedValue, seenObjects);
  }

  return sanitizedValue;
}

function getNestContext(
  optionalParams: readonly unknown[],
): string | undefined {
  const candidate = optionalParams.at(-1);
  return typeof candidate === 'string' && candidate.length > 0
    ? candidate
    : undefined;
}

function isSensitiveFieldName(fieldName: string): boolean {
  return NORMALIZED_SENSITIVE_FIELD_NAMES.has(normalizeFieldName(fieldName));
}

function normalizeFieldName(fieldName: string): string {
  return fieldName.replaceAll('_', '').replaceAll('-', '').toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

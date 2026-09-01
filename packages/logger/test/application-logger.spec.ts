import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import test from 'node:test';

import {
  createApplicationLoggerForDestination,
  createApplicationLoggerForPrettyBackend,
} from '../src/application-logger';

interface PrettyLogRecord {
  readonly level: string;
  readonly message: unknown;
  readonly optionalParams: readonly unknown[];
}

class MemoryDestination extends Writable {
  private output = '';

  get record(): Record<string, unknown> {
    const parsed: unknown = JSON.parse(this.output.trim());
    assert.ok(isRecord(parsed));
    return parsed;
  }

  override _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.output += chunk.toString('utf8');
    callback();
  }
}

class MemoryPrettyLogger {
  record: PrettyLogRecord | undefined;

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.capture('debug', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.capture('error', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.capture('fatal', message, optionalParams);
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.capture('log', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.capture('verbose', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.capture('warn', message, optionalParams);
  }

  private capture(
    level: string,
    message: unknown,
    optionalParams: readonly unknown[],
  ): void {
    this.record = { level, message, optionalParams };
  }
}

void test('writes structured application and Nest context fields', () => {
  const destination = new MemoryDestination();
  const logger = createApplicationLoggerForDestination(
    { service: 'best-api' },
    destination,
  );

  logger.log('Application started', 'NestApplication');

  assert.equal(destination.record.level, 'info');
  assert.equal(destination.record.service, 'best-api');
  assert.equal(destination.record.context, 'NestApplication');
  assert.equal(destination.record.msg, 'Application started');
  assert.equal(typeof destination.record.time, 'string');
});

void test('redacts known credential fields in structured events', () => {
  const destination = new MemoryDestination();
  const logger = createApplicationLoggerForDestination(
    { service: 'best-api' },
    destination,
  );

  logger.error({
    DATABASE_URL: 'postgresql://private-connection',
    authorization: 'Bearer private-token',
    event: 'api_request_failed',
    request: {
      credentials: {
        password: 'private-password',
      },
    },
  });

  assert.equal(destination.record.DATABASE_URL, '[REDACTED]');
  assert.equal(destination.record.authorization, '[REDACTED]');
  const request = getRecord(destination.record.request);
  const credentials = getRecord(request.credentials);
  assert.equal(credentials.password, '[REDACTED]');
  assert.equal(destination.record.event, 'api_request_failed');
});

void test('pretty output preserves Nest context and redacts credentials', () => {
  const destination = new MemoryPrettyLogger();
  const logger = createApplicationLoggerForPrettyBackend(destination);

  logger.log(
    { event: 'connected', password: 'private-password' },
    'InstanceLoader',
  );

  const record = getPrettyLogRecord(destination.record);
  assert.equal(record.level, 'log');
  const message = getRecord(record.message);
  assert.equal(message.event, 'connected');
  assert.equal(message.password, '[REDACTED]');
  assert.deepEqual(record.optionalParams, ['InstanceLoader']);
});

function getPrettyLogRecord(
  value: PrettyLogRecord | undefined,
): PrettyLogRecord {
  assert.ok(value !== undefined);
  return value;
}

function getRecord(value: unknown): Record<string, unknown> {
  assert.ok(isRecord(value));
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

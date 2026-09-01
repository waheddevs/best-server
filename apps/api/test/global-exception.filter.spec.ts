import assert from 'node:assert/strict';
import test from 'node:test';

import { UnauthorizedException } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { GraphQLError } from 'graphql';

import { ErrorCode } from '../src/libs/enums/error-code.enum';
import { GlobalExceptionFilter } from '../src/libs/filters/global-exception.filter';

class TestResponse {
  body: unknown;
  statusCode = 0;

  json(body: unknown): this {
    this.body = body;
    return this;
  }

  status(statusCode: number): this {
    this.statusCode = statusCode;
    return this;
  }
}

void test('global filter maps HTTP authentication errors', () => {
  const response = new TestResponse();
  const context = new ExecutionContextHost([
    { requestId: 'request-1' },
    response,
  ]);
  context.setType('http');

  new GlobalExceptionFilter().catch(new UnauthorizedException(), context);

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, {
    code: ErrorCode.UNAUTHENTICATED,
    message: 'Unauthorized',
    requestId: 'request-1',
    status: 401,
  });
});

void test('global filter maps Prisma unique conflicts without leaking details', () => {
  const response = new TestResponse();
  const context = new ExecutionContextHost([
    { requestId: 'request-2' },
    response,
  ]);
  context.setType('http');

  new GlobalExceptionFilter().catch({ code: 'P2002' }, context);

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.body, {
    code: ErrorCode.CONFLICT,
    message: 'A conflicting record already exists',
    requestId: 'request-2',
    status: 409,
  });
});

void test('global filter returns GraphQL extensions and masks unknown errors', () => {
  const context = new ExecutionContextHost([
    undefined,
    undefined,
    { req: { requestId: 'request-3' } },
    undefined,
  ]);
  context.setType('graphql');

  const result = new GlobalExceptionFilter().catch(
    new Error('sensitive internal detail'),
    context,
  );

  assert.ok(result instanceof GraphQLError);
  assert.equal(result.message, 'Internal server error');
  assert.equal(result.extensions.code, ErrorCode.INTERNAL_SERVER_ERROR);
  assert.equal(result.extensions.requestId, 'request-3');
});

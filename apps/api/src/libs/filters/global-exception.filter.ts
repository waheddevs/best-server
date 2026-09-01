import { randomUUID } from 'node:crypto';

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { GqlArgumentsHost, type GqlExceptionFilter } from '@nestjs/graphql';
import type { Response } from 'express';
import { GraphQLError } from 'graphql';

import { ErrorCode } from '../enums/error-code.enum';
import { ApplicationError } from '../errors/application.error';
import type { ApiGraphqlContext } from '../types/authenticated-request.type';
import type { ErrorResponse } from '../types/error-response.type';

interface NormalizedException {
  readonly code: ErrorCode;
  readonly message: string;
  readonly report: boolean;
  readonly status: number;
}

@Catch()
export class GlobalExceptionFilter
  implements
    ExceptionFilter<unknown>,
    GqlExceptionFilter<unknown, GraphQLError | undefined>
{
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): GraphQLError | undefined {
    const normalizedException = normalizeException(exception);
    const requestId = getRequestId(host);

    if (normalizedException.report) {
      this.logger.error({
        code: normalizedException.code,
        event: 'api_request_failed',
        exceptionName:
          exception instanceof Error ? exception.name : 'UnknownException',
        requestId,
        status: normalizedException.status,
      });
    }

    const response: ErrorResponse = {
      code: normalizedException.code,
      message: normalizedException.message,
      requestId,
      status: normalizedException.status,
    };

    if (host.getType<string>() === 'graphql') {
      return new GraphQLError(response.message, {
        extensions: {
          code: response.code,
          requestId: response.requestId,
          status: response.status,
        },
      });
    }

    host
      .switchToHttp()
      .getResponse<Response>()
      .status(response.status)
      .json(response);

    return undefined;
  }
}

function getRequestId(host: ArgumentsHost): string {
  if (host.getType<string>() === 'graphql') {
    return (
      GqlArgumentsHost.create(host).getContext<ApiGraphqlContext>().req
        .requestId ?? randomUUID()
    );
  }

  return (
    host.switchToHttp().getRequest<{ requestId?: string }>().requestId ??
    randomUUID()
  );
}

function normalizeException(exception: unknown): NormalizedException {
  if (exception instanceof ApplicationError) {
    return {
      code: exception.code,
      message: exception.message,
      report: exception.status >= 500,
      status: exception.status,
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();

    return {
      code: mapHttpStatusToErrorCode(status),
      message:
        status >= 500
          ? 'Internal server error'
          : getHttpExceptionMessage(exception),
      report: status >= 500,
      status,
    };
  }

  const prismaErrorCode = getPrismaErrorCode(exception);

  if (prismaErrorCode === 'P2002') {
    return {
      code: ErrorCode.CONFLICT,
      message: 'A conflicting record already exists',
      report: false,
      status: 409,
    };
  }

  if (prismaErrorCode === 'P2025') {
    return {
      code: ErrorCode.NOT_FOUND,
      message: 'The requested record was not found',
      report: false,
      status: 404,
    };
  }

  if (prismaErrorCode?.startsWith('P10') === true) {
    return {
      code: ErrorCode.SERVICE_UNAVAILABLE,
      message: 'A required service is temporarily unavailable',
      report: true,
      status: 503,
    };
  }

  return {
    code: ErrorCode.INTERNAL_SERVER_ERROR,
    message: 'Internal server error',
    report: true,
    status: 500,
  };
}

function getHttpExceptionMessage(exception: HttpException): string {
  const response: unknown = exception.getResponse();

  if (typeof response === 'string') {
    return response;
  }

  if (isRecord(response) && typeof response.message === 'string') {
    return response.message;
  }

  if (
    isRecord(response) &&
    Array.isArray(response.message) &&
    response.message.every((message) => typeof message === 'string')
  ) {
    return 'Request validation failed';
  }

  return exception.message;
}

function getPrismaErrorCode(exception: unknown): string | undefined {
  if (!isRecord(exception) || typeof exception.code !== 'string') {
    return undefined;
  }

  return exception.code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function mapHttpStatusToErrorCode(status: number): ErrorCode {
  switch (status) {
    case 400:
    case 422:
      return ErrorCode.BAD_USER_INPUT;
    case 401:
      return ErrorCode.UNAUTHENTICATED;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 409:
      return ErrorCode.CONFLICT;
    case 429:
      return ErrorCode.RATE_LIMITED;
    case 503:
      return ErrorCode.SERVICE_UNAVAILABLE;
    default:
      return ErrorCode.INTERNAL_SERVER_ERROR;
  }
}

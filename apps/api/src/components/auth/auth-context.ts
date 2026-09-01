import {
  type ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

import type {
  ApiGraphqlContext,
  AuthenticatedRequest,
} from '../../libs/types/authenticated-request.type';

export function getAuthenticatedRequest(
  context: ExecutionContext,
): AuthenticatedRequest {
  const contextType = context.getType<string>();

  if (contextType === 'graphql') {
    return GqlExecutionContext.create(context).getContext<ApiGraphqlContext>()
      .req;
  }

  if (contextType === 'http') {
    return context.switchToHttp().getRequest<AuthenticatedRequest>();
  }

  throw new InternalServerErrorException(
    `Unsupported authentication context: ${contextType}`,
  );
}

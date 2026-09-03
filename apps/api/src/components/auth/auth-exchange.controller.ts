import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';

import type { AuthExchangeResult } from './auth-identity.type';
import { AuthExchangeService } from './auth-exchange.service';

const MAXIMUM_ASSERTION_LENGTH = 8_192;

@Controller('internal/auth')
export class AuthExchangeController {
  constructor(private readonly authExchangeService: AuthExchangeService) {}

  @Post('exchange')
  @HttpCode(HttpStatus.OK)
  async exchange(@Body() body: unknown): Promise<AuthExchangeResult> {
    return this.authExchangeService.exchangeIdentityAssertion(
      parseAssertionBody(body),
    );
  }
}

function parseAssertionBody(body: unknown): string {
  if (!isRecord(body) || Object.keys(body).length !== 1) {
    throw new BadRequestException('An identity assertion is required');
  }

  const assertion = body.assertion;

  if (
    typeof assertion !== 'string' ||
    assertion.length === 0 ||
    assertion.length > MAXIMUM_ASSERTION_LENGTH
  ) {
    throw new BadRequestException('An identity assertion is required');
  }

  return assertion;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

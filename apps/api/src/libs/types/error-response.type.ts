import type { ErrorCode } from '../enums/error-code.enum';

export interface ErrorResponse {
  readonly code: ErrorCode;
  readonly message: string;
  readonly requestId: string;
  readonly status: number;
}

import type { ErrorCode } from '../enums/error-code.enum';

export class ApplicationError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = ApplicationError.name;
  }
}

import { AiChatFault } from '@best/ai-chat';
import { parseTeacherAiEnvironment } from '@best/config';
import { TeacherAiStore } from '@best/database';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ApplicationError } from '../../libs/errors/application.error';
import { ErrorCode } from '../../libs/enums/error-code.enum';

@Injectable()
export class AiAssistantService {
  private readonly store: TeacherAiStore;

  constructor(database: DatabaseService) {
    // Infrastructure/auth bootstrap has already loaded the root environment.
    // Validate enabled configuration at startup, without requiring a disabled key.
    parseTeacherAiEnvironment(process.env);
    this.store = new TeacherAiStore(database, () =>
      parseTeacherAiEnvironment(process.env),
    );
  }

  async execute<T>(
    operation: (store: TeacherAiStore) => Promise<T>,
  ): Promise<T> {
    try {
      return await operation(this.store);
    } catch (error) {
      if (!(error instanceof AiChatFault)) throw error;
      const statuses = {
        BAD_USER_INPUT: 400,
        NOT_FOUND: 404,
        FORBIDDEN: 403,
        CONFLICT: 409,
        RATE_LIMITED: 429,
        SERVICE_UNAVAILABLE: 503,
      };
      throw new ApplicationError(
        ErrorCode[error.code],
        error.code,
        statuses[error.code],
      );
    }
  }
}

export const AI_CHAT_QUEUE = 'ai-chat';
export const AI_CHAT_JOB_VERSION = 1;

export interface AiChatJob {
  readonly version: typeof AI_CHAT_JOB_VERSION;
  readonly runId: string;
}

export class AiChatValidationError extends Error {
  constructor(
    readonly code:
      'INVALID_JOB' | 'INVALID_TEXT' | 'INVALID_KEY' | 'UNAVAILABLE_MODEL',
  ) {
    super(code);
    this.name = AiChatValidationError.name;
  }
}

export function isChatUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

// IDs only: ownership, audit context and text must be reloaded from PostgreSQL.
export function parseAiChatJob(value: unknown): AiChatJob {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('version' in value) ||
    value.version !== AI_CHAT_JOB_VERSION ||
    !('runId' in value) ||
    !isChatUuid(value.runId) ||
    Object.keys(value).some((key) => key !== 'version' && key !== 'runId')
  ) {
    throw new AiChatValidationError('INVALID_JOB');
  }
  return { version: AI_CHAT_JOB_VERSION, runId: value.runId.toLowerCase() };
}

export function aiChatJobId(job: AiChatJob): string {
  return `ai-chat-v1-${parseAiChatJob(job).runId}`;
}

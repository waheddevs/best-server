import { AiChatValidationError, isChatUuid } from './chat-job';

export function parseAiChatText(value: unknown, maxCharacters: number): string {
  if (
    !Number.isSafeInteger(maxCharacters) ||
    maxCharacters < 1 ||
    maxCharacters > 32_000
  ) {
    throw new AiChatValidationError('INVALID_TEXT');
  }
  // Apply the bound before trimming; do not accept oversized whitespace bodies.
  if (
    typeof value !== 'string' ||
    value.length > maxCharacters ||
    value.includes('\0')
  ) {
    throw new AiChatValidationError('INVALID_TEXT');
  }
  const text = value.trim();
  if (text.length === 0) throw new AiChatValidationError('INVALID_TEXT');
  return text;
}

export function parseAiChatIdempotencyKey(value: unknown): string {
  if (!isChatUuid(value)) throw new AiChatValidationError('INVALID_KEY');
  return value.toLowerCase();
}

export function deriveAiChatTitle(firstMessage: string): string {
  const text = parseAiChatText(firstMessage, 32_000).replace(/\s+/gu, ' ');
  const characters = Array.from(text);
  return characters.length <= 80
    ? text
    : `${characters.slice(0, 79).join('')}…`;
}

export type AiDispatchFailure =
  'RATE_LIMITED' | 'UNAVAILABLE' | 'REJECTED' | 'AMBIGUOUS';

// A timeout, connection loss, 5xx or malformed success can hide completed work.
// Never automatically dispatch again without durable reconciliation evidence.
export function classifyAiDispatchFailure(status?: number): AiDispatchFailure {
  if (status === 429) return 'RATE_LIMITED';
  if (status === 404 || status === 402) return 'UNAVAILABLE';
  if (
    status !== undefined &&
    Number.isInteger(status) &&
    status >= 400 &&
    status < 500
  ) {
    return 'REJECTED';
  }
  return 'AMBIGUOUS';
}

export function aiChatPublishRetryDelay(failedAttempts: number): number | null {
  if (
    !Number.isSafeInteger(failedAttempts) ||
    failedAttempts < 1 ||
    failedAttempts >= 5
  )
    return null;
  return Math.min(1_000 * 2 ** (failedAttempts - 1), 8_000);
}

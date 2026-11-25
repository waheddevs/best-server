import { AiChatValidationError } from './chat-job';

export interface FreeModelEvidence {
  readonly id: string;
  readonly pricing: Readonly<Record<string, unknown>>;
  readonly checkedAtMilliseconds: number;
}

export function isPinnedFreeModel(model: string): boolean {
  return (
    /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*:free$/.test(model) &&
    !model.startsWith('openrouter/')
  );
}

// Call immediately before dispatch using a fresh server-fetched catalog entry.
// This is a cost gate, not authorization or proof of endpoint privacy eligibility.
export function assertFreeModelEvidence(
  configuredModel: string,
  evidence: FreeModelEvidence,
  nowMilliseconds: number,
): void {
  const age = nowMilliseconds - evidence.checkedAtMilliseconds;
  const prices = Object.values(evidence.pricing);
  if (
    !isPinnedFreeModel(configuredModel) ||
    evidence.id !== configuredModel ||
    !Number.isSafeInteger(nowMilliseconds) ||
    !Number.isSafeInteger(evidence.checkedAtMilliseconds) ||
    age < 0 ||
    age > 300_000 ||
    !('prompt' in evidence.pricing) ||
    !('completion' in evidence.pricing) ||
    prices.some(
      (price) => typeof price !== 'string' || !/^0(?:\.0+)?$/.test(price),
    )
  ) {
    throw new AiChatValidationError('UNAVAILABLE_MODEL');
  }
}

export function freeModelProviderPolicy(endpoint: string) {
  if (
    !/^[a-z0-9][a-z0-9._/-]{0,159}$/.test(endpoint) ||
    endpoint.includes('..') ||
    endpoint.includes('//')
  ) {
    throw new AiChatValidationError('UNAVAILABLE_MODEL');
  }
  return {
    only: [endpoint],
    order: [endpoint],
    allow_fallbacks: false,
    data_collection: 'deny',
    zdr: true,
    max_price: { prompt: 0, completion: 0, request: 0 },
  } as const;
}

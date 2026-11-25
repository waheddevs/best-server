import {
  assertFreeModelEvidence,
  classifyAiDispatchFailure,
  freeModelProviderPolicy,
  TEACHER_AI_SYSTEM_PROMPT,
  type AiChatCompletion,
  type AiChatHistoryMessage,
} from '@best/ai-chat';
import type { TeacherAiEnvironment } from '@best/config';

type EnabledEnvironment = Extract<TeacherAiEnvironment, { enabled: true }>;
export class AiGatewayError extends Error {
  constructor(
    readonly code: string,
    readonly ambiguous: boolean,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = AiGatewayError.name;
  }
}

export class OpenRouterChatGateway {
  constructor(private readonly transport: typeof fetch = fetch) {}

  async inspect(
    config: EnabledEnvironment,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      const response = await this.transport(
        'https://openrouter.ai/api/v1/models',
        { signal, redirect: 'error', headers: { accept: 'application/json' } },
      );
      if (!response.ok) throw new Error('catalog unavailable');
      const catalog = record(await readJson(response, 4_000_000));
      if (!Array.isArray(catalog.data)) throw new Error('invalid catalog');
      const model = catalog.data
        .map(record)
        .find((item) => item.id === config.model);
      if (
        !model ||
        typeof model.context_length !== 'number' ||
        model.context_length < config.maxContextTokens
      )
        throw new Error('ineligible model');
      assertFreeModelEvidence(
        config.model,
        {
          id: config.model,
          pricing: record(model.pricing),
          checkedAtMilliseconds: Date.now(),
        },
        Date.now(),
      );
      // Account defaults may allow Safety Retention even with zdr:true.
      // Require fresh evidence for the exact pinned free endpoint as well.
      const privacyResponse = await this.transport(
        'https://openrouter.ai/api/v1/endpoints/zdr',
        {
          signal,
          redirect: 'error',
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${config.apiKey}`,
          },
        },
      );
      if (!privacyResponse.ok) throw new Error('privacy catalog unavailable');
      const privacy = record(await readJson(privacyResponse, 4_000_000));
      if (!Array.isArray(privacy.data))
        throw new Error('invalid privacy catalog');
      const endpoint = privacy.data
        .map(record)
        .find(
          (item) =>
            item.model_id === config.model &&
            item.tag === config.providerEndpoint,
        );
      if (endpoint?.safety_retention !== false || endpoint.status !== 0)
        throw new Error('ineligible private endpoint');
    } catch {
      throw new AiGatewayError('SERVICE_UNAVAILABLE', false, true);
    }
  }

  async complete(
    config: EnabledEnvironment,
    messages: readonly AiChatHistoryMessage[],
    signal: AbortSignal,
  ): Promise<AiChatCompletion> {
    let response: Response;
    try {
      response = await this.transport(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          signal,
          redirect: 'error',
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify({
            model: config.model,
            stream: false,
            max_tokens: config.maxOutputTokens,
            provider: freeModelProviderPolicy(config.providerEndpoint),
            messages: [
              { role: 'system', content: TEACHER_AI_SYSTEM_PROMPT },
              ...messages,
            ],
          }),
        },
      );
    } catch {
      throw new AiGatewayError('AMBIGUOUS', true, false);
    }
    if (!response.ok) {
      const kind = classifyAiDispatchFailure(response.status);
      await response.body?.cancel();
      throw new AiGatewayError(
        kind === 'RATE_LIMITED'
          ? 'RATE_LIMITED'
          : kind === 'AMBIGUOUS'
            ? 'AMBIGUOUS'
            : 'SERVICE_UNAVAILABLE',
        kind === 'AMBIGUOUS',
        kind === 'RATE_LIMITED' || kind === 'UNAVAILABLE',
      );
    }
    try {
      const result = record(await readJson(response, 256_000));
      if (
        result.error ||
        !Array.isArray(result.choices) ||
        result.choices.length !== 1
      )
        throw new Error('invalid completion');
      const choice = record(result.choices[0]);
      const message = record(choice.message);
      if (
        message.role !== 'assistant' ||
        message.tool_calls ||
        (choice.finish_reason !== 'stop' && choice.finish_reason !== 'length')
      )
        throw new Error('unsupported response');
      const text = boundedString(message.content, 32_000);
      const model = boundedString(result.model, 160);
      if (
        model !== config.model &&
        model !== config.model.replace(/:free$/, '')
      )
        throw new Error('model mismatch');
      const usage = record(result.usage);
      // Preserve even sub-nanodollar charges as a positive conservative amount.
      const cost =
        typeof usage.cost === 'number' &&
        Number.isFinite(usage.cost) &&
        usage.cost >= 0
          ? (usage.cost > 0 ? Math.max(usage.cost, 0.000000001) : 0)
              .toFixed(9)
              .replace(/\.?0+$/, '') || '0'
          : usage.cost;
      if (typeof cost !== 'string' || !/^\d{1,9}(?:\.\d{1,9})?$/.test(cost))
        throw new Error('missing usage evidence');
      return {
        text,
        model,
        cost,
        requestId: boundedString(result.id, 160),
        provider:
          result.provider === undefined
            ? null
            : boundedString(result.provider, 160),
        inputTokens: integer(usage.prompt_tokens),
        outputTokens: integer(usage.completion_tokens),
      };
    } catch {
      throw new AiGatewayError('AMBIGUOUS', true, false);
    }
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('invalid object');
  return value as Record<string, unknown>;
}
function boundedString(value: unknown, limit: number): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > limit ||
    value.includes('\0')
  )
    throw new Error('invalid text');
  return value.trim();
}
function integer(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 2_000_000_000
  )
    throw new Error('invalid usage');
  return value;
}
async function readJson(response: Response, limit: number): Promise<unknown> {
  if (!response.body) throw new Error('missing body');
  const reader = response.body.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > limit) throw new Error('oversized body');
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

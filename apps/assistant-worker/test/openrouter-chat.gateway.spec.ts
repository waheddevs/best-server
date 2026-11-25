import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTeacherAiEnvironment } from '@best/config';
import {
  AiGatewayError,
  OpenRouterChatGateway,
} from '../src/openrouter-chat.gateway';

const config = parseTeacherAiEnvironment({
  TEACHER_AI_CHAT_ENABLED: 'true',
  OPENROUTER_API_KEY: 'fictional-test-key',
  AI_CHAT_MODEL: 'fictional/teacher:free',
  AI_CHAT_PROVIDER_ENDPOINT: 'fictional/eu',
  AI_CHAT_PRIVACY_REVIEWED: 'true',
  AI_CHAT_RETENTION_DAYS: '7',
  AI_CHAT_PROCESSING_NOTICE_VERSION: 'test-v1',
  AI_CHAT_PILOT_TEACHER_IDS: 'a07ecadd-32b6-40aa-8925-537447893bd7',
});
assert.ok(config.enabled);
const enabled = config;
const completion = {
  id: 'fictional-request',
  model: enabled.model,
  provider: 'Fictional',
  choices: [
    {
      finish_reason: 'stop',
      message: {
        role: 'assistant',
        content: '**Past simple** describes a completed event.',
      },
    },
  ],
  usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0 },
};

void test('dispatch sends only the pinned free model, private routing and bounded text', async () => {
  const transport: typeof fetch = (url, init) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(init?.redirect, 'error');
    assert.equal(typeof init.body, 'string');
    assert.ok(typeof init.body === 'string');
    const payload: unknown = JSON.parse(init.body);
    assert.ok(typeof payload === 'object' && payload !== null);
    assert.equal(Reflect.get(payload, 'model'), enabled.model);
    assert.equal(Reflect.get(payload, 'stream'), false);
    assert.equal(Reflect.get(payload, 'max_tokens'), 1024);
    assert.deepEqual(Reflect.get(payload, 'provider'), {
      only: ['fictional/eu'],
      order: ['fictional/eu'],
      allow_fallbacks: false,
      data_collection: 'deny',
      zdr: true,
      max_price: { prompt: 0, completion: 0, request: 0 },
    });
    assert.equal(Reflect.get(payload, 'tools'), undefined);
    return Promise.resolve(Response.json(completion));
  };
  const result = await new OpenRouterChatGateway(transport).complete(
    enabled,
    [{ role: 'user', content: 'Explain past simple.' }],
    AbortSignal.timeout(1000),
  );
  assert.equal(result.cost, '0');
  assert.equal(result.requestId, 'fictional-request');
});

void test('catalog rejects paid, missing and undersized models before inference', async () => {
  for (const data of [
    [],
    [
      {
        id: enabled.model,
        context_length: 4096,
        pricing: { prompt: '0', completion: '0.001' },
      },
    ],
    [
      {
        id: enabled.model,
        context_length: 100,
        pricing: { prompt: '0', completion: '0' },
      },
    ],
  ]) {
    const gateway = new OpenRouterChatGateway(() =>
      Promise.resolve(Response.json({ data })),
    );
    await assert.rejects(
      gateway.inspect(enabled, AbortSignal.timeout(1000)),
      (error: unknown) => error instanceof AiGatewayError && !error.ambiguous,
    );
  }
});

void test('catalog allows only fresh zero-price eligible evidence', async () => {
  const gateway = new OpenRouterChatGateway((url) =>
    Promise.resolve(
      Response.json(
        url === 'https://openrouter.ai/api/v1/endpoints/zdr'
          ? {
              data: [
                {
                  model_id: enabled.model,
                  tag: enabled.providerEndpoint,
                  safety_retention: false,
                  status: 0,
                },
              ],
            }
          : {
              data: [
                {
                  id: enabled.model,
                  context_length: 8192,
                  pricing: { prompt: '0', completion: '0', request: '0' },
                },
              ],
            },
      ),
    ),
  );
  await gateway.inspect(enabled, AbortSignal.timeout(1000));
});

void test('privacy drift, Safety Retention, unknown fields and unavailable endpoints block dispatch', async () => {
  const endpoint = {
    model_id: enabled.model,
    tag: enabled.providerEndpoint,
    safety_retention: false,
    status: 0,
  };
  for (const data of [
    [],
    [{ ...endpoint, model_id: 'fictional/teacher' }],
    [{ ...endpoint, tag: 'unreviewed' }],
    [{ ...endpoint, safety_retention: true }],
    [{ ...endpoint, safety_retention: undefined }],
    [{ ...endpoint, status: -1 }],
  ]) {
    const gateway = new OpenRouterChatGateway((url) =>
      Promise.resolve(
        Response.json({
          data:
            url === 'https://openrouter.ai/api/v1/endpoints/zdr'
              ? data
              : [
                  {
                    id: enabled.model,
                    context_length: 8192,
                    pricing: { prompt: '0', completion: '0' },
                  },
                ],
        }),
      ),
    );
    await assert.rejects(
      gateway.inspect(enabled, AbortSignal.timeout(1000)),
      (error: unknown) => error instanceof AiGatewayError && !error.ambiguous,
    );
  }
});

void test('429 and unavailable responses differ from ambiguous 5xx and timeouts', async () => {
  for (const status of [402, 404, 429, 500, 503]) {
    const gateway = new OpenRouterChatGateway(() =>
      Promise.resolve(new Response('{}', { status })),
    );
    await assert.rejects(
      gateway.complete(enabled, [], AbortSignal.timeout(1000)),
      (error: unknown) =>
        error instanceof AiGatewayError && error.ambiguous === status >= 500,
    );
  }
  const gateway = new OpenRouterChatGateway(() =>
    Promise.reject(new Error('fictional-secret-must-not-escape')),
  );
  await assert.rejects(
    gateway.complete(enabled, [], AbortSignal.timeout(1000)),
    (error: unknown) =>
      error instanceof AiGatewayError &&
      error.ambiguous &&
      !error.message.includes('fictional-secret'),
  );
});

void test('malformed, foreign-model and oversized responses never reach chat history', async () => {
  for (const result of [
    { ...completion, usage: {} },
    { ...completion, model: 'fictional/paid' },
    {
      ...completion,
      choices: [
        {
          finish_reason: 'tool_calls',
          message: { role: 'assistant', content: 'run code', tool_calls: [] },
        },
      ],
    },
    {
      ...completion,
      choices: [
        {
          finish_reason: 'stop',
          message: { role: 'assistant', content: 'a'.repeat(32001) },
        },
      ],
    },
  ]) {
    const gateway = new OpenRouterChatGateway(() =>
      Promise.resolve(Response.json(result)),
    );
    await assert.rejects(
      gateway.complete(enabled, [], AbortSignal.timeout(1000)),
      (error: unknown) => error instanceof AiGatewayError && error.ambiguous,
    );
  }
});

void test('unexpected nonzero usage remains visible to the durable safety stop', async () => {
  const gateway = new OpenRouterChatGateway(() =>
    Promise.resolve(
      Response.json({
        ...completion,
        usage: { ...completion.usage, cost: 0.001 },
      }),
    ),
  );
  assert.equal(
    (await gateway.complete(enabled, [], AbortSignal.timeout(1000))).cost,
    '0.001',
  );
});

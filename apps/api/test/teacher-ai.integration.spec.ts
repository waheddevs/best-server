import 'reflect-metadata';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { promisify } from 'node:util';
import { AiChatFault } from '@best/ai-chat';
import {
  loadInfrastructureEnvironment,
  parseTeacherAiEnvironment,
} from '@best/config';
import {
  AiChatRunStatus,
  AiMessageKind,
  AiProviderCallStatus,
  OutboxEventType,
  TeacherAiStore,
  UserRole,
  UserStatus,
} from '@best/database';
import {
  AssistantWorkerModule,
  OpenRouterChatGateway,
  getQueueToken,
  type Queue,
} from '@best/assistant-worker/testing';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/components/auth/auth.service';
import { DatabaseService } from '../src/database/database.service';

const originalEnv = { ...process.env };
const infrastructure = loadInfrastructureEnvironment();
const databaseName = `best_ai_test_${randomUUID().replaceAll('-', '')}`;
const testUrl = new URL(infrastructure.postgres.url);
testUrl.pathname = `/${databaseName}`;
const adminPool = new Pool({ connectionString: infrastructure.postgres.url });
const teacherId = randomUUID();
const otherId = randomUUID();
let app: INestApplication | undefined;
let worker: TestingModule | undefined;
let db: DatabaseService;
let store: TeacherAiStore;
let url: string;
let teacherToken: string;
let otherToken: string;
let studentToken: string;
let adminToken: string;
let queue: Queue;
let calls = 0;
let mode: 'ok' | '429' | 'timeout' = 'ok';

function configure() {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: testUrl.toString(),
    AUTH_EMAIL_DELIVERY_MODE: 'disabled',
    AUTH_REQUIRE_EMAIL_VERIFICATION: 'false',
    AUTH_OTP_HASH_SECRET: 'fictional-ai-test-otp-secret-with-at-least-32-chars',
    TEACHER_AI_CHAT_ENABLED: 'true',
    OPENROUTER_API_KEY: 'fictional-test-key',
    AI_CHAT_MODEL: 'fictional/teacher:free',
    AI_CHAT_PROVIDER_ENDPOINT: 'fictional/eu',
    AI_CHAT_PRIVACY_REVIEWED: 'true',
    AI_CHAT_RETENTION_DAYS: '7',
    AI_CHAT_PROCESSING_NOTICE_VERSION: 'test-v1',
    AI_CHAT_PILOT_TEACHER_IDS: `${teacherId},${otherId}`,
    AI_CHAT_DAILY_BUDGET_USD: '0',
    AI_CHAT_DAILY_REQUEST_LIMIT: '40',
    AI_CHAT_TEACHER_DAILY_REQUEST_LIMIT: '10',
    AI_CHAT_REQUESTS_PER_MINUTE: '20',
    AI_CHAT_CONCURRENCY: '1',
    AI_CHAT_MAX_INPUT_CHARACTERS: '4000',
    AI_CHAT_MAX_CONTEXT_TOKENS: '4096',
    AI_CHAT_MAX_OUTPUT_TOKENS: '1024',
    AI_CHAT_TIMEOUT_MS: '1000',
    AI_CHAT_TEST_QUEUE_PREFIX: `best-ai-test-${databaseName}`,
  });
}

before(async () => {
  configure();
  await adminPool.query(`CREATE DATABASE "${databaseName}"`);
  await promisify(execFile)(
    process.execPath,
    [resolve('../../node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    {
      cwd: resolve('../../packages/database'),
      env: { ...process.env, DATABASE_URL: testUrl.toString() },
    },
  );
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = module.createNestApplication({ abortOnError: false });
  app.useLogger(false);
  await app.listen(0, '127.0.0.1');
  url = `${await app.getUrl()}/graphql`;
  db = app.get(DatabaseService);
  store = new TeacherAiStore(db, () => parseTeacherAiEnvironment(process.env));
  const studentId = randomUUID();
  const adminId = randomUUID();
  await db.user.createMany({
    data: [
      {
        id: teacherId,
        role: UserRole.TEACHER,
        displayName: 'Fictional AI Teacher',
        email: 'teacher-ai@example.test',
      },
      {
        id: otherId,
        role: UserRole.TEACHER,
        displayName: 'Fictional Other Teacher',
        email: 'other-ai@example.test',
      },
      {
        id: studentId,
        role: UserRole.STUDENT,
        displayName: 'Fictional AI Student',
      },
      { id: adminId, role: UserRole.ADMIN, displayName: 'Fictional AI Admin' },
    ],
  });
  const auth = app.get(AuthService);
  teacherToken = await auth.issueAccessToken({
    id: teacherId,
    role: UserRole.TEACHER,
  });
  otherToken = await auth.issueAccessToken({
    id: otherId,
    role: UserRole.TEACHER,
  });
  studentToken = await auth.issueAccessToken({
    id: studentId,
    role: UserRole.STUDENT,
  });
  adminToken = await auth.issueAccessToken({
    id: adminId,
    role: UserRole.ADMIN,
  });
});

beforeEach(async () => {
  configure();
  if (worker) {
    await worker.close();
    worker = undefined;
  }
  await db.outboxEvent.updateMany({
    where: {
      eventType: OutboxEventType.TEACHER_AI_CHAT_REQUESTED_V1,
      publishedAt: null,
    },
    data: { publishedAt: new Date() },
  });
  await db.aiConversation.deleteMany();
  // Fixture reset is confined to the randomly named disposable database above.
  // Runtime never truncates or deletes the append-only audit quota ledger.
  assert.match(
    new URL(process.env.DATABASE_URL ?? '').pathname,
    /^\/best_ai_test_[a-f0-9]{32}$/,
  );
  await db.$executeRaw`TRUNCATE TABLE audit_logs`;
  await db.user.update({
    where: { id: teacherId },
    data: { status: UserStatus.ACTIVE },
  });
  mode = 'ok';
  calls = 0;
});

after(async () => {
  if (worker) await worker.close();
  if (app) await app.close();
  // Drop only the generated test database, never a configured production name.
  assert.match(databaseName, /^best_ai_test_[a-f0-9]{32}$/);
  await adminPool.query(
    `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
  );
  await adminPool.end();
  for (const key of Object.keys(process.env))
    if (!(key in originalEnv)) Reflect.deleteProperty(process.env, key);
  Object.assign(process.env, originalEnv);
});

async function graphql(
  token: string | undefined,
  query: string,
  variables: Record<string, unknown> = {},
) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  return record(await response.json());
}
function record(value: unknown): Record<string, unknown> {
  assert.ok(
    value !== null && typeof value === 'object' && !Array.isArray(value),
  );
  return value as Record<string, unknown>;
}
function errorCode(result: Record<string, unknown>): unknown {
  assert.ok(Array.isArray(result.errors));
  return record(record(result.errors[0]).extensions).code;
}
async function create(actorId = teacherId) {
  return store.create(actorId, randomUUID(), 'test-v1', true);
}
async function send(
  conversationId: string,
  text = 'Explain English articles.',
  actorId = teacherId,
) {
  return store.send(actorId, conversationId, text, randomUUID());
}
const answer = {
  text: 'Use a/an for an indefinite singular noun.',
  requestId: 'fictional-provider-id',
  model: 'fictional/teacher:free',
  provider: 'Fictional',
  inputTokens: 60,
  outputTokens: 20,
  cost: '0',
};

void test('GraphQL requires an active DB Teacher and hides another owner', async () => {
  const query = '{ teacherAiAvailability { available } }';
  assert.equal(errorCode(await graphql(undefined, query)), 'UNAUTHENTICATED');
  for (const token of [studentToken, adminToken])
    assert.equal(errorCode(await graphql(token, query)), 'FORBIDDEN');
  assert.equal(
    record(record(await graphql(teacherToken, query)).data)
      .teacherAiAvailability !== undefined,
    true,
  );
  const conversation = await create();
  for (const operation of [
    `query { teacherAiConversation(id: "${conversation.id}") { id } }`,
    `mutation { archiveTeacherAiConversation(id: "${conversation.id}") { id } }`,
    `mutation { renameTeacherAiConversation(input: {conversationId: "${conversation.id}", title: "Other"}) { id } }`,
  ])
    assert.equal(errorCode(await graphql(otherToken, operation)), 'NOT_FOUND');
  await db.user.update({
    where: { id: teacherId },
    data: { status: UserStatus.INACTIVE },
  });
  assert.equal(
    errorCode(await graphql(teacherToken, query)),
    'UNAUTHENTICATED',
  );
});

void test('disabled and non-pilot Teachers cannot create or dispatch', async () => {
  process.env.TEACHER_AI_CHAT_ENABLED = 'false';
  assert.equal((await store.availability(teacherId)).available, false);
  await assert.rejects(
    create(),
    (error: unknown) =>
      error instanceof AiChatFault && error.code === 'SERVICE_UNAVAILABLE',
  );
  configure();
  process.env.AI_CHAT_PILOT_TEACHER_IDS = otherId;
  await assert.rejects(create(), AiChatFault);
});

void test('consent, explicit notice version and idempotent creation persist correctly', async () => {
  await assert.rejects(store.create(teacherId, randomUUID(), 'test-v1', false));
  await assert.rejects(store.create(teacherId, randomUUID(), 'stale', true));
  const id = randomUUID();
  const items = await Promise.all([
    store.create(teacherId, id, 'test-v1', true),
    store.create(teacherId, id, 'test-v1', true),
  ]);
  assert.equal(items[0].id, items[1].id);
  assert.equal(await db.aiConversation.count(), 1);
  assert.equal(
    await db.auditLog.count({
      where: { action: 'AI_CONVERSATION_CREATED', targetId: id },
    }),
    1,
  );
});

void test('duplicate network sends persist one user message, run and outbox event', async () => {
  const conversation = await create();
  const key = randomUUID();
  const runs = await Promise.all([
    store.send(teacherId, conversation.id, 'Explain articles.', key),
    store.send(teacherId, conversation.id, 'Explain articles.', key),
  ]);
  assert.equal(runs[0].id, runs[1].id);
  assert.equal(await db.aiMessage.count(), 1);
  assert.equal(await db.aiChatRun.count(), 1);
  assert.equal(
    await db.outboxEvent.count({
      where: {
        eventType: OutboxEventType.TEACHER_AI_CHAT_REQUESTED_V1,
        aggregateId: runs[0].id,
      },
    }),
    1,
  );
  await assert.rejects(
    store.send(teacherId, conversation.id, 'Different payload', key),
  );
});

void test('concurrent sends and Teacher quotas cannot bypass reservations', async () => {
  const first = await create();
  const second = await create();
  const results = await Promise.allSettled([send(first.id), send(second.id)]);
  assert.equal(
    results.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  const active = await db.aiChatRun.findFirstOrThrow();
  await store.cancel(teacherId, active.id);
  process.env.AI_CHAT_TEACHER_DAILY_REQUEST_LIMIT = '1';
  await assert.rejects(
    send(second.id),
    (error: unknown) =>
      error instanceof AiChatFault && error.code === 'RATE_LIMITED',
  );
});

void test('completion, refresh and history pagination preserve ordered durable messages', async () => {
  const conversation = await create();
  const run = await send(conversation.id);
  const claim = await store.claim(run.id);
  assert.ok(claim);
  assert.equal(await store.beginDispatch(run.id, claim.leaseToken), true);
  await store.complete(run.id, claim.leaseToken, answer);
  await store.complete(run.id, claim.leaseToken, answer);
  const page = await store.detail(teacherId, conversation.id, 1);
  assert.equal(page.messages.length, 1);
  assert.equal(page.messages[0]?.kind, AiMessageKind.ASSISTANT);
  assert.equal(page.hasOlder, true);
  assert.ok(page.olderCursor);
  const older = await store.detail(
    teacherId,
    conversation.id,
    1,
    page.olderCursor,
  );
  assert.equal(older.messages[0]?.kind, AiMessageKind.USER);
  assert.equal(page.latestRun?.status, AiChatRunStatus.SUCCEEDED);
  assert.equal(await db.aiMessage.count(), 2);
  const freshStore = new TeacherAiStore(db, () =>
    parseTeacherAiEnvironment(process.env),
  );
  assert.equal(
    (await freshStore.detail(teacherId, conversation.id)).messages.length,
    2,
  );
});

void test('cancel and archive races cannot resurrect an assistant reply', async () => {
  for (const action of ['cancel', 'archive']) {
    const conversation = await create();
    const run = await send(conversation.id);
    const claim = await store.claim(run.id);
    assert.ok(claim);
    assert.equal(await store.beginDispatch(run.id, claim.leaseToken), true);
    if (action === 'cancel') await store.cancel(teacherId, run.id);
    else await store.archive(teacherId, conversation.id);
    await store.complete(run.id, claim.leaseToken, answer);
    assert.equal(
      (await store.detail(teacherId, conversation.id)).messages.length,
      1,
    );
    assert.equal(
      (await store.run(teacherId, run.id)).status,
      AiChatRunStatus.CANCELLED,
    );
  }
});

void test('explicit retry preserves the original message and ambiguous outcomes cannot retry', async () => {
  const conversation = await create();
  const run = await send(conversation.id);
  const claim = await store.claim(run.id);
  assert.ok(claim);
  await store.fail(
    run.id,
    claim.leaseToken,
    'SERVICE_UNAVAILABLE',
    false,
    true,
  );
  const retry = await store.retry(teacherId, run.id, randomUUID());
  assert.equal(retry.triggerMessageId, run.triggerMessageId);
  assert.equal(await db.aiMessage.count(), 1);
  const next = await store.claim(retry.id);
  assert.ok(next);
  await store.beginDispatch(retry.id, next.leaseToken);
  await store.fail(retry.id, next.leaseToken, 'AMBIGUOUS', true, false);
  await assert.rejects(store.retry(teacherId, retry.id, randomUUID()));
});

void test('expired lease recovery never redispatches a possibly completed provider call', async () => {
  const conversation = await create();
  const run = await send(conversation.id);
  const claim = await store.claim(run.id);
  assert.ok(claim);
  await store.beginDispatch(run.id, claim.leaseToken);
  await db.aiChatRun.update({
    where: { id: run.id },
    data: { leaseExpiresAt: new Date(0) },
  });
  await store.maintain();
  const recovered = await store.run(teacherId, run.id);
  assert.equal(recovered.safeErrorCode, 'AMBIGUOUS');
  assert.equal(recovered.retryable, false);
  assert.equal(await store.claim(run.id), null);
  assert.equal(
    (await db.aiProviderCall.findUniqueOrThrow({ where: { runId: run.id } }))
      .status,
    AiProviderCallStatus.AMBIGUOUS,
  );
});

void test('revoked role and changed consent policy are rechecked before dispatch', async () => {
  const conversation = await create();
  const run = await send(conversation.id);
  const claim = await store.claim(run.id);
  assert.ok(claim);
  process.env.AI_CHAT_PROCESSING_NOTICE_VERSION = 'test-v2';
  assert.equal(await store.beginDispatch(run.id, claim.leaseToken), false);
  assert.equal(await db.aiProviderCall.count(), 0);
});

void test('retention removes content and prevents late completion after erasure', async () => {
  const conversation = await create();
  const run = await send(conversation.id);
  const claim = await store.claim(run.id);
  assert.ok(claim);
  await store.beginDispatch(run.id, claim.leaseToken);
  await db.aiConversation.update({
    where: { id: conversation.id },
    data: { createdAt: new Date(0), expiresAt: new Date(1) },
  });
  await assert.rejects(store.detail(teacherId, conversation.id));
  await store.maintain();
  await store.complete(run.id, claim.leaseToken, answer);
  assert.equal(await db.aiMessage.count(), 0);
  assert.equal(await db.aiChatRun.count(), 0);
  assert.equal(await db.aiProviderCall.count(), 0);
});

void test('rename and archive history support stable pagination and owner-scoped cursors', async () => {
  const first = await create();
  const second = await create();
  await store.rename(teacherId, first.id, 'Articles lesson');
  const page = await store.list(teacherId, 1);
  assert.equal(page.hasMore, true);
  assert.ok(page.cursor);
  const next = await store.list(teacherId, 1, page.cursor);
  assert.notEqual(next.items[0]?.id, page.items[0]?.id);
  await store.archive(teacherId, second.id);
  assert.equal(
    (await store.list(teacherId, 20, undefined, true)).items[0]?.id,
    second.id,
  );
  await assert.rejects(store.list(otherId, 1, page.cursor));
});

async function startWorker() {
  const transport: typeof fetch = (request) => {
    const requestUrl =
      typeof request === 'string'
        ? request
        : request instanceof URL
          ? request.href
          : request.url;
    if (requestUrl.endsWith('/endpoints/zdr'))
      return Promise.resolve(
        Response.json({
          data: [
            {
              model_id: 'fictional/teacher:free',
              tag: 'fictional/eu',
              safety_retention: false,
              status: 0,
            },
          ],
        }),
      );
    if (requestUrl.endsWith('/models'))
      return Promise.resolve(
        Response.json({
          data: [
            {
              id: 'fictional/teacher:free',
              context_length: 8192,
              pricing: { prompt: '0', completion: '0' },
            },
          ],
        }),
      );
    calls++;
    if (mode === 'timeout')
      return Promise.reject(new Error('fictional timeout'));
    if (mode === '429')
      return Promise.resolve(new Response('{}', { status: 429 }));
    return Promise.resolve(
      Response.json({
        id: 'fictional-live-test',
        model: 'fictional/teacher:free',
        choices: [
          {
            finish_reason: 'stop',
            message: { role: 'assistant', content: answer.text },
          },
        ],
        usage: { prompt_tokens: 60, completion_tokens: 20, cost: 0 },
      }),
    );
  };
  worker = await Test.createTestingModule({ imports: [AssistantWorkerModule] })
    .overrideProvider(OpenRouterChatGateway)
    .useValue(new OpenRouterChatGateway(transport))
    .compile();
  worker.useLogger(false);
  await worker.init();
  queue = worker.get<Queue>(getQueueToken('ai-chat'));
}
async function terminal(runId: string) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const run = await store.run(teacherId, runId);
    if (
      run.status !== AiChatRunStatus.QUEUED &&
      run.status !== AiChatRunStatus.RUNNING
    )
      return run;
    await new Promise<void>((resolvePromise) =>
      setTimeout(resolvePromise, 100),
    );
  }
  throw new Error('Worker did not reach terminal state');
}

void test('end-to-end GraphQL -> PostgreSQL outbox -> Redis worker -> persisted response', async () => {
  await startWorker();
  const created = await graphql(
    teacherToken,
    'mutation($input:CreateTeacherAiConversationInput!){createTeacherAiConversation(input:$input){id}}',
    { input: { id: randomUUID(), noticeVersion: 'test-v1', consent: true } },
  );
  const id = record(record(created.data).createTeacherAiConversation).id;
  assert.equal(typeof id, 'string');
  const sent = await graphql(
    teacherToken,
    'mutation($input:SendTeacherAiMessageInput!){sendTeacherAiMessage(input:$input){id status}}',
    {
      input: {
        conversationId: id,
        text: 'Explain articles.',
        idempotencyKey: randomUUID(),
      },
    },
  );
  const runId = record(record(sent.data).sendTeacherAiMessage).id;
  assert.ok(typeof runId === 'string');
  assert.equal((await terminal(runId)).status, AiChatRunStatus.SUCCEEDED);
  assert.equal(calls, 1);
  const detail = await graphql(
    teacherToken,
    'query($id:ID!){teacherAiConversation(id:$id){messages{kind content}}}',
    { id },
  );
  const messages = record(record(detail.data).teacherAiConversation).messages;
  assert.ok(Array.isArray(messages));
  assert.equal(messages.length, 2);
  await queue.add(
    'redelivery',
    { version: 1, runId },
    { jobId: randomUUID(), removeOnComplete: true },
  );
  await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 300));
  assert.equal(calls, 1);
  await queue.obliterate({ force: true });
});

void test('real queue preserves 429 and ambiguous failure states without inference retries', async () => {
  await startWorker();
  for (const selectedMode of ['429', 'timeout'] as const) {
    mode = selectedMode;
    const conversation = await create();
    const run = await send(conversation.id);
    const result = await terminal(run.id);
    assert.equal(result.status, AiChatRunStatus.FAILED);
    assert.equal(
      result.safeErrorCode,
      selectedMode === '429' ? 'RATE_LIMITED' : 'AMBIGUOUS',
    );
    assert.equal(result.retryable, selectedMode === '429');
  }
  assert.equal(calls, 2);
  await queue.obliterate({ force: true });
});

void test('unexpected cost freezes dispatch even after conversation retention purge', async () => {
  const conversation = await create();
  const run = await send(conversation.id);
  const claim = await store.claim(run.id);
  assert.ok(claim);
  await store.beginDispatch(run.id, claim.leaseToken);
  await store.complete(run.id, claim.leaseToken, {
    ...answer,
    cost: '0.000000001',
  });
  assert.equal((await store.availability(teacherId)).available, false);
  assert.equal(
    (await store.detail(teacherId, conversation.id)).messages.length,
    1,
  );
  await db.aiConversation.update({
    where: { id: conversation.id },
    data: { createdAt: new Date(0), expiresAt: new Date(1) },
  });
  await store.maintain();
  assert.equal(await db.aiProviderCall.count(), 0);
  assert.equal((await store.availability(teacherId)).available, false);
  const next = await create();
  await assert.rejects(
    send(next.id),
    (error: unknown) =>
      error instanceof AiChatFault && error.code === 'SERVICE_UNAVAILABLE',
  );
});

void test('retention cannot refund same-day quota', async () => {
  const conversation = await create();
  const run = await send(conversation.id);
  await store.cancel(teacherId, run.id);
  await db.aiConversation.update({
    where: { id: conversation.id },
    data: { createdAt: new Date(0), expiresAt: new Date(1) },
  });
  await store.maintain();
  process.env.AI_CHAT_TEACHER_DAILY_REQUEST_LIMIT = '1';
  const next = await create();
  await assert.rejects(
    send(next.id),
    (error: unknown) =>
      error instanceof AiChatFault && error.code === 'RATE_LIMITED',
  );
});

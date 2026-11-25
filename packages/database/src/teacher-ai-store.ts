import { randomUUID } from 'node:crypto';
import {
  AiChatFault,
  AiChatValidationError,
  boundAiChatHistory,
  deriveAiChatTitle,
  parseAiChatIdempotencyKey,
  parseAiChatText,
  type AiChatCompletion,
  type AiChatHistoryMessage,
} from '@best/ai-chat';
import type { TeacherAiEnvironment } from '@best/config';
import type { DatabaseClient } from './database-client';
import { Prisma } from './generated/client';
import {
  AiChatRunStatus,
  AiMessageKind,
  AiProviderCallStatus,
  OutboxEventType,
  UserRole,
  UserStatus,
} from './generated/enums';

type EnabledEnvironment = Extract<TeacherAiEnvironment, { enabled: true }>;
type Transaction = Prisma.TransactionClient;
const ACTIVE: AiChatRunStatus[] = [
  AiChatRunStatus.QUEUED,
  AiChatRunStatus.RUNNING,
];
const LOCK_ID = 74011201;

export class TeacherAiStore {
  constructor(
    private readonly db: DatabaseClient,
    private readonly environment: () => TeacherAiEnvironment,
  ) {}

  private async transaction<T>(
    action: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(${LOCK_ID})::text`;
          return action(tx);
        },
        { timeout: 15_000 },
      );
    } catch (error) {
      if (error instanceof AiChatValidationError)
        throw new AiChatFault('BAD_USER_INPUT');
      throw error;
    }
  }

  private async actor(tx: Transaction, actorId: string): Promise<void> {
    const actor = await tx.user.findUnique({
      where: { id: actorId },
      select: { role: true, status: true },
    });
    if (actor?.role !== UserRole.TEACHER || actor.status !== UserStatus.ACTIVE)
      throw new AiChatFault('FORBIDDEN');
  }

  private config(actorId: string): EnabledEnvironment {
    const config = this.environment();
    if (!config.enabled || !config.pilotTeacherIds.includes(actorId))
      throw new AiChatFault('SERVICE_UNAVAILABLE');
    return config;
  }

  private async conversation(
    tx: Transaction,
    actorId: string,
    conversationId: string,
    writable = false,
  ) {
    const item = await tx.aiConversation.findFirst({
      where: {
        id: uuid(conversationId),
        ownerId: actorId,
        expiresAt: { gt: new Date() },
      },
    });
    if (!item) throw new AiChatFault('NOT_FOUND');
    if (writable && item.archivedAt) throw new AiChatFault('CONFLICT');
    return item;
  }

  async availability(actorId: string) {
    await this.actor(this.db, actorId);
    const config = this.environment();
    const available =
      config.enabled &&
      config.pilotTeacherIds.includes(actorId) &&
      !(await this.costPolicyStopped(this.db));
    return {
      available,
      maxInputCharacters: config.enabled ? config.maxInputCharacters : 4000,
      retentionDays: config.enabled ? config.retentionDays : 7,
      noticeVersion: config.enabled ? config.processingNoticeVersion : null,
      model: config.enabled ? config.model : null,
    };
  }

  async list(actorId: string, first = 20, after?: string, archived = false) {
    await this.actor(this.db, actorId);
    const take = pageSize(first);
    const cursor = after
      ? await this.conversation(this.db, actorId, cursorId(after))
      : null;
    if (cursor && Boolean(cursor.archivedAt) !== archived)
      throw new AiChatFault('BAD_USER_INPUT');
    const items = await this.db.aiConversation.findMany({
      where: {
        ownerId: actorId,
        expiresAt: { gt: new Date() },
        archivedAt: archived ? { not: null } : null,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });
    const page = items.slice(0, take);
    const last = page.at(-1);
    return {
      items: page,
      hasMore: items.length > take,
      cursor: last ? encodeCursor(last.id) : null,
    };
  }

  async detail(
    actorId: string,
    conversationId: string,
    first = 30,
    before?: string,
  ) {
    await this.actor(this.db, actorId);
    const conversation = await this.conversation(
      this.db,
      actorId,
      conversationId,
    );
    const take = pageSize(first);
    const cursor = before
      ? await this.db.aiMessage.findFirst({
          where: { id: cursorId(before), conversationId: conversation.id },
        })
      : null;
    if (before && !cursor) throw new AiChatFault('BAD_USER_INPUT');
    const [messages, latestRun] = await Promise.all([
      this.db.aiMessage.findMany({
        where: {
          conversationId: conversation.id,
          ...(cursor ? { sequence: { lt: cursor.sequence } } : {}),
        },
        orderBy: { sequence: 'desc' },
        take: take + 1,
      }),
      this.db.aiChatRun.findFirst({
        where: { conversationId: conversation.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    ]);
    const page = messages.slice(0, take).reverse();
    return {
      ...conversation,
      messages: page,
      latestRun,
      hasOlder: messages.length > take,
      olderCursor: page[0] ? encodeCursor(page[0].id) : null,
    };
  }

  async run(actorId: string, runId: string) {
    await this.actor(this.db, actorId);
    const run = await this.db.aiChatRun.findFirst({
      where: {
        id: uuid(runId),
        requesterId: actorId,
        conversation: { expiresAt: { gt: new Date() } },
      },
    });
    if (!run) throw new AiChatFault('NOT_FOUND');
    return run;
  }

  async create(
    actorId: string,
    conversationId: string,
    noticeVersion: string,
    consent: boolean,
  ) {
    return this.transaction(async (tx) => {
      await this.actor(tx, actorId);
      const config = this.config(actorId);
      if (!consent || noticeVersion !== config.processingNoticeVersion)
        throw new AiChatFault('BAD_USER_INPUT');
      const id = uuid(conversationId);
      const existing = await tx.aiConversation.findUnique({ where: { id } });
      if (existing) {
        if (existing.ownerId !== actorId) throw new AiChatFault('NOT_FOUND');
        if (existing.expiresAt <= new Date() || existing.archivedAt)
          throw new AiChatFault('CONFLICT');
        return existing;
      }
      if (
        (await tx.aiConversation.count({
          where: { ownerId: actorId, expiresAt: { gt: new Date() } },
        })) >= 50
      )
        throw new AiChatFault('RATE_LIMITED');
      const item = await tx.aiConversation.create({
        data: {
          id,
          ownerId: actorId,
          noticeVersion,
          expiresAt: new Date(Date.now() + config.retentionDays * 86_400_000),
        },
      });
      await audit(tx, actorId, 'AI_CONVERSATION_CREATED', id);
      return item;
    });
  }

  private async reserve(
    tx: Transaction,
    actorId: string,
    config: EnabledEnvironment,
  ) {
    const now = new Date();
    const day = utcDay(now);
    const minute = new Date(now.getTime() - 60_000);
    const [daily, teacherDaily, minuteCount, active, billed] =
      await Promise.all([
        tx.auditLog.count({
          where: {
            targetType: 'TeacherAi',
            action: 'AI_MESSAGE_ACCEPTED',
            createdAt: { gte: day },
          },
        }),
        tx.auditLog.count({
          where: {
            targetType: 'TeacherAi',
            action: 'AI_MESSAGE_ACCEPTED',
            actorId,
            createdAt: { gte: day },
          },
        }),
        tx.auditLog.count({
          where: {
            targetType: 'TeacherAi',
            action: 'AI_MESSAGE_ACCEPTED',
            createdAt: { gte: minute },
          },
        }),
        tx.aiChatRun.count({
          where: { requesterId: actorId, status: { in: ACTIVE } },
        }),
        this.costPolicyStopped(tx),
      ]);
    if (billed) throw new AiChatFault('SERVICE_UNAVAILABLE');
    if (active) throw new AiChatFault('CONFLICT');
    if (
      daily >= config.dailyRequestLimit ||
      teacherDaily >= config.teacherDailyRequestLimit ||
      minuteCount >= config.requestsPerMinute
    )
      throw new AiChatFault('RATE_LIMITED');
  }

  async send(
    actorId: string,
    conversationId: string,
    text: string,
    idempotencyKey: string,
  ) {
    return this.transaction(async (tx) => {
      await this.actor(tx, actorId);
      const config = this.config(actorId);
      const conversation = await this.conversation(
        tx,
        actorId,
        conversationId,
        true,
      );
      if (conversation.noticeVersion !== config.processingNoticeVersion)
        throw new AiChatFault('CONFLICT');
      const content = parseAiChatText(text, config.maxInputCharacters);
      boundAiChatHistory(
        [{ role: 'user', content }],
        config.maxContextTokens,
        config.maxOutputTokens,
      );
      const key = parseAiChatIdempotencyKey(idempotencyKey);
      const existing = await tx.aiChatRun.findUnique({
        where: {
          requesterId_idempotencyKey: {
            requesterId: actorId,
            idempotencyKey: key,
          },
        },
        include: { triggerMessage: true },
      });
      if (existing) {
        if (
          existing.conversationId !== conversation.id ||
          existing.triggerMessage.content !== content
        )
          throw new AiChatFault('CONFLICT');
        return existing;
      }
      await this.reserve(tx, actorId, config);
      const message = await tx.aiMessage.create({
        data: {
          conversationId: conversation.id,
          sequence: conversation.nextSequence,
          kind: AiMessageKind.USER,
          content,
        },
      });
      await tx.aiConversation.update({
        where: { id: conversation.id },
        data: {
          nextSequence: { increment: 1 },
          ...(conversation.nextSequence === 1
            ? { title: deriveAiChatTitle(content) }
            : {}),
        },
      });
      return this.enqueue(
        tx,
        actorId,
        conversation.id,
        message.id,
        message.sequence,
        key,
        config,
      );
    });
  }

  private async enqueue(
    tx: Transaction,
    actorId: string,
    conversationId: string,
    messageId: string,
    sequence: number,
    key: string,
    config: EnabledEnvironment,
  ) {
    const previous = await tx.aiChatRun.findFirst({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const createdAt = new Date(
      Math.max(Date.now(), (previous?.createdAt.getTime() ?? 0) + 1),
    );
    const run = await tx.aiChatRun.create({
      data: {
        conversationId,
        requesterId: actorId,
        triggerMessageId: messageId,
        frozenThroughSequence: sequence,
        idempotencyKey: key,
        model: config.model,
        providerEndpoint: config.providerEndpoint,
        createdAt,
      },
    });
    await tx.outboxEvent.create({
      data: {
        eventType: OutboxEventType.TEACHER_AI_CHAT_REQUESTED_V1,
        aggregateId: run.id,
        payload: { version: 1, runId: run.id },
      },
    });
    await audit(tx, actorId, 'AI_MESSAGE_ACCEPTED', run.id);
    return run;
  }

  async retry(actorId: string, runId: string, idempotencyKey: string) {
    return this.transaction(async (tx) => {
      await this.actor(tx, actorId);
      const config = this.config(actorId);
      const original = await tx.aiChatRun.findFirst({
        where: { id: uuid(runId), requesterId: actorId },
      });
      if (!original) throw new AiChatFault('NOT_FOUND');
      const conversation = await this.conversation(
        tx,
        actorId,
        original.conversationId,
        true,
      );
      const key = parseAiChatIdempotencyKey(idempotencyKey);
      const duplicate = await tx.aiChatRun.findUnique({
        where: {
          requesterId_idempotencyKey: {
            requesterId: actorId,
            idempotencyKey: key,
          },
        },
      });
      if (duplicate) {
        if (duplicate.triggerMessageId !== original.triggerMessageId)
          throw new AiChatFault('CONFLICT');
        return duplicate;
      }
      if (
        original.status !== AiChatRunStatus.FAILED ||
        !original.retryable ||
        conversation.nextSequence !== original.frozenThroughSequence + 1 ||
        conversation.noticeVersion !== config.processingNoticeVersion
      )
        throw new AiChatFault('CONFLICT');
      const successor = await tx.aiChatRun.findFirst({
        where: {
          triggerMessageId: original.triggerMessageId,
          createdAt: { gt: original.createdAt },
        },
      });
      if (successor) throw new AiChatFault('CONFLICT');
      await this.reserve(tx, actorId, config);
      return this.enqueue(
        tx,
        actorId,
        original.conversationId,
        original.triggerMessageId,
        original.frozenThroughSequence,
        key,
        config,
      );
    });
  }

  async cancel(actorId: string, runId: string) {
    return this.transaction(async (tx) => {
      await this.actor(tx, actorId);
      const run = await tx.aiChatRun.findFirst({
        where: { id: uuid(runId), requesterId: actorId },
      });
      if (!run) throw new AiChatFault('NOT_FOUND');
      await this.conversation(tx, actorId, run.conversationId);
      if (!ACTIVE.includes(run.status)) return run;
      const result = await tx.aiChatRun.update({
        where: { id: run.id },
        data: {
          status: AiChatRunStatus.CANCELLED,
          completedAt: new Date(),
          retryable: false,
        },
      });
      await audit(tx, actorId, 'AI_RUN_CANCELLED', run.id);
      return result;
    });
  }

  async rename(actorId: string, conversationId: string, title: string) {
    return this.transaction(async (tx) => {
      await this.actor(tx, actorId);
      const conversation = await this.conversation(
        tx,
        actorId,
        conversationId,
        true,
      );
      return tx.aiConversation.update({
        where: { id: conversation.id },
        data: { title: parseAiChatText(title, 80).replace(/\s+/gu, ' ') },
      });
    });
  }

  async archive(actorId: string, conversationId: string) {
    return this.transaction(async (tx) => {
      await this.actor(tx, actorId);
      const conversation = await this.conversation(tx, actorId, conversationId);
      if (conversation.archivedAt) return conversation;
      await tx.aiChatRun.updateMany({
        where: { conversationId: conversation.id, status: { in: ACTIVE } },
        data: {
          status: AiChatRunStatus.CANCELLED,
          completedAt: new Date(),
          retryable: false,
        },
      });
      const result = await tx.aiConversation.update({
        where: { id: conversation.id },
        data: { archivedAt: new Date() },
      });
      await audit(tx, actorId, 'AI_CONVERSATION_ARCHIVED', conversation.id);
      return result;
    });
  }

  async claim(runId: string) {
    return this.transaction(async (tx) => {
      const run = await tx.aiChatRun.findUnique({
        where: { id: runId },
        include: { conversation: true },
      });
      if (run?.status !== AiChatRunStatus.QUEUED) return null;
      try {
        await this.actor(tx, run.requesterId);
        const config = this.config(run.requesterId);
        if (
          run.conversation.archivedAt ||
          run.conversation.expiresAt <= new Date() ||
          run.conversation.noticeVersion !== config.processingNoticeVersion ||
          run.model !== config.model ||
          run.providerEndpoint !== config.providerEndpoint
        )
          throw new AiChatFault('SERVICE_UNAVAILABLE');
        if (await this.costPolicyStopped(tx))
          throw new AiChatFault('SERVICE_UNAVAILABLE');
        // At most configured concurrency across all worker processes and cancelled
        // but still in-flight calls, not merely a local BullMQ worker limit.
        const running = await tx.aiChatRun.count({
          where: { status: AiChatRunStatus.RUNNING },
        });
        const inFlight = await tx.aiProviderCall.count({
          where: { status: AiProviderCallStatus.DISPATCHED },
        });
        if (Math.max(running, inFlight) >= config.concurrency) return null;
        const leaseToken = randomUUID();
        await tx.aiChatRun.update({
          where: { id: run.id },
          data: {
            status: AiChatRunStatus.RUNNING,
            leaseToken,
            leaseExpiresAt: new Date(
              Date.now() + config.timeoutMilliseconds + 30_000,
            ),
          },
        });
        const records = await tx.aiMessage.findMany({
          where: {
            conversationId: run.conversationId,
            sequence: { lte: run.frozenThroughSequence },
          },
          orderBy: { sequence: 'desc' },
          take: 40,
        });
        const history: AiChatHistoryMessage[] = records
          .reverse()
          .map((message) => ({
            role: message.kind === AiMessageKind.USER ? 'user' : 'assistant',
            content: message.content,
          }));
        const messages = boundAiChatHistory(
          history,
          config.maxContextTokens,
          config.maxOutputTokens,
        );
        return { run, leaseToken, messages, config };
      } catch (error) {
        if (!(error instanceof AiChatFault)) throw error;
        await tx.aiChatRun.update({
          where: { id: run.id },
          data: {
            status: AiChatRunStatus.FAILED,
            completedAt: new Date(),
            safeErrorCode: error.code,
            retryable: error.code === 'SERVICE_UNAVAILABLE',
          },
        });
        return null;
      }
    });
  }

  async beginDispatch(runId: string, leaseToken: string): Promise<boolean> {
    return this.transaction(async (tx) => {
      const run = await tx.aiChatRun.findUnique({
        where: { id: runId },
        include: { conversation: true },
      });
      if (
        run?.status !== AiChatRunStatus.RUNNING ||
        run.leaseToken !== leaseToken ||
        !run.leaseExpiresAt ||
        run.leaseExpiresAt <= new Date()
      )
        return false;
      try {
        await this.actor(tx, run.requesterId);
        const config = this.config(run.requesterId);
        if (
          run.conversation.archivedAt ||
          run.conversation.expiresAt <= new Date() ||
          run.conversation.noticeVersion !== config.processingNoticeVersion ||
          config.model !== run.model ||
          config.providerEndpoint !== run.providerEndpoint
        )
          throw new AiChatFault('SERVICE_UNAVAILABLE');
        const day = utcDay(new Date());
        const [globalCount, teacherCount, minuteCount, billed] =
          await Promise.all([
            tx.auditLog.count({
              where: {
                targetType: 'TeacherAi',
                action: 'AI_PROVIDER_DISPATCHED',
                createdAt: { gte: day },
              },
            }),
            tx.auditLog.count({
              where: {
                targetType: 'TeacherAi',
                action: 'AI_PROVIDER_DISPATCHED',
                actorId: run.requesterId,
                createdAt: { gte: day },
              },
            }),
            tx.auditLog.count({
              where: {
                targetType: 'TeacherAi',
                action: 'AI_PROVIDER_DISPATCHED',
                createdAt: { gte: new Date(Date.now() - 60_000) },
              },
            }),
            this.costPolicyStopped(tx),
          ]);
        if (billed) throw new AiChatFault('SERVICE_UNAVAILABLE');
        if (
          globalCount >= config.dailyRequestLimit ||
          teacherCount >= config.teacherDailyRequestLimit ||
          minuteCount >= config.requestsPerMinute
        )
          throw new AiChatFault('RATE_LIMITED');
        if (await tx.aiProviderCall.findUnique({ where: { runId } }))
          return false;
        await tx.aiProviderCall.create({ data: { runId } });
        await audit(tx, run.requesterId, 'AI_PROVIDER_DISPATCHED', runId);
        return true;
      } catch (error) {
        if (!(error instanceof AiChatFault)) throw error;
        await tx.aiChatRun.update({
          where: { id: runId },
          data: {
            status: AiChatRunStatus.FAILED,
            completedAt: new Date(),
            safeErrorCode: error.code,
            retryable: true,
          },
        });
        return false;
      }
    });
  }

  async complete(
    runId: string,
    leaseToken: string,
    response: AiChatCompletion,
  ): Promise<void> {
    await this.transaction(async (tx) => {
      const run = await tx.aiChatRun.findUnique({
        where: { id: runId },
        include: { conversation: { include: { owner: true } } },
      });
      if (
        new Prisma.Decimal(response.cost).gt(0) &&
        !(await this.costPolicyStopped(tx))
      )
        await tx.auditLog.create({
          data: {
            actorId: run?.requesterId ?? null,
            action: 'AI_COST_POLICY_VIOLATION',
            targetType: 'TeacherAi',
            targetId: runId,
          },
        });
      if (run?.leaseToken !== leaseToken) return;
      await tx.aiProviderCall.updateMany({
        where: { runId },
        data: {
          status: AiProviderCallStatus.COMPLETED,
          providerRequestId: response.requestId,
          reportedModel: response.model,
          reportedProvider: response.provider,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          actualUsd: response.cost,
          completedAt: new Date(),
        },
      });
      if (run.status !== AiChatRunStatus.RUNNING) return;
      const config = this.environment();
      const allowed =
        config.enabled &&
        config.pilotTeacherIds.includes(run.requesterId) &&
        run.conversation.noticeVersion === config.processingNoticeVersion &&
        run.conversation.owner.role === UserRole.TEACHER &&
        run.conversation.owner.status === UserStatus.ACTIVE &&
        !run.conversation.archivedAt &&
        run.conversation.expiresAt > new Date();
      if (!allowed || new Prisma.Decimal(response.cost).gt(0)) {
        await tx.aiChatRun.update({
          where: { id: runId },
          data: {
            status: AiChatRunStatus.CANCELLED,
            safeErrorCode: 'SERVICE_UNAVAILABLE',
            completedAt: new Date(),
          },
        });
        return;
      }
      await tx.aiMessage.create({
        data: {
          conversationId: run.conversationId,
          sequence: run.conversation.nextSequence,
          kind: AiMessageKind.ASSISTANT,
          content: response.text,
          responseRunId: run.id,
        },
      });
      await tx.aiConversation.update({
        where: { id: run.conversationId },
        data: { nextSequence: { increment: 1 } },
      });
      await tx.aiChatRun.update({
        where: { id: runId },
        data: { status: AiChatRunStatus.SUCCEEDED, completedAt: new Date() },
      });
      await audit(tx, run.requesterId, 'AI_RUN_SUCCEEDED', runId);
    });
  }

  async fail(
    runId: string,
    leaseToken: string,
    code: string,
    ambiguous: boolean,
    retryable: boolean,
  ): Promise<void> {
    await this.transaction(async (tx) => {
      const run = await tx.aiChatRun.findUnique({ where: { id: runId } });
      if (run?.leaseToken !== leaseToken) return;
      await tx.aiProviderCall.updateMany({
        where: { runId, status: AiProviderCallStatus.DISPATCHED },
        data: {
          status: ambiguous
            ? AiProviderCallStatus.AMBIGUOUS
            : AiProviderCallStatus.REJECTED,
          completedAt: new Date(),
        },
      });
      if (run.status !== AiChatRunStatus.RUNNING) return;
      await tx.aiChatRun.update({
        where: { id: runId },
        data: {
          status: AiChatRunStatus.FAILED,
          completedAt: new Date(),
          safeErrorCode: code,
          retryable: retryable && !ambiguous,
        },
      });
      await audit(tx, run.requesterId, 'AI_RUN_FAILED', runId);
    });
  }

  async maintain(): Promise<void> {
    await this.transaction(async (tx) => {
      const now = new Date();
      // No redispatch after a lost response, even if the BullMQ job is redelivered.
      const stale = await tx.aiChatRun.findMany({
        where: {
          status: { in: [AiChatRunStatus.RUNNING, AiChatRunStatus.CANCELLED] },
          leaseExpiresAt: { lt: now },
        },
        include: { calls: true },
        take: 100,
      });
      for (const run of stale) {
        await tx.aiProviderCall.updateMany({
          where: { runId: run.id, status: AiProviderCallStatus.DISPATCHED },
          data: { status: AiProviderCallStatus.AMBIGUOUS, completedAt: now },
        });
        if (run.status === AiChatRunStatus.RUNNING)
          await tx.aiChatRun.update({
            where: { id: run.id },
            data: {
              status: AiChatRunStatus.FAILED,
              completedAt: now,
              safeErrorCode: run.calls.length
                ? 'AMBIGUOUS'
                : 'SERVICE_UNAVAILABLE',
              retryable: run.calls.length === 0,
              leaseExpiresAt: null,
            },
          });
        else
          await tx.aiChatRun.update({
            where: { id: run.id },
            data: { leaseExpiresAt: null },
          });
      }
      const expired = await tx.aiConversation.findMany({
        where: { expiresAt: { lte: now } },
        select: { id: true, ownerId: true },
        take: 100,
      });
      for (const conversation of expired) {
        const runs = await tx.aiChatRun.findMany({
          where: { conversationId: conversation.id },
          select: { id: true },
        });
        // Outbox source rows are immutable and contain only opaque run IDs.
        await tx.outboxEvent.updateMany({
          where: {
            eventType: OutboxEventType.TEACHER_AI_CHAT_REQUESTED_V1,
            aggregateId: { in: runs.map((run) => run.id) },
            publishedAt: null,
          },
          data: { publishedAt: now, lastError: 'EXPIRED' },
        });
        await tx.aiConversation.delete({ where: { id: conversation.id } });
        await audit(
          tx,
          conversation.ownerId,
          'AI_CONVERSATION_EXPIRED',
          conversation.id,
        );
      }
    });
  }

  private async costPolicyStopped(tx: Transaction): Promise<boolean> {
    return Boolean(
      await tx.auditLog.findFirst({
        where: { targetType: 'TeacherAi', action: 'AI_COST_POLICY_VIOLATION' },
        select: { id: true },
      }),
    );
  }
}

function uuid(value: string): string {
  try {
    return parseAiChatIdempotencyKey(value);
  } catch {
    throw new AiChatFault('BAD_USER_INPUT');
  }
}
function pageSize(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 50)
    throw new AiChatFault('BAD_USER_INPUT');
  return value;
}
function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}
function cursorId(cursor: string): string {
  if (cursor.length > 100) throw new AiChatFault('BAD_USER_INPUT');
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  if (encodeCursor(decoded) !== cursor) throw new AiChatFault('BAD_USER_INPUT');
  return uuid(decoded);
}
function utcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}
async function audit(
  tx: Transaction,
  actorId: string,
  action: string,
  targetId: string,
): Promise<void> {
  await tx.auditLog.create({
    data: { actorId, action, targetType: 'TeacherAi', targetId },
  });
}

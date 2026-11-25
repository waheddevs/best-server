import { freeModelProviderPolicy, isPinnedFreeModel } from '@best/ai-chat';
import { EnvironmentValidationError } from './environment';

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export type TeacherAiEnvironment =
  | { readonly enabled: false }
  | {
      readonly enabled: true;
      readonly apiKey: string;
      readonly model: string;
      readonly providerEndpoint: string;
      readonly dailyBudgetUsd: '0';
      readonly pilotTeacherIds: readonly string[];
      readonly retentionDays: number;
      readonly processingNoticeVersion: string;
      readonly maxInputCharacters: number;
      readonly maxContextTokens: number;
      readonly maxOutputTokens: number;
      readonly timeoutMilliseconds: number;
      readonly concurrency: number;
      readonly dailyRequestLimit: number;
      readonly teacherDailyRequestLimit: number;
      readonly requestsPerMinute: number;
    };

export function parseTeacherAiEnvironment(
  source: EnvironmentSource,
): TeacherAiEnvironment {
  const flag = source.TEACHER_AI_CHAT_ENABLED?.trim().toLowerCase();
  if (flag === undefined || flag === '' || flag === 'false')
    return { enabled: false };
  if (flag !== 'true')
    fail('TEACHER_AI_CHAT_ENABLED', 'expected true or false');

  const budget = source.AI_CHAT_DAILY_BUDGET_USD?.trim() ?? '0';
  if (!/^0(?:\.0+)?$/.test(budget))
    fail('AI_CHAT_DAILY_BUDGET_USD', 'only zero is authorized');
  const model = required(source, 'AI_CHAT_MODEL');
  if (!isPinnedFreeModel(model))
    fail(
      'AI_CHAT_MODEL',
      'expected a pinned :free model; paid models and routers are disabled',
    );
  const providerEndpoint = required(source, 'AI_CHAT_PROVIDER_ENDPOINT');
  try {
    freeModelProviderPolicy(providerEndpoint);
  } catch {
    fail(
      'AI_CHAT_PROVIDER_ENDPOINT',
      'expected a reviewed provider slug, not a URL',
    );
  }
  if (source.AI_CHAT_PRIVACY_REVIEWED?.trim() !== 'true') {
    fail(
      'AI_CHAT_PRIVACY_REVIEWED',
      'requires endpoint review with per-request ZDR and denied data collection',
    );
  }
  const pilotTeacherIds = required(source, 'AI_CHAT_PILOT_TEACHER_IDS')
    .split(',')
    .map((id) => id.trim().toLowerCase());
  if (
    pilotTeacherIds.length > 10 ||
    pilotTeacherIds.some(
      (id) =>
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
          id,
        ),
    ) ||
    new Set(pilotTeacherIds).size !== pilotTeacherIds.length
  ) {
    fail(
      'AI_CHAT_PILOT_TEACHER_IDS',
      'expected 1 to 10 distinct Teacher UUIDs',
    );
  }
  const dailyRequestLimit = integer(
    source,
    'AI_CHAT_DAILY_REQUEST_LIMIT',
    1,
    50,
    40,
  );
  const teacherDailyRequestLimit = integer(
    source,
    'AI_CHAT_TEACHER_DAILY_REQUEST_LIMIT',
    1,
    50,
    10,
  );
  if (teacherDailyRequestLimit > dailyRequestLimit)
    fail(
      'AI_CHAT_TEACHER_DAILY_REQUEST_LIMIT',
      'must not exceed the global daily limit',
    );
  const maxContextTokens = integer(
    source,
    'AI_CHAT_MAX_CONTEXT_TOKENS',
    1_024,
    32_768,
    4_096,
  );
  const maxOutputTokens = integer(
    source,
    'AI_CHAT_MAX_OUTPUT_TOKENS',
    128,
    4_096,
    1_024,
  );
  if (maxOutputTokens >= maxContextTokens)
    fail(
      'AI_CHAT_MAX_OUTPUT_TOKENS',
      'must leave room for input within the context window',
    );

  return {
    enabled: true,
    apiKey: required(source, 'OPENROUTER_API_KEY'),
    model,
    providerEndpoint,
    dailyBudgetUsd: '0',
    pilotTeacherIds,
    retentionDays: integer(source, 'AI_CHAT_RETENTION_DAYS', 1, 90),
    processingNoticeVersion: required(
      source,
      'AI_CHAT_PROCESSING_NOTICE_VERSION',
    ),
    maxInputCharacters: integer(
      source,
      'AI_CHAT_MAX_INPUT_CHARACTERS',
      1,
      32_000,
      4_000,
    ),
    maxContextTokens,
    maxOutputTokens,
    timeoutMilliseconds: integer(
      source,
      'AI_CHAT_TIMEOUT_MS',
      1_000,
      120_000,
      60_000,
    ),
    concurrency: integer(source, 'AI_CHAT_CONCURRENCY', 1, 2, 1),
    dailyRequestLimit,
    teacherDailyRequestLimit,
    requestsPerMinute: integer(
      source,
      'AI_CHAT_REQUESTS_PER_MINUTE',
      1,
      20,
      10,
    ),
  };
}

function required(source: EnvironmentSource, key: string): string {
  const value = source[key]?.trim();
  if (
    value === undefined ||
    value === '' ||
    value.length > 512 ||
    /[\r\n\0]/.test(value)
  )
    fail(key, 'expected a bounded non-empty single-line value');
  return value;
}

function integer(
  source: EnvironmentSource,
  key: string,
  minimum: number,
  maximum: number,
  fallback?: number,
): number {
  const raw = source[key]?.trim();
  if ((raw === undefined || raw === '') && fallback !== undefined)
    return fallback;
  if (raw === undefined || !/^\d+$/.test(raw)) fail(key, 'expected an integer');
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    fail(
      key,
      `expected an integer from ${String(minimum)} to ${String(maximum)}`,
    );
  return value;
}

function fail(key: string, expectation: string): never {
  throw new EnvironmentValidationError(key, expectation);
}

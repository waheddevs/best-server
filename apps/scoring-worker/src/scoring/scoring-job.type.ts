import { SCORING_JOB_PAYLOAD_VERSION } from './scoring.constants';

export interface ScoreAttemptJobData {
  readonly attemptId: string;
  readonly correlationId?: string;
  readonly version: typeof SCORING_JOB_PAYLOAD_VERSION;
}

export function parseScoreAttemptJobData(value: unknown): ScoreAttemptJobData {
  if (!isRecord(value)) {
    throw new Error('Scoring job data must be an object');
  }

  const attemptId = value.attemptId;
  const correlationId = value.correlationId;
  const version = value.version;

  if (version !== SCORING_JOB_PAYLOAD_VERSION) {
    throw new Error('Unsupported scoring job payload version');
  }

  if (typeof attemptId !== 'string' || !isUuid(attemptId)) {
    throw new Error('Scoring job attemptId must be a UUID');
  }

  if (
    correlationId !== undefined &&
    (typeof correlationId !== 'string' ||
      correlationId.length === 0 ||
      correlationId.length > 120)
  ) {
    throw new Error('Scoring job correlationId is invalid');
  }

  return correlationId === undefined
    ? { attemptId, version }
    : { attemptId, correlationId, version };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

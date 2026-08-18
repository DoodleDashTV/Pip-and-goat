const SECRET_FIELD =
  /token|secret|authorization|credential|signedurl|uploadid|x-amz|cookie|password/i;
const SIGNED_URL = /X-Amz-|Signature=|AWSAccessKeyId=/i;

export type IntakeCountKey =
  | 'successful'
  | 'resumed'
  | 'duplicate'
  | 'failed'
  | 'quarantined'
  | 'inspectionReady'
  | 'cancelled'
  | 'paused';

export type IntakeLifecycleEvent = {
  event: string;
  correlationId: string;
  sessionId?: string;
  sourceId?: string;
  collectionId?: string;
  state?: string;
  counts?: Partial<Record<IntakeCountKey, number>>;
  at: string;
};

export function createCorrelationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `tj-${crypto.randomUUID()}`;
  }
  return `tj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function redactStructuredValue(value: unknown): unknown {
  if (typeof value === 'string') {
    if (SIGNED_URL.test(value)) return '[redacted-url]';
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(redactStructuredValue);
  }
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      next[key] = SECRET_FIELD.test(key) ? '[redacted]' : redactStructuredValue(nested);
    }
    return next;
  }
  return value;
}

export function buildIntakeLifecycleEvent(
  event: string,
  input: Omit<IntakeLifecycleEvent, 'event' | 'at' | 'correlationId'> & { correlationId?: string },
): IntakeLifecycleEvent {
  return {
    event,
    correlationId: input.correlationId ?? createCorrelationId(),
    sessionId: input.sessionId,
    sourceId: input.sourceId,
    collectionId: input.collectionId,
    state: input.state,
    counts: input.counts,
    at: new Date().toISOString(),
  };
}

export function emitIntakeLifecycleEvent(event: IntakeLifecycleEvent): IntakeLifecycleEvent {
  const redacted = redactStructuredValue(event) as IntakeLifecycleEvent;
  if (
    typeof console !== 'undefined' &&
    typeof console.info === 'function' &&
    process.env.NODE_ENV !== 'test' &&
    process.env.VITEST !== 'true'
  ) {
    console.info(JSON.stringify(redacted));
  }
  return redacted;
}

export function emptyIntakeCounts(): Record<IntakeCountKey, number> {
  return {
    successful: 0,
    resumed: 0,
    duplicate: 0,
    failed: 0,
    quarantined: 0,
    inspectionReady: 0,
    cancelled: 0,
    paused: 0,
  };
}

export function incrementIntakeCount(
  counts: Record<IntakeCountKey, number>,
  key: IntakeCountKey,
): Record<IntakeCountKey, number> {
  return { ...counts, [key]: counts[key] + 1 };
}

export function assertEventHasNoSecrets(event: unknown, secrets: readonly string[]): void {
  const serialized = JSON.stringify(event);
  for (const secret of secrets) {
    if (secret && serialized.includes(secret)) {
      throw new Error('Intake event would expose a secret.');
    }
  }
}

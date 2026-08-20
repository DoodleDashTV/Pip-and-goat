import { sha256Canonical } from './hash';
import { assertNoSecrets, sanitizeForPersistence } from './sanitizer';
import {
  EVENT_JOURNAL_SCHEMA,
  type ActorClass,
  type EntityType,
  type JournalEvent,
  type JournalEventType,
} from './types';

export function createJournalEvent(input: {
  workspaceId: string;
  entityType: EntityType;
  entityId: string;
  eventType: JournalEventType;
  previousRevision: number;
  nextRevision: number;
  dependencySha256: string;
  payload?: unknown;
  actorClass?: ActorClass;
  reason: string;
  timestamp?: string;
}): JournalEvent {
  const payload = sanitizeForPersistence((input.payload ?? {}) as Record<string, unknown>);
  assertNoSecrets(payload, 'journal payload');
  assertNoSecrets(input.reason, 'journal reason');
  const event: JournalEvent = {
    eventId: `evt_${input.workspaceId}_${input.nextRevision}_${input.eventType}`,
    workspaceId: input.workspaceId,
    entityType: input.entityType,
    entityId: input.entityId,
    eventType: input.eventType,
    previousRevision: input.previousRevision,
    nextRevision: input.nextRevision,
    dependencySha256: input.dependencySha256,
    payloadSha256: sha256Canonical(payload),
    payload,
    timestamp: input.timestamp ?? '1970-01-01T00:00:00.000Z',
    actorClass: input.actorClass ?? 'SYSTEM',
    reason: input.reason,
  };
  return event;
}

export function journalSchema(): typeof EVENT_JOURNAL_SCHEMA {
  return EVENT_JOURNAL_SCHEMA;
}

export function validateJournalSequence(events: JournalEvent[]): { ok: true } | { ok: false; reason: string } {
  const sorted = [...events].sort((left, right) => left.nextRevision - right.nextRevision);
  let expected = sorted[0]?.previousRevision ?? 0;
  const seen = new Set<string>();
  for (const event of sorted) {
    if (seen.has(event.eventId)) return { ok: false, reason: 'duplicate event' };
    seen.add(event.eventId);
    if (event.previousRevision !== expected) return { ok: false, reason: 'out-of-order revision' };
    if (event.nextRevision !== event.previousRevision + 1) return { ok: false, reason: 'out-of-order revision' };
    if (!/^[a-f0-9]{64}$/.test(event.payloadSha256)) return { ok: false, reason: 'corrupted payload hash' };
    if (event.payload && event.payloadSha256 !== sha256Canonical(event.payload)) {
      return { ok: false, reason: 'corrupted payload hash' };
    }
    expected = event.nextRevision;
  }
  return { ok: true };
}

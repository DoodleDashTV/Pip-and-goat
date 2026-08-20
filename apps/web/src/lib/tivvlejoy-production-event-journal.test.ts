import { describe, expect, it } from 'vitest';
import {
  EVENT_TYPES,
  SNAPSHOT_SCHEMA,
  createJournalEvent,
  createMemoryStore,
  journalSchema,
  replaySnapshot,
  sha256Canonical,
  validateJournalSequence,
  type JournalEvent,
  type ProductionSnapshot,
} from './tivvlejoy-production-persistence';

function emptySnapshot(workspaceId: string): ProductionSnapshot {
  const body = {
    schemaVersion: SNAPSHOT_SCHEMA,
    workspaceId,
    journalPosition: 0,
    revision: 0,
    records: [] as ProductionSnapshot['records'],
  };
  return { ...body, snapshotSha256: sha256Canonical(body) };
}

describe('production event journal and snapshots', () => {
  it('declares the journal schema', () => {
    expect(journalSchema()).toBe('TIVVLEJOY_PRODUCTION_EVENT_JOURNAL_V1');
  });

  it('includes the required event types', () => {
    expect(EVENT_TYPES).toContain('EPISODE_CREATED');
    expect(EVENT_TYPES).toContain('SCRIPT_VERSION_BOUND');
    expect(EVENT_TYPES).toContain('VOICE_RECEIPT_BOUND');
    expect(EVENT_TYPES).toContain('ASSET_RESOLUTION_BOUND');
    expect(EVENT_TYPES).toContain('CONTINUITY_FACT_ADDED');
    expect(EVENT_TYPES).toContain('SHOT_DEPENDENCY_CHANGED');
    expect(EVENT_TYPES).toContain('PRODUCTION_PACKET_COMPILED');
    expect(EVENT_TYPES).toContain('VISUAL_APPROVAL_RECORDED');
    expect(EVENT_TYPES).toContain('JOB_CHECKPOINT_WRITTEN');
    expect(EVENT_TYPES).toContain('QC_RECEIPT_RECORDED');
    expect(EVENT_TYPES).toContain('DELIVERY_PACKAGE_COMPILED');
  });

  it('creates events with every required field', () => {
    const event = createJournalEvent({
      workspaceId: 'ws_j',
      entityType: 'EPISODE',
      entityId: 'EP001',
      eventType: 'EPISODE_CREATED',
      previousRevision: 0,
      nextRevision: 1,
      dependencySha256: 'b'.repeat(64),
      reason: 'create episode',
    });
    expect(event.eventId).toContain('EPISODE_CREATED');
    expect(event.workspaceId).toBe('ws_j');
    expect(event.entityType).toBe('EPISODE');
    expect(event.entityId).toBe('EP001');
    expect(event.previousRevision).toBe(0);
    expect(event.nextRevision).toBe(1);
    expect(event.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(event.timestamp).toBe('1970-01-01T00:00:00.000Z');
    expect(event.actorClass).toBe('SYSTEM');
    expect(event.reason).toBe('create episode');
  });

  it('accepts a contiguous journal sequence', () => {
    const events = [0, 1, 2].map((revision) =>
      createJournalEvent({
        workspaceId: 'ws_j',
        entityType: 'EPISODE',
        entityId: `EP00${revision + 1}`,
        eventType: 'EPISODE_CREATED',
        previousRevision: revision,
        nextRevision: revision + 1,
        dependencySha256: 'c'.repeat(64),
        reason: 'ok',
      }),
    );
    expect(validateJournalSequence(events)).toEqual({ ok: true });
  });

  it('rejects duplicate event ids', () => {
    const event = createJournalEvent({
      workspaceId: 'ws_j',
      entityType: 'EPISODE',
      entityId: 'EP001',
      eventType: 'EPISODE_CREATED',
      previousRevision: 0,
      nextRevision: 1,
      dependencySha256: 'c'.repeat(64),
      reason: 'dup',
    });
    expect(validateJournalSequence([event, event]).ok).toBe(false);
  });

  it('rejects out-of-order revisions', () => {
    const first = createJournalEvent({
      workspaceId: 'ws_j',
      entityType: 'EPISODE',
      entityId: 'EP001',
      eventType: 'EPISODE_CREATED',
      previousRevision: 0,
      nextRevision: 1,
      dependencySha256: 'c'.repeat(64),
      reason: 'a',
    });
    const third = createJournalEvent({
      workspaceId: 'ws_j',
      entityType: 'EPISODE',
      entityId: 'EP003',
      eventType: 'EPISODE_CREATED',
      previousRevision: 2,
      nextRevision: 3,
      dependencySha256: 'c'.repeat(64),
      reason: 'c',
    });
    expect(validateJournalSequence([first, third])).toEqual({ ok: false, reason: 'out-of-order revision' });
  });

  it('rejects a corrupted payload hash', () => {
    const event = createJournalEvent({
      workspaceId: 'ws_j',
      entityType: 'EPISODE',
      entityId: 'EP001',
      eventType: 'EPISODE_CREATED',
      previousRevision: 0,
      nextRevision: 1,
      dependencySha256: 'c'.repeat(64),
      reason: 'bad',
    });
    expect(validateJournalSequence([{ ...event, payloadSha256: 'deadbeef' }])).toEqual({
      ok: false,
      reason: 'corrupted payload hash',
    });
  });

  it('rejects a payload that no longer matches its hash', () => {
    const event = createJournalEvent({
      workspaceId: 'ws_j',
      entityType: 'EPISODE',
      entityId: 'EP001',
      eventType: 'EPISODE_CREATED',
      previousRevision: 0,
      nextRevision: 1,
      dependencySha256: 'c'.repeat(64),
      reason: 'tamper',
      payload: { n: 1 },
    });
    expect(validateJournalSequence([{ ...event, payload: { n: 2 } }])).toEqual({
      ok: false,
      reason: 'corrupted payload hash',
    });
  });

  it('appends an event for every accepted write', () => {
    const store = createMemoryStore({ workspaceId: 'ws_journal' });
    store.writeEpisode('EP001', { n: 1 });
    store.writeProductionPacket('EP001', { packetSha256: 'p' });
    expect(store.listEvents()).toHaveLength(2);
    expect(store.listEvents()[0]?.eventType).toBe('EPISODE_CREATED');
    expect(store.listEvents()[1]?.eventType).toBe('PRODUCTION_PACKET_COMPILED');
  });

  it('keeps journal events append-only', () => {
    const store = createMemoryStore();
    store.writeEpisode('EP001', { n: 1 });
    const first = store.listEvents()[0];
    store.writeEpisode('EP002', { n: 2 });
    expect(store.listEvents()[0]).toEqual(first);
    expect(store.listEvents()).toHaveLength(2);
  });

  it('does not store secrets in journal reasons or payloads', () => {
    const store = createMemoryStore();
    store.writeWorkspace({ label: 'ok', RUNPOD_API_KEY: 'rp_secret' });
    const json = JSON.stringify(store.listEvents());
    expect(json).not.toContain('rp_secret');
    expect(json).toContain('[REDACTED]');
  });

  it('does not log signed URLs in the journal', () => {
    const event = createJournalEvent({
      workspaceId: 'ws_j',
      entityType: 'AUDIT_EVENT',
      entityId: 'a1',
      eventType: 'WORKSPACE_SAVED',
      previousRevision: 0,
      nextRevision: 1,
      dependencySha256: 'c'.repeat(64),
      reason: 'save',
      payload: { url: 'https://r2.example/obj?X-Amz-Signature=zzzz' },
    });
    expect(event.payload.url).toBe('[REDACTED]');
  });

  it('replays snapshot plus later events into the current record set', () => {
    const store = createMemoryStore({ workspaceId: 'ws_replay' });
    store.writeEpisode('EP001', { n: 1 });
    const snapshot = store.latestSnapshot();
    store.writeEpisode('EP002', { n: 2 });
    expect(snapshot).toBeTruthy();
    const replayed = replaySnapshot(snapshot!, store.listEvents().slice(1));
    expect('error' in replayed).toBe(false);
    if ('error' in replayed) return;
    expect(replayed.records.map((record) => record.entityId).sort()).toEqual(['EP001', 'EP002']);
  });

  it('produces the same state hash for the same event sequence', () => {
    const first = createMemoryStore({ workspaceId: 'ws_det' });
    const second = createMemoryStore({ workspaceId: 'ws_det' });
    for (const store of [first, second]) {
      store.writeEpisode('EP001', { n: 1 });
      store.writeProductionPacket('EP001', { packetSha256: 'p1' });
    }
    expect(first.workspaceSha256()).toBe(second.workspaceSha256());
    const replayed = replaySnapshot(emptySnapshot('ws_det'), first.listEvents());
    expect('error' in replayed).toBe(false);
    if ('error' in replayed) return;
    expect(replayed.records.map((record) => record.dependencySha256)).toEqual(
      first.listRecords().map((record) => record.dependencySha256),
    );
  });

  it('fails closed on an invalid snapshot hash', () => {
    const store = createMemoryStore();
    store.writeEpisode('EP001', { n: 1 });
    const snapshot = { ...store.latestSnapshot()!, snapshotSha256: '0'.repeat(64) };
    expect(replaySnapshot(snapshot, [])).toEqual({ error: 'invalid snapshot' });
  });

  it('fails closed when the first replay event skips a revision', () => {
    const store = createMemoryStore();
    store.writeEpisode('EP001', { n: 1 });
    store.writeEpisode('EP002', { n: 2 });
    const snapshot = store.historicalSnapshots()[0];
    expect(snapshot).toBeTruthy();
    const late = store.listEvents()[1];
    expect(replaySnapshot(snapshot!, late ? [late] : [])).toEqual({ error: 'missing event' });
  });

  it('fails closed on duplicate events during replay', () => {
    const store = createMemoryStore({ workspaceId: 'ws_dup' });
    store.writeEpisode('EP001', { n: 1 });
    const event = store.listEvents()[0]!;
    expect(replaySnapshot(emptySnapshot('ws_dup'), [event, event])).toEqual({ error: 'duplicate event' });
  });

  it('fails closed on out-of-order events during replay', () => {
    const first = createJournalEvent({
      workspaceId: 'ws_oo',
      entityType: 'EPISODE',
      entityId: 'EP001',
      eventType: 'EPISODE_CREATED',
      previousRevision: 0,
      nextRevision: 1,
      dependencySha256: 'c'.repeat(64),
      reason: 'a',
    });
    const skipped = createJournalEvent({
      workspaceId: 'ws_oo',
      entityType: 'EPISODE',
      entityId: 'EP003',
      eventType: 'EPISODE_CREATED',
      previousRevision: 2,
      nextRevision: 3,
      dependencySha256: 'c'.repeat(64),
      reason: 'c',
    });
    expect(replaySnapshot(emptySnapshot('ws_oo'), [first, skipped])).toEqual({
      error: 'out-of-order revision',
    });
  });

  it('fails closed on a corrupted event payload hash during replay', () => {
    const store = createMemoryStore({ workspaceId: 'ws_bad' });
    store.writeEpisode('EP001', { n: 1 });
    const event = { ...store.listEvents()[0]!, payload: { tampered: true } };
    expect(replaySnapshot(emptySnapshot('ws_bad'), [event])).toEqual({ error: 'corrupted payload hash' });
  });

  it('records actor class and reason without secrets', () => {
    const event = createJournalEvent({
      workspaceId: 'ws_j',
      entityType: 'AUDIT_EVENT',
      entityId: 'a',
      eventType: 'WORKSPACE_SAVED',
      previousRevision: 0,
      nextRevision: 1,
      dependencySha256: 'c'.repeat(64),
      actorClass: 'OPERATOR',
      reason: 'operator saved preview',
    });
    expect(event.actorClass).toBe('OPERATOR');
    expect(event.reason).not.toMatch(/token|secret/i);
  });

  it('uses deterministic event ids for the same revision and type', () => {
    const left = createJournalEvent({
      workspaceId: 'ws_j',
      entityType: 'EPISODE',
      entityId: 'EP001',
      eventType: 'EPISODE_CREATED',
      previousRevision: 4,
      nextRevision: 5,
      dependencySha256: 'c'.repeat(64),
      reason: 'x',
    });
    const right = createJournalEvent({
      workspaceId: 'ws_j',
      entityType: 'EPISODE',
      entityId: 'EP001',
      eventType: 'EPISODE_CREATED',
      previousRevision: 4,
      nextRevision: 5,
      dependencySha256: 'c'.repeat(64),
      reason: 'x',
    });
    expect(left.eventId).toBe(right.eventId);
  });

  it('tracks journal position on snapshots', () => {
    const store = createMemoryStore();
    store.writeEpisode('EP001', { n: 1 });
    store.writeEpisode('EP002', { n: 2 });
    expect(store.latestSnapshot()?.journalPosition).toBe(2);
    expect(store.latestSnapshot()?.revision).toBe(2);
  });

  it('keeps historical snapshots when explicitly requested', () => {
    const store = createMemoryStore();
    store.commitAggregate({
      expectedRevision: 0,
      records: [{ entityType: 'EPISODE', entityId: 'EP001', payload: { n: 1 }, dependencySha256: 'a'.repeat(64) }],
      eventType: 'EPISODE_CREATED',
      reason: 'one',
      snapshot: true,
    });
    store.commitAggregate({
      expectedRevision: 1,
      records: [{ entityType: 'EPISODE', entityId: 'EP002', payload: { n: 2 }, dependencySha256: 'b'.repeat(64) }],
      eventType: 'EPISODE_CREATED',
      reason: 'two',
      snapshot: true,
    });
    expect(store.historicalSnapshots().length).toBeGreaterThanOrEqual(2);
  });

  it('does not apply a journal event with a gap after the snapshot revision', () => {
    const snapshot = emptySnapshot('ws_gap');
    const event = createJournalEvent({
      workspaceId: 'ws_gap',
      entityType: 'EPISODE',
      entityId: 'EP009',
      eventType: 'EPISODE_CREATED',
      previousRevision: 4,
      nextRevision: 5,
      dependencySha256: 'c'.repeat(64),
      reason: 'gap',
    });
    expect(replaySnapshot(snapshot, [event])).toEqual({ error: 'missing event' });
  });

  it('replays QC and delivery as a consistent pair when committed together', () => {
    const store = createMemoryStore({ workspaceId: 'ws_pair' });
    store.commitAggregate({
      expectedRevision: 0,
      records: [
        { entityType: 'QC_RECEIPT', entityId: 'EP012', payload: { passed: false }, dependencySha256: sha256Canonical({ passed: false }) },
        { entityType: 'DELIVERY_PACKAGE', entityId: 'EP012', payload: { readiness: 'QC_BLOCKED' }, dependencySha256: sha256Canonical({ readiness: 'QC_BLOCKED' }) },
      ],
      eventType: 'QC_RECEIPT_RECORDED',
      reason: 'qc+delivery',
    });
    const replayed = replaySnapshot(emptySnapshot('ws_pair'), store.listEvents());
    expect('error' in replayed).toBe(false);
    if ('error' in replayed) return;
    expect(replayed.records).toHaveLength(2);
  });

  it('includes payloadSha256 and dependencySha256 on store events', () => {
    const store = createMemoryStore();
    store.writeEpisode('EP001', { n: 1 });
    const event = store.listEvents()[0];
    expect(event?.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(event?.dependencySha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not store raw commercial metadata in journal payloads', () => {
    const store = createMemoryStore();
    store.writeRecord({
      entityType: 'APPROVED_ASSET_REFERENCE',
      entityId: 'AA1',
      payload: { assetId: 'AA1', purchasedFrom: 'vendor', receiptRef: 'ref' },
      expectedRevision: 0,
      eventType: 'ASSET_RESOLUTION_BOUND',
      reason: 'bind asset',
    });
    expect(JSON.stringify(store.listEvents())).not.toMatch(/license-key|credit-card/i);
  });

  it('validates an empty journal as healthy', () => {
    expect(validateJournalSequence([])).toEqual({ ok: true });
  });

  it('rejects nextRevision that does not increment by one', () => {
    const event: JournalEvent = {
      ...createJournalEvent({
        workspaceId: 'ws_j',
        entityType: 'EPISODE',
        entityId: 'EP001',
        eventType: 'EPISODE_CREATED',
        previousRevision: 0,
        nextRevision: 1,
        dependencySha256: 'c'.repeat(64),
        reason: 'x',
      }),
      nextRevision: 2,
    };
    expect(validateJournalSequence([event])).toEqual({ ok: false, reason: 'out-of-order revision' });
  });

  it('snapshots include a 64-character sha256', () => {
    const store = createMemoryStore();
    store.writeWorkspace({ label: 'snap' });
    expect(store.latestSnapshot()?.snapshotSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not treat a missing snapshot as replayable current state', () => {
    expect(replaySnapshot({ ...emptySnapshot('ws_x'), snapshotSha256: '' }, [])).toEqual({ error: 'invalid snapshot' });
  });

  it('replays source records without sharing object identity', () => {
    const store = createMemoryStore({ workspaceId: 'ws_ident' });
    store.writeEpisode('EP001', { n: 1 });
    const snapshot = store.latestSnapshot()!;
    const replayed = replaySnapshot(snapshot, []);
    expect('error' in replayed).toBe(false);
    if ('error' in replayed) return;
    expect(replayed.records[0]).not.toBe(snapshot.records[0]);
  });

  it('records WRITE_FAILED events without dropping prior journal entries', () => {
    const store = createMemoryStore({ fault: 'BEFORE_EVENT_APPEND' });
    store.writeEpisode('EP001', { n: 1 });
    expect(store.listEvents()[0]?.eventType).toBe('WRITE_FAILED');
    expect(store.readEpisode('EP001')).toBeNull();
  });

  it('keeps latest snapshot hash stable for identical record sets', () => {
    const left = createMemoryStore({ workspaceId: 'ws_same' });
    const right = createMemoryStore({ workspaceId: 'ws_same' });
    left.writeEpisode('EP001', { n: 1 });
    right.writeEpisode('EP001', { n: 1 });
    expect(left.latestSnapshot()?.snapshotSha256).toBe(right.latestSnapshot()?.snapshotSha256);
  });

  it('includes workspaceId on every event', () => {
    const store = createMemoryStore({ workspaceId: 'ws_only' });
    store.writeEpisode('EP001', { n: 1 });
    expect(store.listEvents().every((event) => event.workspaceId === 'ws_only')).toBe(true);
  });

  it('supports visual approval and job checkpoint event types from the store', () => {
    const store = createMemoryStore();
    store.writeRecord({
      entityType: 'VISUAL_APPROVAL_REFERENCE',
      entityId: 'vis',
      payload: { state: 'NOT_RECORDED' },
      expectedRevision: 0,
      eventType: 'VISUAL_APPROVAL_RECORDED',
      reason: 'visual',
    });
    store.writeJobCheckpoint('job_a', { attempt: 1 });
    expect(store.listEvents().map((event) => event.eventType)).toEqual([
      'VISUAL_APPROVAL_RECORDED',
      'JOB_CHECKPOINT_WRITTEN',
    ]);
  });
});

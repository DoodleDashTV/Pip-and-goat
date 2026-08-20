import { describe, expect, it } from 'vitest';
import {
  concurrencySchema,
  createFileStore,
  createMemoryStore,
  createPreviewDatabaseStore,
  evaluateOptimisticWrite,
  persistFileStore,
} from './tivvlejoy-production-persistence';

function seedRevision(store: ReturnType<typeof createMemoryStore>, target: number): void {
  for (let index = 0; index < target; index += 1) {
    const receipt = store.writeEpisode(`EP_SEED_${index}`, { index });
    expect(receipt.result).toBe('WRITE_ACCEPTED');
  }
}

describe('production optimistic concurrency', () => {
  it('declares the concurrency schema', () => {
    expect(concurrencySchema()).toBe('TIVVLEJOY_PRODUCTION_CONCURRENCY_V1');
  });

  it('accepts a write at the current revision', () => {
    expect(
      evaluateOptimisticWrite({
        currentRevision: 5,
        expectedRevision: 5,
        currentSha256: 'aa',
        nextSha256: 'bb',
      }),
    ).toBe('WRITE_ACCEPTED');
  });

  it('returns WRITE_IDEMPOTENT for the same content hash at the same revision', () => {
    expect(
      evaluateOptimisticWrite({
        currentRevision: 5,
        expectedRevision: 5,
        currentSha256: 'aa',
        nextSha256: 'aa',
      }),
    ).toBe('WRITE_IDEMPOTENT');
  });

  it('returns WRITE_CONFLICT when the expected revision is behind', () => {
    expect(
      evaluateOptimisticWrite({
        currentRevision: 6,
        expectedRevision: 5,
        currentSha256: 'aa',
        nextSha256: 'cc',
      }),
    ).toBe('WRITE_CONFLICT');
  });

  it('returns WRITE_STALE when the expected revision is ahead', () => {
    expect(
      evaluateOptimisticWrite({
        currentRevision: 5,
        expectedRevision: 9,
        currentSha256: 'aa',
        nextSha256: 'cc',
      }),
    ).toBe('WRITE_STALE');
  });

  it('lets tab A move revision 5 to 6', () => {
    const store = createMemoryStore();
    seedRevision(store, 5);
    expect(store.getRevision()).toBe(5);
    const receipt = store.writeEpisode('EP_TAB_A', { from: 'A' }, 5);
    expect(receipt.result).toBe('WRITE_ACCEPTED');
    expect(store.getRevision()).toBe(6);
  });

  it('rejects tab B writing from revision 5 after tab A already wrote 6', () => {
    const store = createMemoryStore();
    seedRevision(store, 5);
    expect(store.writeEpisode('EP_TAB_A', { from: 'A' }, 5).result).toBe('WRITE_ACCEPTED');
    const conflict = store.writeEpisode('EP_TAB_B', { from: 'B' }, 5);
    expect(conflict.result).toBe('WRITE_CONFLICT');
    expect(store.readEpisode('EP_TAB_B')).toBeNull();
    expect(store.readEpisode('EP_TAB_A')?.payload.from).toBe('A');
  });

  it('does not last-writer-wins overwrite after a conflict', () => {
    const store = createMemoryStore();
    store.writeEpisode('EP001', { body: 'original' });
    store.writeEpisode('EP001', { body: 'tab-a' });
    const conflict = store.writeEpisode('EP001', { body: 'tab-b' }, 0);
    expect(conflict.result).toBe('WRITE_CONFLICT');
    expect(store.readEpisode('EP001')?.payload.body).toBe('tab-a');
  });

  it('returns WRITE_IDEMPOTENT for a duplicate write with the same content hash', () => {
    const store = createMemoryStore();
    expect(store.writeEpisode('EP001', { body: 'same' }).result).toBe('WRITE_ACCEPTED');
    const again = store.writeEpisode('EP001', { body: 'same' });
    expect(again.result).toBe('WRITE_IDEMPOTENT');
    expect(store.getRevision()).toBe(1);
  });

  it('does not create a second persistent job for a duplicate idempotent write', () => {
    const store = createMemoryStore();
    store.writeJobCheckpoint('job_render_1', { idempotencyKey: 'job_render_1:v1' });
    const again = store.writeJobCheckpoint('job_render_1', { idempotencyKey: 'job_render_1:v1' });
    expect(again.result).toBe('WRITE_IDEMPOTENT');
    expect(store.listRecords().filter((record) => record.entityType === 'PRODUCTION_JOB')).toHaveLength(1);
  });

  it('returns WRITE_STALE when a client predicted a future revision', () => {
    const store = createMemoryStore();
    const receipt = store.writeEpisode('EP001', { n: 1 }, 4);
    expect(receipt.result).toBe('WRITE_STALE');
    expect(store.readEpisode('EP001')).toBeNull();
  });

  it('counts pending conflicts', () => {
    const store = createMemoryStore();
    store.writeEpisode('EP001', { n: 1 });
    store.writeEpisode('EP002', { n: 2 }, 0);
    store.writeEpisode('EP003', { n: 3 }, 0);
    expect(store.conflictCount()).toBe(2);
  });

  it('rejects production-database writes as WRITE_REJECTED rather than conflict', () => {
    const store = createMemoryStore();
    store.writeEpisode('EP001', { n: 1 });
    expect(store.writeEpisode('EP002', { n: 2 }, 1).result).toBe('WRITE_ACCEPTED');
  });

  it('commits packet, graph snapshot, and journal atomically', () => {
    const store = createMemoryStore();
    const receipt = store.commitAggregate({
      expectedRevision: 0,
      records: [
        { entityType: 'PRODUCTION_PACKET', entityId: 'EP012', payload: { packetSha256: 'p' }, dependencySha256: '1'.repeat(64) },
        { entityType: 'PRODUCTION_STATE_NODE', entityId: 'graph_nodes', payload: { nodeCount: 2 }, dependencySha256: '2'.repeat(64) },
      ],
      eventType: 'PRODUCTION_PACKET_COMPILED',
      reason: 'compile packet + graph',
      snapshot: true,
    });
    expect(receipt.result).toBe('WRITE_ACCEPTED');
    expect(store.readProductionPacket('EP012')).toBeTruthy();
    expect(store.readRecord('PRODUCTION_STATE_NODE', 'graph_nodes')).toBeTruthy();
    expect(store.listEvents()).toHaveLength(1);
    expect(store.latestSnapshot()).toBeTruthy();
  });

  it('rolls back a mid-packet fault so no half-written packet remains', () => {
    const store = createMemoryStore({ fault: 'MID_PACKET' });
    const receipt = store.commitAggregate({
      expectedRevision: 0,
      records: [
        { entityType: 'PRODUCTION_PACKET', entityId: 'EP012', payload: { packetSha256: 'p' }, dependencySha256: '1'.repeat(64) },
        { entityType: 'PRODUCTION_STATE_NODE', entityId: 'graph_nodes', payload: { nodeCount: 2 }, dependencySha256: '2'.repeat(64) },
      ],
      eventType: 'PRODUCTION_PACKET_COMPILED',
      reason: 'should fail',
    });
    expect(receipt.result).toBe('WRITE_REJECTED');
    expect(store.readProductionPacket('EP012')).toBeNull();
    expect(store.readRecord('PRODUCTION_STATE_NODE', 'graph_nodes')).toBeNull();
    expect(store.listEvents()[0]?.eventType).toBe('WRITE_FAILED');
  });

  it('keeps QC and delivery consistent across a mid-delivery fault', () => {
    const store = createMemoryStore();
    store.commitAggregate({
      expectedRevision: 0,
      records: [
        { entityType: 'QC_RECEIPT', entityId: 'EP012', payload: { passed: false }, dependencySha256: '1'.repeat(64) },
        { entityType: 'DELIVERY_PACKAGE', entityId: 'EP012', payload: { readiness: 'QC_BLOCKED' }, dependencySha256: '2'.repeat(64) },
      ],
      eventType: 'QC_RECEIPT_RECORDED',
      reason: 'initial',
    });
    const before = store.workspaceSha256();
    store.setFault('MID_DELIVERY');
    const failed = store.commitAggregate({
      expectedRevision: store.getRevision(),
      records: [
        { entityType: 'QC_RECEIPT', entityId: 'EP012', payload: { passed: true }, dependencySha256: '3'.repeat(64) },
        { entityType: 'DELIVERY_PACKAGE', entityId: 'EP012', payload: { readiness: 'READY' }, dependencySha256: '4'.repeat(64) },
      ],
      eventType: 'QC_RECEIPT_RECORDED',
      reason: 'should fail',
    });
    expect(failed.result).toBe('WRITE_REJECTED');
    expect(store.readQcReceipt('EP012')?.payload.passed).toBe(false);
    expect(store.readDeliveryPackage('EP012')?.payload.readiness).toBe('QC_BLOCKED');
    expect(store.workspaceSha256()).not.toBe(before);
    expect(store.readQcReceipt('EP012')?.dependencySha256).toBe('1'.repeat(64));
  });

  it('uses snapshot/swap so a before-snapshot fault leaves the previous revision', () => {
    const store = createMemoryStore();
    store.writeEpisode('EP001', { n: 1 });
    const revision = store.getRevision();
    store.setFault('BEFORE_SNAPSHOT');
    const receipt = store.writeEpisode('EP002', { n: 2 });
    expect(receipt.result).toBe('WRITE_REJECTED');
    expect(store.readEpisode('EP002')).toBeNull();
    expect(store.readEpisode('EP001')?.payload.n).toBe(1);
    expect(store.getRevision()).toBe(revision + 1);
    expect(store.listEvents().at(-1)?.eventType).toBe('WRITE_FAILED');
  });

  it('shares a file backend so a stale browser tab cannot clobber a newer revision', () => {
    const directory = new Map<string, string>();
    const seed = createFileStore(directory, { workspaceId: 'ws_tabs' });
    seedRevision(seed, 5);
    persistFileStore(seed, directory);
    const tabA = createFileStore(directory, { workspaceId: 'ws_tabs' });
    expect(tabA.writeEpisode('EP_TAB_A', { from: 'A' }, 5).result).toBe('WRITE_ACCEPTED');
    persistFileStore(tabA, directory);
    const tabB = createFileStore(directory, { workspaceId: 'ws_tabs' });
    expect(tabB.getRevision()).toBe(6);
    const conflict = tabB.writeEpisode('EP_TAB_B', { from: 'B' }, 5);
    expect(conflict.result).toBe('WRITE_CONFLICT');
    expect(tabB.readEpisode('EP_TAB_A')?.payload.from).toBe('A');
  });

  it('accepts a retry that reloads the latest revision', () => {
    const store = createMemoryStore();
    seedRevision(store, 5);
    store.writeEpisode('EP_TAB_A', { from: 'A' }, 5);
    expect(store.writeEpisode('EP_TAB_B', { from: 'B' }, store.getRevision()).result).toBe('WRITE_ACCEPTED');
  });

  it('classifies an unchanged hash as idempotent even after other entities moved on', () => {
    const store = createMemoryStore();
    store.writeEpisode('EP001', { body: 'same' });
    store.writeEpisode('EP002', { body: 'other' });
    expect(store.writeEpisode('EP001', { body: 'same' }).result).toBe('WRITE_IDEMPOTENT');
  });

  it('rejects a stale expected revision on aggregate writes', () => {
    const store = createMemoryStore();
    store.writeWorkspace({ label: 'one' });
    const receipt = store.commitAggregate({
      expectedRevision: 0,
      records: [{ entityType: 'EPISODE', entityId: 'EP001', payload: { n: 1 }, dependencySha256: '1'.repeat(64) }],
      eventType: 'EPISODE_CREATED',
      reason: 'stale',
    });
    expect(receipt.result).toBe('WRITE_CONFLICT');
  });

  it('returns WRITE_STALE on aggregate writes that skip ahead', () => {
    const store = createMemoryStore();
    const receipt = store.commitAggregate({
      expectedRevision: 3,
      records: [{ entityType: 'EPISODE', entityId: 'EP001', payload: { n: 1 }, dependencySha256: '1'.repeat(64) }],
      eventType: 'EPISODE_CREATED',
      reason: 'ahead',
    });
    expect(receipt.result).toBe('WRITE_STALE');
  });

  it('does not increment revision on idempotent writes', () => {
    const store = createMemoryStore();
    store.writeWorkspace({ label: 'once' });
    const revision = store.getRevision();
    store.writeWorkspace({ label: 'once' });
    expect(store.getRevision()).toBe(revision);
  });

  it('keeps dependency hashes stable across an idempotent retry', () => {
    const store = createMemoryStore();
    const first = store.writeProductionPacket('EP012', { packetSha256: 'abc' });
    const second = store.writeProductionPacket('EP012', { packetSha256: 'abc' });
    expect(second.result).toBe('WRITE_IDEMPOTENT');
    expect(second.dependencySha256).toBe(store.readProductionPacket('EP012')?.dependencySha256);
    expect(first.revision).toBe(second.revision);
  });

  it('does not apply tab B payload when conflicted', () => {
    const store = createMemoryStore();
    store.writeEpisode('EP001', { body: 'a' });
    store.writeEpisode('EP001', { body: 'b' }, 0);
    expect(store.readEpisode('EP001')?.payload.body).toBe('a');
  });

  it('records a conflict without writing a second episode row', () => {
    const store = createMemoryStore();
    store.writeEpisode('EP001', { n: 1 });
    store.writeEpisode('EP002', { n: 2 }, 0);
    expect(store.listRecords().filter((record) => record.entityType === 'EPISODE')).toHaveLength(1);
  });

  it('allows two sequential accepted writes from the same tab', () => {
    const store = createMemoryStore();
    expect(store.writeEpisode('EP001', { n: 1 }).result).toBe('WRITE_ACCEPTED');
    expect(store.writeEpisode('EP001', { n: 2 }).result).toBe('WRITE_ACCEPTED');
    expect(store.readEpisode('EP001')?.payload.n).toBe(2);
  });

  it('protects continuity appends with the same revision check', () => {
    const store = createMemoryStore();
    store.appendContinuityFacts([{ factId: 'f1', payload: { state: 'A' } }]);
    const conflict = store.appendContinuityFacts([{ factId: 'f2', payload: { state: 'B' } }], 0);
    expect(conflict.result).toBe('WRITE_CONFLICT');
    expect(store.readRecord('CONTINUITY_FACT', 'f2')).toBeNull();
  });

  it('protects job checkpoint writes from lost updates', () => {
    const store = createMemoryStore();
    store.writeJobCheckpoint('job_1', { attempt: 1 });
    expect(store.writeJobCheckpoint('job_1', { attempt: 2 }, 0).result).toBe('WRITE_CONFLICT');
    expect(store.readRecord('PRODUCTION_JOB', 'job_1')?.payload.attempt).toBe(1);
  });

  it('protects QC receipt writes from lost updates', () => {
    const store = createMemoryStore();
    store.writeQcReceipt('EP012', { passed: false });
    expect(store.writeQcReceipt('EP012', { passed: true }, 0).result).toBe('WRITE_CONFLICT');
    expect(store.readQcReceipt('EP012')?.payload.passed).toBe(false);
  });

  it('protects delivery package writes from lost updates', () => {
    const store = createMemoryStore();
    store.writeDeliveryPackage('EP012', { readiness: 'QC_BLOCKED' });
    expect(store.writeDeliveryPackage('EP012', { readiness: 'READY' }, 0).result).toBe('WRITE_CONFLICT');
    expect(store.readDeliveryPackage('EP012')?.payload.readiness).toBe('QC_BLOCKED');
  });

  it('does not treat a different payload as idempotent', () => {
    const store = createMemoryStore();
    store.writeEpisode('EP001', { body: 'one' });
    expect(store.writeEpisode('EP001', { body: 'two' }).result).toBe('WRITE_ACCEPTED');
  });

  it('exposes WRITE_REJECTED for unconfigured preview database instead of accepting', () => {
    const store = createPreviewDatabaseStore(false);
    expect(store.writeEpisode('EP001', { n: 1 }).result).toBe('WRITE_REJECTED');
  });
});

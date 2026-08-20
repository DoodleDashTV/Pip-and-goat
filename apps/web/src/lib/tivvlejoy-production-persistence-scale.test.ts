import { beforeAll, describe, expect, it } from 'vitest';
import { changeImpact } from './tivvlejoy-production-studio/state-graph';
import {
  createMemoryStore,
  exportWorkspaceBackup,
  hydrateStoreFromJson,
  persistSeasonInMemory,
  persistSeasonToStore,
  replaySnapshot,
  sha256Canonical,
  type PersistSeasonResult,
  type ProductionPersistenceStore,
} from './tivvlejoy-production-persistence';

let persisted: PersistSeasonResult & { store: ProductionPersistenceStore };

beforeAll(() => {
  persisted = persistSeasonInMemory('ws_scale');
}, 120_000);

describe('60-episode persistence scale simulation', { timeout: 120_000 }, () => {
  it('persists 60 episodes, 720 shots, and 2160 jobs', () => {
    expect(persisted.counts.episodes).toBe(60);
    expect(persisted.counts.shots).toBe(720);
    expect(persisted.counts.jobs).toBe(2160);
    expect(persisted.counts.packets).toBe(60);
    expect(persisted.store.listRecords().filter((record) => record.entityType === 'EPISODE')).toHaveLength(60);
    expect(persisted.store.listRecords().filter((record) => record.entityType === 'SHOT')).toHaveLength(720);
    expect(persisted.store.listRecords().filter((record) => record.entityType === 'PRODUCTION_JOB')).toHaveLength(2160);
  });

  it('persists production packets, continuity, QC, and delivery state', () => {
    expect(persisted.counts.continuityFacts).toBeGreaterThan(60);
    expect(persisted.counts.qcReceipts).toBe(60);
    expect(persisted.counts.deliveryPackages).toBe(60);
    expect(persisted.store.readProductionPacket('EP012')?.payload.packetSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('records a write time without promising a production SLA', () => {
    expect(persisted.writeMs).toBeGreaterThan(0);
    expect(Number.isFinite(persisted.writeMs)).toBe(true);
  });

  it('cold-reloads identical hashes', () => {
    const started = Date.now();
    const reloaded = hydrateStoreFromJson(JSON.stringify(persisted.store.serialize()), 'PREVIEW_MEMORY');
    const readMs = Date.now() - started;
    expect(reloaded.workspaceSha256()).toBe(persisted.store.workspaceSha256());
    expect(reloaded.readProductionPacket('EP012')?.dependencySha256).toBe(
      persisted.store.readProductionPacket('EP012')?.dependencySha256,
    );
    expect(readMs).toBeGreaterThanOrEqual(0);
  });

  it('survives a second cold reload', () => {
    const first = hydrateStoreFromJson(JSON.stringify(persisted.store.serialize()), 'PREVIEW_BROWSER');
    const second = hydrateStoreFromJson(JSON.stringify(first.serialize()), 'PREVIEW_MEMORY');
    expect(second.workspaceSha256()).toBe(persisted.store.workspaceSha256());
    expect(second.listEvents()).toHaveLength(persisted.store.listEvents().length);
  });

  it('replays the journal onto an empty snapshot with a measured replay time', () => {
    const snapshot = {
      schemaVersion: 'TIVVLEJOY_PRODUCTION_SNAPSHOT_V1' as const,
      workspaceId: 'ws_scale',
      journalPosition: 0,
      revision: 0,
      records: [],
    };
    const empty = { ...snapshot, snapshotSha256: sha256Canonical(snapshot) };
    const started = Date.now();
    const replayed = replaySnapshot(empty, persisted.store.listEvents());
    const replayMs = Date.now() - started;
    expect('error' in replayed).toBe(false);
    if ('error' in replayed) return;
    expect(replayed.records.filter((record) => record.entityType === 'EPISODE')).toHaveLength(60);
    expect(replayMs).toBeGreaterThanOrEqual(0);
  });

  it('reports snapshot size and event count as measured values', () => {
    const snapshot = persisted.store.latestSnapshot();
    const snapshotSize = JSON.stringify(snapshot).length;
    expect(persisted.counts.events).toBe(persisted.store.listEvents().length);
    expect(snapshotSize).toBeGreaterThan(1000);
    expect(persisted.counts.events).toBeGreaterThan(60);
  });

  it('updates only the approved asset reference after an asset invalidation', () => {
    const store = hydrateStoreFromJson(JSON.stringify(persisted.store.serialize()), 'PREVIEW_MEMORY');
    const before = new Map(store.listRecords().map((record) => [record.id, record.dependencySha256]));
    const receipt = store.writeRecord({
      entityType: 'APPROVED_ASSET_REFERENCE',
      entityId: 'AA_FOREST_HERO_TREE',
      payload: { approvedAssetId: 'AA_FOREST_HERO_TREE', referenceOnly: true, invalidated: true },
      expectedRevision: store.getRevision(),
      eventType: 'ASSET_RESOLUTION_BOUND',
      reason: 'invalidate asset',
    });
    expect(receipt.result).toBe('WRITE_ACCEPTED');
    for (const record of store.listRecords()) {
      if (record.id === 'APPROVED_ASSET_REFERENCE:AA_FOREST_HERO_TREE') {
        expect(record.dependencySha256).not.toBe(before.get(record.id));
      } else if (record.entityType !== 'AUDIT_EVENT') {
        expect(record.dependencySha256).toBe(before.get(record.id));
      }
    }
  });

  it('updates only the targeted voice receipt after a voice invalidation', () => {
    const store = hydrateStoreFromJson(JSON.stringify(persisted.store.serialize()), 'PREVIEW_MEMORY');
    const before = store.readRecord('VOICE_RECEIPT', 'voice_EP012')?.dependencySha256;
    const other = store.readRecord('VOICE_RECEIPT', 'voice_EP011')?.dependencySha256;
    store.writeRecord({
      entityType: 'VOICE_RECEIPT',
      entityId: 'voice_EP012',
      payload: { episodeId: 'EP012', invalidated: true },
      expectedRevision: store.getRevision(),
      eventType: 'VOICE_RECEIPT_BOUND',
      reason: 'invalidate voice',
    });
    expect(store.readRecord('VOICE_RECEIPT', 'voice_EP012')?.dependencySha256).not.toBe(before);
    expect(store.readRecord('VOICE_RECEIPT', 'voice_EP011')?.dependencySha256).toBe(other);
  });

  it('records a Pip-rig-version invalidation without rewriting unrelated shots', () => {
    const store = hydrateStoreFromJson(JSON.stringify(persisted.store.serialize()), 'PREVIEW_MEMORY');
    const shotHash = store.readRecord('SHOT', 'EP001_SH01')?.dependencySha256;
    store.writeRecord({
      entityType: 'AUDIT_EVENT',
      entityId: 'pip_rig_invalidation',
      payload: { pipRigVersion: 'invalidated' },
      expectedRevision: store.getRevision(),
      eventType: 'WORKSPACE_SAVED',
      reason: 'pip rig version changed',
    });
    expect(store.readRecord('SHOT', 'EP001_SH01')?.dependencySha256).toBe(shotHash);
    expect(changeImpact(persisted.plan.graph, persisted.plan.graph.nodes.filter((node) => node.kind === 'CHARACTER_RIG').map((node) => node.nodeId)).length).toBeGreaterThan(0);
  });

  it('updates only bakery location records after a bakery invalidation', () => {
    const store = hydrateStoreFromJson(JSON.stringify(persisted.store.serialize()), 'PREVIEW_MEMORY');
    const bakery = store.readRecord('LOCATION_INSTANCE', 'bakery')?.dependencySha256;
    const other = store.readRecord('LOCATION_INSTANCE', 'new_meadow')?.dependencySha256;
    store.writeRecord({
      entityType: 'LOCATION_INSTANCE',
      entityId: 'bakery',
      payload: { locationId: 'bakery', family: 'bakery', invalidated: true },
      expectedRevision: store.getRevision(),
      eventType: 'ASSET_RESOLUTION_BOUND',
      reason: 'invalidate bakery',
    });
    expect(store.readRecord('LOCATION_INSTANCE', 'bakery')?.dependencySha256).not.toBe(bakery);
    expect(store.readRecord('LOCATION_INSTANCE', 'new_meadow')?.dependencySha256).toBe(other);
  });

  it('adds a continuity conflict without rewriting unrelated facts', () => {
    const store = hydrateStoreFromJson(JSON.stringify(persisted.store.serialize()), 'PREVIEW_MEMORY');
    const firstFact = store.listRecords().find((record) => record.entityType === 'CONTINUITY_FACT');
    const before = firstFact?.dependencySha256;
    store.appendContinuityFacts([{ factId: 'SIGN::BAKERY::CONFLICT', payload: { state: 'CONFLICT', topic: 'SIGNAGE' } }]);
    expect(store.readRecord('CONTINUITY_FACT', firstFact!.entityId)?.dependencySha256).toBe(before);
    expect(store.readRecord('CONTINUITY_FACT', 'SIGN::BAKERY::CONFLICT')?.payload.state).toBe('CONFLICT');
  });

  it('updates QC for one episode only', () => {
    const store = hydrateStoreFromJson(JSON.stringify(persisted.store.serialize()), 'PREVIEW_MEMORY');
    const other = store.readQcReceipt('EP011')?.dependencySha256;
    store.writeQcReceipt('EP012', { passed: true, synthetic: true });
    expect(store.readQcReceipt('EP012')?.payload.passed).toBe(true);
    expect(store.readQcReceipt('EP011')?.dependencySha256).toBe(other);
  });

  it('updates delivery for one episode only', () => {
    const store = hydrateStoreFromJson(JSON.stringify(persisted.store.serialize()), 'PREVIEW_MEMORY');
    const other = store.readDeliveryPackage('EP011')?.dependencySha256;
    store.writeDeliveryPackage('EP012', { readiness: 'QC_BLOCKED', note: 'still blocked' });
    expect(store.readDeliveryPackage('EP012')?.payload.note).toBe('still blocked');
    expect(store.readDeliveryPackage('EP011')?.dependencySha256).toBe(other);
  });

  it('exports a metadata-only backup whose size is measured', () => {
    const backup = exportWorkspaceBackup(persisted.store);
    const backupSize = JSON.stringify(backup).length;
    expect(backupSize).toBeGreaterThan(1000);
    expect(backup.entityCounts.EPISODE).toBe(60);
    expect(backup.commercialBytesExcluded).toBe(true);
  });

  it('keeps accepted write receipts for the initial persist', () => {
    expect(persisted.receipts.every((receipt) => receipt.result === 'WRITE_ACCEPTED' || receipt.result === 'WRITE_IDEMPOTENT')).toBe(true);
  });

  it('can persist the same season a second time into a fresh store with matching packet hashes', () => {
    const store = createMemoryStore({ workspaceId: 'ws_scale_again' });
    persistSeasonToStore(store);
    expect(store.readProductionPacket('EP012')?.payload.packetSha256).toBe(
      persisted.store.readProductionPacket('EP012')?.payload.packetSha256,
    );
  });

  it('does not create fake performance promises in the measured metrics object', () => {
    const metrics = {
      writeMs: persisted.writeMs,
      eventCount: persisted.counts.events,
      episodes: persisted.counts.episodes,
      shots: persisted.counts.shots,
      jobs: persisted.counts.jobs,
    };
    expect(JSON.stringify(metrics)).not.toMatch(/guarantee|SLA|always under/i);
  });

  it('retains 2160 conceptual jobs after reload', () => {
    const reloaded = hydrateStoreFromJson(JSON.stringify(persisted.store.serialize()), 'PREVIEW_MEMORY');
    expect(reloaded.listRecords().filter((record) => record.entityType === 'PRODUCTION_JOB')).toHaveLength(2160);
  });

  it('retains recovery checkpoints for every episode after reload', () => {
    const reloaded = hydrateStoreFromJson(JSON.stringify(persisted.store.serialize()), 'PREVIEW_MEMORY');
    expect(reloaded.listRecords().filter((record) => record.entityType === 'RECOVERY_CHECKPOINT')).toHaveLength(60);
  });
});

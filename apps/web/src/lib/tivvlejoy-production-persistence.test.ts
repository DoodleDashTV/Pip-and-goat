import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BACKUP_SCHEMA,
  CONCURRENCY_SCHEMA,
  ENTITY_TYPES,
  EVENT_JOURNAL_SCHEMA,
  HEALTH_SCHEMA,
  PERSISTENCE_MODES,
  PERSISTENCE_SCHEMA,
  SNAPSHOT_SCHEMA,
  TIVVLEJOY_DURABLE_MIGRATION_NAME,
  TIVVLEJOY_DURABLE_TABLES,
  WRITE_RESULTS,
  createFileStore,
  createMemoryStore,
  createPreviewDatabaseStore,
  createProductionDatabaseStore,
  durableTableNames,
  persistFileStore,
  selectPersistenceMode,
} from './tivvlejoy-production-persistence';

describe('durable production persistence model', () => {
  it('declares the persistence schema constant', () => {
    expect(PERSISTENCE_SCHEMA).toBe('TIVVLEJOY_DURABLE_PRODUCTION_PERSISTENCE_V1');
  });

  it('declares journal, snapshot, concurrency, backup, and health schemas', () => {
    expect(EVENT_JOURNAL_SCHEMA).toBe('TIVVLEJOY_PRODUCTION_EVENT_JOURNAL_V1');
    expect(SNAPSHOT_SCHEMA).toBe('TIVVLEJOY_PRODUCTION_SNAPSHOT_V1');
    expect(CONCURRENCY_SCHEMA).toBe('TIVVLEJOY_PRODUCTION_CONCURRENCY_V1');
    expect(BACKUP_SCHEMA).toBe('TIVVLEJOY_PRODUCTION_BACKUP_V1');
    expect(HEALTH_SCHEMA).toBe('TIVVLEJOY_PERSISTENCE_HEALTH_V1');
  });

  it('supports the four explicit persistence modes', () => {
    expect(PERSISTENCE_MODES).toEqual(['PREVIEW_MEMORY', 'PREVIEW_BROWSER', 'PREVIEW_DATABASE', 'PRODUCTION_DATABASE']);
  });

  it('enumerates every required durable entity type', () => {
    expect(ENTITY_TYPES).toContain('WORKSPACE');
    expect(ENTITY_TYPES).toContain('PRODUCTION');
    expect(ENTITY_TYPES).toContain('SEASON');
    expect(ENTITY_TYPES).toContain('EPISODE');
    expect(ENTITY_TYPES).toContain('SCRIPT_VERSION');
    expect(ENTITY_TYPES).toContain('VOICE_RECEIPT');
    expect(ENTITY_TYPES).toContain('APPROVED_ASSET_REFERENCE');
    expect(ENTITY_TYPES).toContain('LOCATION_INSTANCE');
    expect(ENTITY_TYPES).toContain('SHOT');
    expect(ENTITY_TYPES).toContain('PRODUCTION_PACKET');
    expect(ENTITY_TYPES).toContain('PRODUCTION_STATE_NODE');
    expect(ENTITY_TYPES).toContain('PRODUCTION_STATE_EDGE');
    expect(ENTITY_TYPES).toContain('CONTINUITY_FACT');
    expect(ENTITY_TYPES).toContain('BATCH_PLAN');
    expect(ENTITY_TYPES).toContain('PRODUCTION_JOB');
    expect(ENTITY_TYPES).toContain('RECOVERY_CHECKPOINT');
    expect(ENTITY_TYPES).toContain('VISUAL_APPROVAL_REFERENCE');
    expect(ENTITY_TYPES).toContain('RENDER_PREFLIGHT_REFERENCE');
    expect(ENTITY_TYPES).toContain('RENDER_RECEIPT_REFERENCE');
    expect(ENTITY_TYPES).toContain('QC_RECEIPT');
    expect(ENTITY_TYPES).toContain('DELIVERY_PACKAGE');
    expect(ENTITY_TYPES).toContain('AUDIT_EVENT');
    expect(ENTITY_TYPES).toContain('RIG_ADMISSION_REPORT');
    expect(ENTITY_TYPES).toContain('SHOT_ANIMATION_MANIFEST');
    expect(ENTITY_TYPES).toHaveLength(31);
  });

  it('enumerates optimistic write results', () => {
    expect(WRITE_RESULTS).toEqual(['WRITE_ACCEPTED', 'WRITE_IDEMPOTENT', 'WRITE_CONFLICT', 'WRITE_STALE', 'WRITE_REJECTED']);
  });

  it('writes and reads a workspace record', () => {
    const store = createMemoryStore({ workspaceId: 'ws_model' });
    const receipt = store.writeWorkspace({ label: 'Season 1' });
    expect(receipt.result).toBe('WRITE_ACCEPTED');
    expect(store.readWorkspace()?.payload.label).toBe('Season 1');
  });

  it('writes and reads an episode record', () => {
    const store = createMemoryStore();
    expect(store.writeEpisode('EP001', { episodeNumber: 1 }).result).toBe('WRITE_ACCEPTED');
    expect(store.readEpisode('EP001')?.payload.episodeNumber).toBe(1);
  });

  it('writes and reads a production packet by episode id', () => {
    const store = createMemoryStore();
    expect(store.writeProductionPacket('EP012', { packetSha256: 'abc' }).result).toBe('WRITE_ACCEPTED');
    expect(store.readProductionPacket('EP012')?.payload.packetSha256).toBe('abc');
  });

  it('appends continuity facts as an aggregate', () => {
    const store = createMemoryStore();
    const receipt = store.appendContinuityFacts([
      { factId: 'SIGN::BAKERY::EP001', payload: { state: 'PIP_AND_GOAT_BAKERY' } },
    ]);
    expect(receipt.result).toBe('WRITE_ACCEPTED');
    expect(store.readRecord('CONTINUITY_FACT', 'SIGN::BAKERY::EP001')?.payload.state).toBe('PIP_AND_GOAT_BAKERY');
  });

  it('writes batch plans, job checkpoints, QC, delivery, and audit events', () => {
    const store = createMemoryStore();
    expect(store.writeBatchPlan({ units: 3 }).result).toBe('WRITE_ACCEPTED');
    expect(store.writeJobCheckpoint('job_1', { idempotencyKey: 'k1' }).result).toBe('WRITE_ACCEPTED');
    expect(store.writeQcReceipt('EP001', { passed: false }).result).toBe('WRITE_ACCEPTED');
    expect(store.writeDeliveryPackage('EP001', { readiness: 'QC_BLOCKED' }).result).toBe('WRITE_ACCEPTED');
    expect(store.appendAuditEvent({ action: 'note' }).result).toBe('WRITE_ACCEPTED');
    expect(store.readBatchPlan()?.payload.units).toBe(3);
    expect(store.readQcReceipt('EP001')?.payload.passed).toBe(false);
    expect(store.readDeliveryPackage('EP001')?.payload.readiness).toBe('QC_BLOCKED');
  });

  it('assigns id, workspaceId, schemaVersion, entityVersion, hash, timestamps, and revision', () => {
    const store = createMemoryStore({ workspaceId: 'ws_fields' });
    store.writeEpisode('EP002', { episodeNumber: 2 });
    const record = store.readEpisode('EP002');
    expect(record?.id).toBe('EPISODE:EP002');
    expect(record?.workspaceId).toBe('ws_fields');
    expect(record?.schemaVersion).toBe(PERSISTENCE_SCHEMA);
    expect(record?.entityVersion).toBe('1');
    expect(record?.dependencySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(record?.createdAt).toBe('1970-01-01T00:00:00.000Z');
    expect(record?.updatedAt).toBe('1970-01-01T00:00:00.000Z');
    expect(record?.revision).toBe(1);
  });

  it('does not persist commercial binary fields', () => {
    const store = createMemoryStore();
    store.writeRecord({
      entityType: 'APPROVED_ASSET_REFERENCE',
      entityId: 'AA_FOREST_HERO_TREE',
      payload: { objectKey: 'assets/forest.blend', byteSize: 12, sha256: 'aa' },
      expectedRevision: 0,
      eventType: 'ASSET_RESOLUTION_BOUND',
      reason: 'reference only',
    });
    const json = JSON.stringify(store.serialize());
    expect(json).not.toMatch(/blend\x00|PNG|commercial-bytes/);
    expect(store.readRecord('APPROVED_ASSET_REFERENCE', 'AA_FOREST_HERO_TREE')?.payload.objectKey).toBe('assets/forest.blend');
  });

  it('keeps Preview memory usable without a database', () => {
    const store = createMemoryStore();
    expect(store.mode).toBe('PREVIEW_MEMORY');
    expect(store.connected).toBe(true);
    expect(store.durable).toBe(false);
    expect(store.writeWorkspace({ ok: true }).result).toBe('WRITE_ACCEPTED');
  });

  it('treats Preview browser storage as durable within that adapter', () => {
    const directory = new Map<string, string>();
    const first = createFileStore(directory, { workspaceId: 'ws_browser' });
    first.writeWorkspace({ label: 'browser' });
    persistFileStore(first, directory);
    const second = createFileStore(directory, { workspaceId: 'ws_browser' });
    expect(second.durable).toBe(true);
    expect(second.readWorkspace()?.payload.label).toBe('browser');
  });

  it('reports PREVIEW_DATABASE NOT_CONNECTED when unconfigured', () => {
    const store = createPreviewDatabaseStore(false);
    const receipt = store.writeWorkspace({ label: 'nope' });
    expect(receipt.result).toBe('WRITE_REJECTED');
    expect(receipt.reason).toContain('NOT_CONNECTED');
    expect(store.readWorkspace()).toBeNull();
  });

  it('does not silently fall back from an unconfigured preview database', () => {
    const store = createPreviewDatabaseStore(false);
    store.writeEpisode('EP001', { episodeNumber: 1 });
    expect(store.listRecords()).toHaveLength(0);
    expect(store.getRevision()).toBe(0);
  });

  it('accepts writes on an explicitly configured preview database adapter', () => {
    const store = createPreviewDatabaseStore(true, { workspaceId: 'ws_preview_db' });
    expect(store.connected).toBe(true);
    expect(store.writeWorkspace({ label: 'configured' }).result).toBe('WRITE_ACCEPTED');
  });

  it('keeps PRODUCTION_DATABASE disconnected and rejected', () => {
    const store = createProductionDatabaseStore();
    expect(store.connected).toBe(false);
    expect(store.durable).toBe(false);
    expect(store.writeWorkspace({ label: 'prod' }).result).toBe('WRITE_REJECTED');
    expect(store.readWorkspace()).toBeNull();
  });

  it('never exposes a connection string on any adapter', () => {
    const stores = [
      createMemoryStore(),
      createPreviewDatabaseStore(false),
      createPreviewDatabaseStore(true),
      createProductionDatabaseStore(),
    ];
    for (const store of stores) {
      expect(JSON.stringify(store.serialize())).not.toMatch(/postgres(ql)?:\/\//);
    }
  });

  it('selects preview memory by default', () => {
    expect(selectPersistenceMode({})).toBe('PREVIEW_MEMORY');
  });

  it('does not auto-select production database unless preferred and configured', () => {
    expect(selectPersistenceMode({ prefer: 'PRODUCTION_DATABASE', productionDatabaseConfigured: false })).toBe('PREVIEW_MEMORY');
    expect(selectPersistenceMode({ prefer: 'PRODUCTION_DATABASE', productionDatabaseConfigured: true })).toBe('PRODUCTION_DATABASE');
  });

  it('maps durable prisma table names', () => {
    expect(durableTableNames()).toEqual(TIVVLEJOY_DURABLE_TABLES);
    expect(TIVVLEJOY_DURABLE_TABLES).toContain('tivvlejoy_durable_workspaces');
    expect(TIVVLEJOY_DURABLE_TABLES).toContain('tivvlejoy_durable_records');
    expect(TIVVLEJOY_DURABLE_TABLES).toContain('tivvlejoy_durable_events');
    expect(TIVVLEJOY_DURABLE_TABLES).toContain('tivvlejoy_durable_snapshots');
  });

  it('ships a local migration for durable tables', () => {
    const sql = readFileSync(
      path.resolve(__dirname, '../../../../packages/database/prisma/migrations', TIVVLEJOY_DURABLE_MIGRATION_NAME, 'migration.sql'),
      'utf8',
    );
    expect(sql).toContain('tivvlejoy_durable_workspaces');
    expect(sql).toContain('tivvlejoy_durable_records');
    expect(sql).toContain('dependency_sha256');
    expect(sql).not.toContain('BYTEA');
  });

  it('keeps durable records as JSON references rather than binary columns', () => {
    const schema = readFileSync(path.resolve(__dirname, '../../../../packages/database/prisma/schema.prisma'), 'utf8');
    expect(schema).toContain('model TivvleJoyDurableWorkspace');
    expect(schema).toContain('model TivvleJoyDurableRecord');
    expect(schema).toContain('model TivvleJoyDurableEvent');
    expect(schema).toContain('model TivvleJoyDurableSnapshot');
    expect(schema).toContain('@@map("tivvlejoy_durable_records")');
  });

  it('round-trips through a disposable file directory as a test database', () => {
    const directory = new Map<string, string>();
    const writer = createFileStore(directory, { workspaceId: 'ws_disposable' });
    writer.writeEpisode('EP003', { episodeNumber: 3, packetSha256: 'p' });
    persistFileStore(writer, directory);
    const hash = writer.workspaceSha256();
    const reader = createFileStore(directory, { workspaceId: 'ws_disposable' });
    expect(reader.readEpisode('EP003')?.payload.episodeNumber).toBe(3);
    expect(reader.workspaceSha256()).toBe(hash);
  });

  it('reconnects after the in-memory client is discarded', () => {
    const directory = new Map<string, string>();
    let store = createFileStore(directory, { workspaceId: 'ws_reconnect' });
    store.writeProductionPacket('EP004', { packetSha256: 'deadbeef' });
    persistFileStore(store, directory);
    const expected = store.readProductionPacket('EP004')?.dependencySha256;
    store = createFileStore(directory, { workspaceId: 'ws_reconnect' });
    expect(store.readProductionPacket('EP004')?.dependencySha256).toBe(expected);
  });

  it('stores only hashes for voice and asset references', () => {
    const store = createMemoryStore();
    store.writeRecord({
      entityType: 'VOICE_RECEIPT',
      entityId: 'voice_EP001',
      payload: { receiptSha256: 'a'.repeat(64), providerVoiceId: undefined },
      expectedRevision: 0,
      eventType: 'VOICE_RECEIPT_BOUND',
      reason: 'bind voice',
    });
    expect(JSON.stringify(store.readRecord('VOICE_RECEIPT', 'voice_EP001'))).not.toContain('elevenlabs');
  });

  it('increments workspace revision on accepted writes', () => {
    const store = createMemoryStore();
    expect(store.getRevision()).toBe(0);
    store.writeEpisode('EP005', { n: 5 });
    expect(store.getRevision()).toBe(1);
    store.writeEpisode('EP006', { n: 6 });
    expect(store.getRevision()).toBe(2);
  });

  it('keeps createdAt stable across updates', () => {
    const times = ['1970-01-01T00:00:00.000Z', '1970-01-02T00:00:00.000Z'];
    let index = 0;
    const store = createMemoryStore({ now: () => times[index++] ?? times[1]! });
    store.writeEpisode('EP007', { n: 1 });
    store.writeEpisode('EP007', { n: 2 });
    expect(store.readEpisode('EP007')?.createdAt).toBe('1970-01-01T00:00:00.000Z');
    expect(store.readEpisode('EP007')?.updatedAt).toBe('1970-01-02T00:00:00.000Z');
  });

  it('lists records and events without leaking adapter internals', () => {
    const store = createMemoryStore();
    store.writeWorkspace({ label: 'list' });
    expect(store.listRecords()[0]?.entityType).toBe('WORKSPACE');
    expect(store.listEvents()[0]?.eventType).toBe('WORKSPACE_SAVED');
    expect(JSON.stringify(store.listEvents())).not.toContain('DATABASE_URL');
  });

  it('writes an explicit state graph snapshot', () => {
    const store = createMemoryStore();
    store.writeEpisode('EP008', { n: 8 });
    const receipt = store.writeStateGraphSnapshot();
    expect(receipt.result).toBe('WRITE_ACCEPTED');
    expect(store.readStateGraphSnapshot()?.snapshotSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns null for missing episode, packet, QC, and delivery reads', () => {
    const store = createMemoryStore();
    expect(store.readEpisode('missing')).toBeNull();
    expect(store.readProductionPacket('missing')).toBeNull();
    expect(store.readQcReceipt('missing')).toBeNull();
    expect(store.readDeliveryPackage('missing')).toBeNull();
  });

  it('sanitizes secret keys before they are stored', () => {
    const store = createMemoryStore();
    store.writeWorkspace({ DATABASE_URL: 'postgresql://secret', label: 'safe' });
    expect(store.readWorkspace()?.payload.DATABASE_URL).toBe('[REDACTED]');
    expect(store.readWorkspace()?.payload.label).toBe('safe');
  });

  it('redacts signed URL values before they are stored', () => {
    const store = createMemoryStore();
    const receipt = store.writeWorkspace({
      note: 'https://bucket.example/obj?X-Amz-Signature=preview-placeholder',
    });
    expect(receipt.result).toBe('WRITE_ACCEPTED');
    expect(store.readWorkspace()?.payload.note).toBe('[REDACTED]');
  });

  it('does not claim durability for memory mode', () => {
    expect(createMemoryStore().durable).toBe(false);
  });

  it('does not open a production connection when the production adapter is constructed', () => {
    const store = createProductionDatabaseStore({ workspaceId: 'ws_prod' });
    expect(store.mode).toBe('PRODUCTION_DATABASE');
    expect(store.writeEpisode('EP009', { n: 9 }).reason).toMatch(/not connected/i);
  });

  it('keeps preview database error distinct from memory success', () => {
    const memory = createMemoryStore();
    const preview = createPreviewDatabaseStore(false);
    expect(memory.writeEpisode('EP010', { n: 10 }).result).toBe('WRITE_ACCEPTED');
    expect(preview.writeEpisode('EP010', { n: 10 }).result).toBe('WRITE_REJECTED');
  });

  it('supports script, location, visual approval, and render reference entities', () => {
    const store = createMemoryStore();
    for (const [entityType, entityId] of [
      ['SCRIPT_VERSION', 'script_EP001'],
      ['LOCATION_INSTANCE', 'bakery'],
      ['VISUAL_APPROVAL_REFERENCE', 'vis_1'],
      ['RENDER_PREFLIGHT_REFERENCE', 'pre_1'],
      ['RENDER_RECEIPT_REFERENCE', 'rr_1'],
    ] as const) {
      const receipt = store.writeRecord({
        entityType,
        entityId,
        payload: { ref: entityId },
        expectedRevision: store.getRevision(),
        eventType: 'WORKSPACE_SAVED',
        reason: `bind ${entityType}`,
      });
      expect(receipt.result).toBe('WRITE_ACCEPTED');
      expect(store.readRecord(entityType, entityId)?.payload.ref).toBe(entityId);
    }
  });

  it('stores production and season identities as references', () => {
    const store = createMemoryStore();
    store.writeRecord({
      entityType: 'PRODUCTION',
      entityId: 'prd_s01',
      payload: { seasonId: 'S01' },
      expectedRevision: 0,
      eventType: 'WORKSPACE_SAVED',
      reason: 'production',
    });
    store.writeRecord({
      entityType: 'SEASON',
      entityId: 'S01',
      payload: { episodeCount: 60 },
      expectedRevision: 1,
      eventType: 'WORKSPACE_SAVED',
      reason: 'season',
    });
    expect(store.readRecord('SEASON', 'S01')?.payload.episodeCount).toBe(60);
  });

  it('does not treat an unconfigured production preference as a connected database', () => {
    expect(selectPersistenceMode({ prefer: 'PRODUCTION_DATABASE' })).toBe('PREVIEW_MEMORY');
    expect(createProductionDatabaseStore().connected).toBe(false);
  });
});

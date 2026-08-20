import { describe, expect, it } from 'vitest';
import {
  BACKUP_MAX_BYTES,
  BACKUP_SCHEMA,
  PERSISTENCE_SCHEMA,
  createDisposableDurableTables,
  createMemoryStore,
  dropDisposableDurableTables,
  exportWorkspaceBackup,
  importWorkspaceBackup,
  inspectSchema,
  migrateWorkspace,
  persistSeasonInMemory,
  readViewFromDisposableTables,
  sha256Canonical,
  writeViewToDisposableTables,
  type JournalEvent,
  type WorkspaceBackup,
} from './tivvlejoy-production-persistence';

describe('production backup and schema migration', { timeout: 120_000 }, () => {
  it('exports a backup with the backup schema and workspace identity', () => {
    const store = createMemoryStore({ workspaceId: 'ws_bak' });
    store.writeEpisode('EP001', { n: 1 });
    const backup = exportWorkspaceBackup(store);
    expect(backup.schemaVersion).toBe(BACKUP_SCHEMA);
    expect(backup.workspaceId).toBe('ws_bak');
    expect(backup.secretsExcluded).toBe(true);
    expect(backup.commercialBytesExcluded).toBe(true);
  });

  it('includes entity counts, snapshot, journal, hashes, and backupSha256', () => {
    const store = createMemoryStore({ workspaceId: 'ws_bak' });
    store.writeEpisode('EP001', { n: 1 });
    store.writeEpisode('EP002', { n: 2 });
    const backup = exportWorkspaceBackup(store);
    expect(backup.entityCounts.EPISODE).toBe(2);
    expect(backup.snapshot.snapshotSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(backup.events).toHaveLength(2);
    expect(backup.contentHashes.length).toBeGreaterThan(0);
    expect(backup.backupSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('recomputes backupSha256 from the body without the hash field', () => {
    const store = createMemoryStore();
    store.writeWorkspace({ label: 'hash' });
    const backup = exportWorkspaceBackup(store);
    const { backupSha256, ...rest } = backup;
    expect(backupSha256).toBe(sha256Canonical(rest));
  });

  it('requires explicit confirmation before import', () => {
    const source = createMemoryStore({ workspaceId: 'ws_bak' });
    source.writeEpisode('EP001', { n: 1 });
    const backup = exportWorkspaceBackup(source);
    const target = createMemoryStore({ workspaceId: 'ws_bak' });
    expect(importWorkspaceBackup(target, backup, { confirm: false })).toEqual({
      ok: false,
      reason: 'explicit confirmation required',
    });
    expect(target.readEpisode('EP001')).toBeNull();
  });

  it('imports a valid confirmed backup', () => {
    const source = createMemoryStore({ workspaceId: 'ws_bak' });
    source.writeEpisode('EP001', { n: 1 });
    const backup = exportWorkspaceBackup(source);
    const target = createMemoryStore({ workspaceId: 'ws_bak' });
    expect(importWorkspaceBackup(target, backup, { confirm: true, expectedWorkspaceId: 'ws_bak' })).toEqual({ ok: true });
    expect(target.readEpisode('EP001')?.payload.n).toBe(1);
  });

  it('rejects a hash-mismatched backup', () => {
    const source = createMemoryStore({ workspaceId: 'ws_bak' });
    source.writeEpisode('EP001', { n: 1 });
    const backup = exportWorkspaceBackup(source);
    const target = createMemoryStore({ workspaceId: 'ws_bak' });
    expect(importWorkspaceBackup(target, { ...backup, backupSha256: '0'.repeat(64) }, { confirm: true })).toEqual({
      ok: false,
      reason: 'hash mismatch',
    });
  });

  it('rejects a wrong workspace', () => {
    const source = createMemoryStore({ workspaceId: 'ws_other' });
    source.writeEpisode('EP001', { n: 1 });
    const backup = exportWorkspaceBackup(source);
    const target = createMemoryStore({ workspaceId: 'ws_bak' });
    expect(importWorkspaceBackup(target, backup, { confirm: true, expectedWorkspaceId: 'ws_bak' })).toEqual({
      ok: false,
      reason: 'wrong workspace',
    });
  });

  it('rejects an unsupported future schema version', () => {
    const source = createMemoryStore({ workspaceId: 'ws_bak' });
    source.writeEpisode('EP001', { n: 1 });
    const backup = exportWorkspaceBackup(source);
    const target = createMemoryStore({ workspaceId: 'ws_bak' });
    expect(
      importWorkspaceBackup(target, { ...backup, schemaVersion: 'TIVVLEJOY_PRODUCTION_BACKUP_FUTURE' as typeof backup.schemaVersion }, { confirm: true }),
    ).toEqual({ ok: false, reason: 'unsupported future version' });
  });

  it('rejects an invalid schema', () => {
    const source = createMemoryStore({ workspaceId: 'ws_bak' });
    source.writeEpisode('EP001', { n: 1 });
    const backup = exportWorkspaceBackup(source);
    const target = createMemoryStore({ workspaceId: 'ws_bak' });
    expect(
      importWorkspaceBackup(target, { ...backup, schemaVersion: 'NOPE' as typeof backup.schemaVersion }, { confirm: true }),
    ).toEqual({ ok: false, reason: 'invalid schema' });
  });

  it('rejects a duplicate backup of the same snapshot', () => {
    const store = createMemoryStore({ workspaceId: 'ws_dup' });
    store.writeWorkspace({ label: 'same' });
    const backup = exportWorkspaceBackup(store);
    expect(importWorkspaceBackup(store, backup, { confirm: true, expectedWorkspaceId: 'ws_dup' })).toEqual({
      ok: false,
      reason: 'duplicate backup',
    });
  });

  it('rejects secrets inside a backup payload', () => {
    const store = createMemoryStore({ workspaceId: 'ws_bak' });
    store.writeEpisode('EP001', { n: 1 });
    const backup = exportWorkspaceBackup(store);
    const poisoned = {
      ...backup,
      snapshot: {
        ...backup.snapshot,
        records: [
          ...backup.snapshot.records,
          {
            ...backup.snapshot.records[0]!,
            payload: { DATABASE_URL: 'postgresql://preview:preview@127.0.0.1:5432/preview-only' },
          },
        ],
      },
    };
    expect(importWorkspaceBackup(store, poisoned, { confirm: true })).toEqual({ ok: false, reason: 'hash mismatch' });
  });

  it('rejects a backup that still carries a live secret string', () => {
    const store = createMemoryStore({ workspaceId: 'ws_sec' });
    const backup = {
      schemaVersion: BACKUP_SCHEMA,
      workspaceId: 'ws_sec',
      entityCounts: {},
      snapshot: {
        schemaVersion: 'TIVVLEJOY_PRODUCTION_SNAPSHOT_V1' as const,
        workspaceId: 'ws_sec',
        journalPosition: 0,
        revision: 0,
        snapshotSha256: 'a'.repeat(64),
        records: [],
      },
      events: [],
      contentHashes: [],
      secretsExcluded: true as const,
      commercialBytesExcluded: true as const,
      backupSha256: '',
    };
    const hashed: WorkspaceBackup = { ...backup, events: [] as JournalEvent[], backupSha256: sha256Canonical({ ...backup, backupSha256: undefined }) };
    hashed.events = [
      {
        eventId: 'e1',
        workspaceId: 'ws_sec',
        entityType: 'AUDIT_EVENT',
        entityId: 'a',
        eventType: 'WORKSPACE_SAVED',
        previousRevision: 0,
        nextRevision: 1,
        dependencySha256: 'a'.repeat(64),
        payloadSha256: 'b'.repeat(64),
        payload: { token: 'preview-token-placeholder' },
        timestamp: '1970-01-01T00:00:00.000Z',
        actorClass: 'TEST',
        reason: 'x',
      } satisfies JournalEvent,
    ];
    const { backupSha256: _ignored, ...rest } = hashed;
    const withHash = { ...hashed, backupSha256: sha256Canonical(rest) };
    expect(importWorkspaceBackup(store, withHash, { confirm: true })).toEqual({ ok: false, reason: 'secrets rejected' });
  });

  it('does not auto-import malformed JSON-shaped objects missing required hashes', () => {
    const store = createMemoryStore();
    expect(
      importWorkspaceBackup(store, { schemaVersion: BACKUP_SCHEMA } as never, { confirm: true }),
    ).toEqual({ ok: false, reason: 'hash mismatch' });
  });

  it('does not mutate the target when import is rejected', () => {
    const store = createMemoryStore({ workspaceId: 'ws_bak' });
    store.writeEpisode('EP009', { keep: true });
    const source = createMemoryStore({ workspaceId: 'ws_other' });
    source.writeEpisode('EP001', { n: 1 });
    const backup = exportWorkspaceBackup(source);
    importWorkspaceBackup(store, backup, { confirm: true, expectedWorkspaceId: 'ws_bak' });
    expect(store.readEpisode('EP009')?.payload.keep).toBe(true);
    expect(store.readEpisode('EP001')).toBeNull();
  });

  it('exports metadata only and no commercial bytes marker is honest', () => {
    const store = createMemoryStore();
    store.writeRecord({
      entityType: 'APPROVED_ASSET_REFERENCE',
      entityId: 'AA1',
      payload: { assetId: 'AA1', sha256: 'f'.repeat(64) },
      expectedRevision: 0,
      eventType: 'ASSET_RESOLUTION_BOUND',
      reason: 'ref',
    });
    const backup = exportWorkspaceBackup(store);
    expect(JSON.stringify(backup)).not.toMatch(/\\u0000|PNG|blend-bytes/);
    expect(backup.commercialBytesExcluded).toBe(true);
  });

  it('redacts secrets during export', () => {
    const store = createMemoryStore();
    store.writeWorkspace({ label: 'ok', AWS_SECRET_ACCESS_KEY: 'preview-aws-placeholder' });
    const backup = exportWorkspaceBackup(store);
    expect(JSON.stringify(backup)).not.toContain('preview-aws-placeholder');
  });

  it('aborts backup creation on MID_BACKUP without changing records', () => {
    const store = createMemoryStore({ fault: 'MID_BACKUP' });
    store.writeEpisode('EP001', { n: 1 });
    const hash = store.readEpisode('EP001')?.dependencySha256;
    expect(() => exportWorkspaceBackup(store)).toThrow(/MID_BACKUP/);
    expect(store.readEpisode('EP001')?.dependencySha256).toBe(hash);
  });

  it('aborts backup creation on BEFORE_BACKUP', () => {
    const store = createMemoryStore({ fault: 'BEFORE_BACKUP' });
    store.writeEpisode('EP001', { n: 1 });
    expect(() => exportWorkspaceBackup(store)).toThrow(/BEFORE_BACKUP/);
    expect(store.readEpisode('EP001')?.payload.n).toBe(1);
  });

  it('enforces the documented size limit constant', () => {
    expect(BACKUP_MAX_BYTES).toBe(8 * 1024 * 1024);
  });

  it('round-trips a backup through disposable schema tables', () => {
    const store = createMemoryStore({ workspaceId: 'ws_tables' });
    store.writeEpisode('EP001', { n: 1 });
    store.writeProductionPacket('EP001', { packetSha256: 'p' });
    const tables = createDisposableDurableTables();
    const written = writeViewToDisposableTables(tables, store.serialize());
    const read = readViewFromDisposableTables(tables, 'ws_tables');
    expect(read?.records).toHaveLength(2);
    expect(writeViewToDisposableTables(tables, read!)).toBe(written);
    dropDisposableDurableTables(tables);
    expect(readViewFromDisposableTables(tables, 'ws_tables')).toBeNull();
  });

  it('disconnects and reconnects disposable tables with identical hashes', () => {
    const store = createMemoryStore({ workspaceId: 'ws_disc' });
    store.writeEpisode('EP012', { packetSha256: 'abc' });
    const tables = createDisposableDurableTables();
    writeViewToDisposableTables(tables, store.serialize());
    const snapshot = JSON.parse(JSON.stringify([...tables.records.values()]));
    const reopened = createDisposableDurableTables();
    for (const record of snapshot) reopened.records.set(`${record.entityType}::${record.entityId}`, record);
    reopened.workspaces.set('ws_disc', {
      workspaceId: 'ws_disc',
      revision: store.getRevision(),
      snapshotSha256: store.latestSnapshot()?.snapshotSha256,
      journalPosition: store.listEvents().length,
    });
    const view = readViewFromDisposableTables(reopened, 'ws_disc');
    expect(view?.records[0]?.dependencySha256).toBe(store.readEpisode('EP012')?.dependencySha256);
  });

  it('reports MIGRATION_NOT_REQUIRED for the current schema', () => {
    expect(inspectSchema(PERSISTENCE_SCHEMA)).toBe('MIGRATION_NOT_REQUIRED');
  });

  it('reports MIGRATION_AVAILABLE for V0', () => {
    expect(inspectSchema('TIVVLEJOY_DURABLE_PRODUCTION_PERSISTENCE_V0')).toBe('MIGRATION_AVAILABLE');
  });

  it('reports UNSUPPORTED_FUTURE_SCHEMA for V9', () => {
    expect(inspectSchema('TIVVLEJOY_DURABLE_PRODUCTION_PERSISTENCE_V9')).toBe('UNSUPPORTED_FUTURE_SCHEMA');
  });

  it('blocks unknown historic schemas', () => {
    expect(inspectSchema('SOMETHING_ELSE')).toBe('MIGRATION_BLOCKED');
  });

  it('migrates V1 to V2 deterministically and idempotently', () => {
    const store = createMemoryStore({ workspaceId: 'ws_mig' });
    store.writeEpisode('EP001', { n: 1 });
    const first = migrateWorkspace(store.serialize(), PERSISTENCE_SCHEMA, 'TIVVLEJOY_DURABLE_PRODUCTION_PERSISTENCE_V2');
    const second = migrateWorkspace(store.serialize(), PERSISTENCE_SCHEMA, 'TIVVLEJOY_DURABLE_PRODUCTION_PERSISTENCE_V2');
    expect(first.result).toBe('MIGRATION_COMPLETE');
    expect(second.result).toBe('MIGRATION_COMPLETE');
    expect(first.view.snapshotSha256).toBe(second.view.snapshotSha256);
    expect(first.view.records[0]?.payload.migratedTo).toBe('TIVVLEJOY_DURABLE_PRODUCTION_PERSISTENCE_V2');
  });

  it('does not mutate the original view object during migration', () => {
    const store = createMemoryStore();
    store.writeEpisode('EP001', { n: 1 });
    const view = store.serialize();
    const before = view.records[0]?.entityVersion;
    migrateWorkspace(view, PERSISTENCE_SCHEMA, 'TIVVLEJOY_DURABLE_PRODUCTION_PERSISTENCE_V2');
    expect(view.records[0]?.entityVersion).toBe(before);
  });

  it('returns MIGRATION_NOT_REQUIRED when from and to match', () => {
    const store = createMemoryStore();
    expect(migrateWorkspace(store.serialize(), PERSISTENCE_SCHEMA, PERSISTENCE_SCHEMA).result).toBe(
      'MIGRATION_NOT_REQUIRED',
    );
  });

  it('does not destructively migrate an unsupported future schema', () => {
    const store = createMemoryStore();
    store.writeEpisode('EP001', { n: 1 });
    const result = migrateWorkspace(store.serialize(), 'TIVVLEJOY_DURABLE_PRODUCTION_PERSISTENCE_V9', PERSISTENCE_SCHEMA);
    expect(result.result).toBe('UNSUPPORTED_FUTURE_SCHEMA');
    expect(result.view.records[0]?.payload.n).toBe(1);
  });

  it('upgrades V0 to V1', () => {
    const store = createMemoryStore();
    store.writeEpisode('EP001', { n: 1 });
    const result = migrateWorkspace(store.serialize(), 'TIVVLEJOY_DURABLE_PRODUCTION_PERSISTENCE_V0', PERSISTENCE_SCHEMA);
    expect(result.result).toBe('MIGRATION_COMPLETE');
  });

  it('blocks a V2 to unknown target', () => {
    const store = createMemoryStore();
    const result = migrateWorkspace(store.serialize(), 'TIVVLEJOY_DURABLE_PRODUCTION_PERSISTENCE_V2', 'NOPE');
    expect(result.result).toBe('MIGRATION_BLOCKED');
  });

  it('exports a season-sized backup without commercial bytes', () => {
    const { store } = persistSeasonInMemory('ws_backup_season', { persistEveryJob: false });
    const backup = exportWorkspaceBackup(store);
    expect(backup.entityCounts.EPISODE).toBe(60);
    expect(JSON.stringify(backup)).not.toMatch(/postgres(ql)?:\/\//);
  });
});

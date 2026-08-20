import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertNoSecrets,
  buildPersistenceConsoleModel,
  buildPreviewPersistenceConsoleModel,
  containsSecret,
  createDirtyPersistenceState,
  createMemoryStore,
  createPreviewDatabaseStore,
  createProductionDatabaseStore,
  evaluatePersistenceHealth,
  exportWorkspaceBackup,
  hydrateStoreFromJson,
  markSaved,
  markSaving,
  markUnsaved,
  persistSeasonToStore,
  sanitizeForPersistence,
  shouldWarnBeforeUnload,
} from './tivvlejoy-production-persistence';

const SECRET_SAMPLES = {
  DATABASE_URL: 'postgresql://preview:preview@127.0.0.1:5432/preview-only',
  R2_SECRET: 'preview-r2-placeholder',
  AWS_SECRET_ACCESS_KEY: 'preview-aws-placeholder',
  RUNPOD_API_KEY: 'preview-runpod-placeholder',
  ELEVENLABS_API_KEY: 'preview-elevenlabs-placeholder',
  authorization: 'Bearer preview-authorization-placeholder',
  signedUrl: 'https://example.test/obj?X-Amz-Signature=preview',
  cookie: 'preview-cookie-placeholder',
  token: 'preview-token-placeholder',
};

describe('persistent operator control room and security', { timeout: 120_000 }, () => {
  it('builds a persistence console model without secrets', () => {
    const store = createMemoryStore({ workspaceId: 'ws_ui' });
    persistSeasonToStore(store, { persistEveryJob: false });
    const model = buildPersistenceConsoleModel(store);
    expect(model.schemaVersion).toBe('TIVVLEJOY_PERSISTENT_OPERATOR_CONTROL_ROOM_V1');
    expect(model.mode).toBe('PREVIEW_MEMORY');
    expect(model.durable).toBe('NO');
    expect(model.productionDatabase).toBe('NOT_CONNECTED');
    expect(model.episodeCount).toBe(60);
    expect(JSON.stringify(model)).not.toMatch(/postgres(ql)?:\/\/|Bearer |AKIA/);
    expect(model.secretsVisible).toBe(false);
  });

  it('shows preview database NOT_CONNECTED unless configured', () => {
    const model = buildPersistenceConsoleModel(createPreviewDatabaseStore(false));
    expect(model.previewDatabase).toBe('NOT_CONNECTED');
    expect(model.health).toBe('NOT_CONFIGURED');
  });

  it('shows preview database CONNECTED only when configured', () => {
    const model = buildPersistenceConsoleModel(createPreviewDatabaseStore(true));
    expect(model.previewDatabase).toBe('CONNECTED');
  });

  it('never reports a connected Production database from the production adapter', () => {
    const model = buildPersistenceConsoleModel(createProductionDatabaseStore());
    expect(model.productionDatabase).toBe('NOT_CONNECTED');
    expect(model.health).toBe('UNAVAILABLE');
  });

  it('exposes revision, snapshot hash, journal count, conflicts, and backup availability', () => {
    const store = createMemoryStore();
    store.writeEpisode('EP012', { n: 12 });
    store.writeEpisode('EP013', { n: 13 }, 0);
    const model = buildPersistenceConsoleModel(store);
    expect(model.workspaceRevision).toBeGreaterThan(0);
    expect(model.latestSnapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(model.journalEventCount).toBeGreaterThan(0);
    expect(model.pendingWriteConflicts).toBe(1);
    expect(model.backupAvailable).toBe(true);
  });

  it('marks in-memory populated stores as degraded, not durable Production', () => {
    const store = createMemoryStore();
    store.writeWorkspace({ label: 'preview' });
    expect(evaluatePersistenceHealth(store).health).toBe('DEGRADED');
    expect(evaluatePersistenceHealth(store).durable).toBe(false);
  });

  it('returns HEALTHY for an empty memory adapter', () => {
    expect(evaluatePersistenceHealth(createMemoryStore()).health).toBe('HEALTHY');
  });

  it('returns CONFLICTED after a lost-update attempt', () => {
    const store = createMemoryStore();
    store.writeEpisode('EP001', { n: 1 });
    store.writeEpisode('EP002', { n: 2 }, 0);
    expect(evaluatePersistenceHealth(store).health).toBe('CONFLICTED');
  });

  it('does not mutate Production during a production-mode health check', () => {
    const store = createProductionDatabaseStore();
    const health = evaluatePersistenceHealth(store);
    expect(health.health).toBe('UNAVAILABLE');
    expect(store.getRevision()).toBe(0);
    expect(store.listRecords()).toHaveLength(0);
  });

  it('tracks dirty Preview save states honestly', () => {
    let state = createDirtyPersistenceState();
    expect(state.saveStatus).toBe('Saved');
    state = markUnsaved(state);
    expect(state.saveStatus).toBe('Unsaved changes');
    expect(shouldWarnBeforeUnload(state)).toBe(true);
    state = markSaving(state);
    expect(state.saveStatus).toBe('Saving');
    state = markSaved(state, { result: 'WRITE_ACCEPTED', revision: 3, dependencySha256: 'a'.repeat(64) });
    expect(state.saveStatus).toBe('Saved');
    expect(state.dirty).toBe(false);
    expect(shouldWarnBeforeUnload(state)).toBe(false);
  });

  it('does not claim Saved without a persistence receipt', () => {
    const state = markSaving(markUnsaved(createDirtyPersistenceState()));
    expect(state.saveStatus).not.toBe('Saved');
  });

  it('maps WRITE_CONFLICT to Conflict detected', () => {
    const state = markSaved(markUnsaved(createDirtyPersistenceState()), {
      result: 'WRITE_CONFLICT',
      revision: 1,
      dependencySha256: 'a'.repeat(64),
    });
    expect(state.saveStatus).toBe('Conflict detected');
    expect(state.dirty).toBe(true);
  });

  it('maps WRITE_REJECTED to Save failed', () => {
    const state = markSaved(createDirtyPersistenceState(), {
      result: 'WRITE_REJECTED',
      revision: 0,
      dependencySha256: 'a'.repeat(64),
    });
    expect(state.saveStatus).toBe('Save failed');
  });

  it('redacts every required secret class', () => {
    const sanitized = sanitizeForPersistence(SECRET_SAMPLES);
    expect(sanitized.DATABASE_URL).toBe('[REDACTED]');
    expect(sanitized.R2_SECRET).toBe('[REDACTED]');
    expect(sanitized.AWS_SECRET_ACCESS_KEY).toBe('[REDACTED]');
    expect(sanitized.RUNPOD_API_KEY).toBe('[REDACTED]');
    expect(sanitized.ELEVENLABS_API_KEY).toBe('[REDACTED]');
    expect(sanitized.authorization).toBe('[REDACTED]');
    expect(sanitized.signedUrl).toBe('[REDACTED]');
    expect(sanitized.cookie).toBe('[REDACTED]');
    expect(sanitized.token).toBe('[REDACTED]');
    expect(containsSecret(SECRET_SAMPLES)).toBe(true);
    expect(containsSecret(sanitized)).toBe(false);
  });

  it('rejects leftover secrets through assertNoSecrets', () => {
    expect(() => assertNoSecrets({ DATABASE_URL: 'postgresql://x' }, 'client JSON')).toThrow(/secrets/);
  });

  it('keeps backups and journals free of secret values', () => {
    const store = createMemoryStore();
    store.writeWorkspace({
      label: 'preview',
      DATABASE_URL: SECRET_SAMPLES.DATABASE_URL,
      RUNPOD_API_KEY: SECRET_SAMPLES.RUNPOD_API_KEY,
    });
    const backup = exportWorkspaceBackup(store);
    const blob = JSON.stringify({ backup, events: store.listEvents(), view: store.serialize() });
    expect(blob).not.toContain('preview:preview');
    expect(blob).not.toContain('preview-runpod-placeholder');
    expect(blob).not.toContain('Bearer preview-authorization-placeholder');
  });

  it('keeps the Production Control UI free of connect-production and create-database actions', () => {
    const ui = readFileSync(path.resolve(__dirname, '../components/preview/ProductionStudioConsole.tsx'), 'utf8');
    expect(ui).toContain('Persistence');
    expect(ui).toContain('Export Backup');
    expect(ui).toContain('Import Backup');
    expect(ui).toContain('Refresh State');
    expect(ui).toContain('Validate Persistence');
    expect(ui).toContain('Durable:');
    expect(ui).toContain('Production database: NOT_CONNECTED');
    expect(ui).not.toMatch(/Connect Production|Create database|DATABASE_URL|RunPod API|ElevenLabs/);
  });

  it('wires /production-control to the persistence console model', () => {
    const page = readFileSync(path.resolve(__dirname, '../app/production-control/page.tsx'), 'utf8');
    expect(page).toContain('buildPreviewPersistenceConsoleModel');
    expect(page).toContain('persistence={persistence}');
  });

  it('statically forbids secret assignment in the persistence module', () => {
    const dir = path.resolve(__dirname, 'tivvlejoy-production-persistence');
    const files = [
      'sanitizer.ts',
      'store.ts',
      'backup.ts',
      'console-model.ts',
      'health.ts',
      'adapters.ts',
    ];
    for (const file of files) {
      const source = readFileSync(path.join(dir, file), 'utf8');
      expect(source).not.toMatch(/process\.env\.DATABASE_URL\s*=/);
      expect(source).not.toMatch(/process\.env\.RUNPOD/);
      expect(source).not.toMatch(/sk-live-/);
    }
  });

  it('completes a Season 1 / Episode 12 operator round trip after reload', () => {
    const store = createMemoryStore({ workspaceId: 'ws_roundtrip' });
    persistSeasonToStore(store, { persistEveryJob: false });
    expect(store.readRecord('SEASON', 'S01')).toBeTruthy();
    expect(store.readEpisode('EP012')?.payload.episodeNumber).toBe(12);
    expect(store.readProductionPacket('EP012')?.payload.packetSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(store.listRecords().some((record) => record.entityType === 'CONTINUITY_FACT')).toBe(true);
    expect(store.readBatchPlan()).toBeTruthy();
    expect(store.readRecord('RECOVERY_CHECKPOINT', 'chk_EP012')).toBeTruthy();
    expect(store.readQcReceipt('EP012')?.payload.passed).toBe(false);
    expect(store.readDeliveryPackage('EP012')?.payload.readiness).toBe('QC_BLOCKED');
    const model = buildPersistenceConsoleModel(store);
    expect(model.episodeCount).toBe(60);
    const reloaded = hydrateStoreFromJson(JSON.stringify(store.serialize()), 'PREVIEW_MEMORY');
    const after = buildPersistenceConsoleModel(reloaded);
    expect(after.workspaceRevision).toBe(model.workspaceRevision);
    expect(after.latestSnapshotHash).toBe(model.latestSnapshotHash);
    expect(reloaded.readProductionPacket('EP012')?.payload.packetSha256).toBe(
      store.readProductionPacket('EP012')?.payload.packetSha256,
    );
  });

  it('after a dependency mutation, only the mutated record hash changes on reload', () => {
    const store = createMemoryStore({ workspaceId: 'ws_roundtrip_mut' });
    persistSeasonToStore(store, { persistEveryJob: false });
    const packetBefore = store.readProductionPacket('EP012')?.dependencySha256;
    const episodeBefore = store.readEpisode('EP011')?.dependencySha256;
    store.writeRecord({
      entityType: 'APPROVED_ASSET_REFERENCE',
      entityId: 'AA_FOREST_HERO_TREE',
      payload: { approvedAssetId: 'AA_FOREST_HERO_TREE', mutated: true },
      expectedRevision: store.getRevision(),
      eventType: 'ASSET_RESOLUTION_BOUND',
      reason: 'mutate one dependency',
    });
    const reloaded = hydrateStoreFromJson(JSON.stringify(store.serialize()), 'PREVIEW_MEMORY');
    expect(reloaded.readProductionPacket('EP012')?.dependencySha256).toBe(packetBefore);
    expect(reloaded.readEpisode('EP011')?.dependencySha256).toBe(episodeBefore);
    expect(reloaded.readRecord('APPROVED_ASSET_REFERENCE', 'AA_FOREST_HERO_TREE')?.payload.mutated).toBe(true);
  });

  it('cached preview console model matches a freshly persisted workspace count', () => {
    const preview = buildPreviewPersistenceConsoleModel();
    expect(preview.episodeCount).toBe(60);
    expect(preview.mode).toBe('PREVIEW_MEMORY');
    expect(preview.durable).toBe('NO');
  });

  it('warns on unsaved Preview import drafts', () => {
    expect(shouldWarnBeforeUnload(markUnsaved(createDirtyPersistenceState()))).toBe(true);
  });

  it('redacts nested secret objects used in client JSON', () => {
    const json = sanitizeForPersistence({
      headers: { Authorization: 'Bearer preview-authorization-placeholder' },
      env: { ELEVENLABS_API_KEY: 'preview-elevenlabs-placeholder' },
    });
    expect(JSON.stringify(json)).not.toContain('preview-authorization-placeholder');
    expect(JSON.stringify(json)).not.toContain('preview-elevenlabs-placeholder');
  });

  it('does not treat ordinary production labels as secrets', () => {
    expect(containsSecret({ label: 'Season 1 bakery continuity' })).toBe(false);
  });
});

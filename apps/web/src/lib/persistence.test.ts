import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { currentStage, evaluateTheatricalGate } from '@doodle-dash/direction';
import {
  evaluatePaidResourcePolicy,
  planSteps9To16Infrastructure,
  planStudioCompletion25To32Infrastructure,
} from '@doodle-dash/preproduction';
import { PREVIEW_STORAGE_KEY } from './preview-workspace/types';
import {
  createPreviewEpisode,
  createPreviewRenderRequest,
  registerPreviewAsset,
  savePreviewSettings,
  savePreviewVoiceProfile,
} from './preview-workspace/service';
import { loadPreviewWorkspace, memoryBackend } from './preview-workspace/store';
import {
  TIVVLEJOY_BACKUP_KIND,
  TIVVLEJOY_BACKUP_MAX_BYTES,
  TIVVLEJOY_PERSISTENCE_RELATIONSHIPS,
  assertBackupSize,
  assertPreviewAdapterPreservesKey,
  assertProductionActionsBlocked,
  createPreviewPersistenceAdapter,
  createProductionPersistenceAdapter,
  exportPreviewBackup,
  importPreviewBackup,
  parsePreviewBackup,
  readSafePersistenceSnapshot,
  resolvePersistenceAdapter,
  serializePreviewBackup,
  validatePersistenceEnvironment,
} from './persistence';

const repoRoot = path.resolve(__dirname, '../../../..');

function readRepo(relative: string) {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

function seededBackend() {
  const backend = memoryBackend();
  savePreviewSettings({ projectName: 'Persist QA Studio' }, backend);
  createPreviewEpisode(
    { title: 'Map Walk', episodeNumber: 1, durationSec: 30, premise: 'Backup and reload.' },
    backend,
  );
  registerPreviewAsset({ name: 'Stand-in', type: 'ENVIRONMENT', version: 'v1' }, backend);
  savePreviewVoiceProfile({ characterLabel: 'A', displayName: 'Warm preview' }, backend);
  return backend;
}

describe('persistence adapters', () => {
  it('reads Preview workspace records through the localStorage adapter', () => {
    const backend = seededBackend();
    const adapter = createPreviewPersistenceAdapter(backend);
    const snapshot = adapter.readSnapshot();
    expect(adapter.id).toBe('preview-localStorage');
    expect(adapter.durable).toBe(false);
    expect(snapshot.settings?.projectName).toBe('Persist QA Studio');
    expect(snapshot.productions).toHaveLength(1);
    expect(snapshot.episodes[0]?.title).toBe('Map Walk');
    expect(snapshot.assets[0]?.canonical).toBe(false);
    expect(snapshot.assets[0]?.objectKey).toBeNull();
    expect(snapshot.voices[0]?.providerVoiceId).toBeNull();
    expect(snapshot.voices[0]?.consent.voiceCloningAuthorized).toBe(false);
    expect(snapshot.workflows[0]?.currentStage).toBe('BRIEF');
    expect(snapshot.readiness?.productionReady).toBe(false);
    expect(snapshot.renderRequests).toEqual([]);
    adapter.assertWritable();
  });

  it('reloads the same Preview snapshot from the same storage key', () => {
    const backend = seededBackend();
    const first = createPreviewPersistenceAdapter(backend).readSnapshot();
    const second = createPreviewPersistenceAdapter(backend).readSnapshot();
    expect(PREVIEW_STORAGE_KEY).toBe('tivvlejoy.preview-workspace.v1');
    assertPreviewAdapterPreservesKey(PREVIEW_STORAGE_KEY);
    expect(second.episodes[0]?.id).toBe(first.episodes[0]?.id);
    expect(second.settings?.projectName).toBe(first.settings?.projectName);
    expect(loadPreviewWorkspace(backend).kind).toBe('PREVIEW_WORKSPACE');
  });

  it('keeps the production adapter as a disconnected boundary', () => {
    const adapter = createProductionPersistenceAdapter();
    expect(adapter.id).toBe('production-database');
    expect(adapter.durable).toBe(false);
    expect(adapter.readSnapshot().episodes).toEqual([]);
    assertProductionActionsBlocked(adapter);
    expect(() =>
      adapter.writeAudit({
        workspaceId: 'ws',
        action: 'render',
        entityType: 'gpu',
        entityId: null,
        detail: {},
      }),
    ).toThrowError(/not connected/i);
  });

  it('resolves Preview when DATABASE_URL is absent and production when present', () => {
    const backend = memoryBackend();
    expect(resolvePersistenceAdapter(backend, {}).id).toBe('preview-localStorage');
    expect(resolvePersistenceAdapter(backend, { DATABASE_URL: 'postgresql://local' }).id).toBe(
      'production-database',
    );
  });
});

describe('environment separation and secret leakage', () => {
  it('validates DATABASE_URL, durable storage, and provider mode without returning secrets', () => {
    const secretUrl = 'postgresql://preview:supersecret-password@db.internal:5432/tivvlejoy';
    const validation = validatePersistenceEnvironment({
      DATABASE_URL: secretUrl,
      DURABLE_STORAGE_BUCKET: 'studio-assets',
      DURABLE_STORAGE_ENDPOINT: 'https://storage.example',
      DURABLE_STORAGE_REGION: 'auto',
      DURABLE_STORAGE_ACCESS_KEY_ID: 'AKIAEXAMPLE',
      DURABLE_STORAGE_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG',
      PROVIDER_MODE: 'production',
      TIVVLEJOY_CONNECT_PRODUCTION: '1',
    });
    const dumped = JSON.stringify(validation);
    expect(dumped).not.toContain('supersecret-password');
    expect(dumped).not.toContain('wJalrXUtnFEMI');
    expect(dumped).not.toContain(secretUrl);
    expect(validation.productionConnectAuthorized).toBe(false);
    expect(validation.safe.productionActions).toBe('blocked');
    expect(validation.safe.dataDurability).toBe('browser-only-non-durable');
    expect(validation.safe.productionDatabase).toBe('configured_not_connected');
    expect(validation.safe.durableStorage).toBe('configured_not_connected');
    expect(validation.checks.every((check) => !('value' in check))).toBe(true);
  });

  it('keeps public Preview available when production configuration is absent', () => {
    const safe = readSafePersistenceSnapshot({});
    expect(safe.mode).toBe('preview');
    expect(safe.previewWorkspace).toBe('available');
    expect(safe.productionDatabase).toBe('not_connected');
    expect(safe.durableStorage).toBe('not_configured');
    expect(safe.providerMode).toBe('preview');
    expect(safe.productionActions).toBe('blocked');
  });

  it('does not import Prisma or paid SDKs from the persistence boundary', () => {
    const production = readRepo('apps/web/src/lib/persistence/production-adapter.ts');
    const env = readRepo('apps/web/src/lib/persistence/env.ts');
    const index = readRepo('apps/web/src/lib/persistence/index.ts');
    for (const source of [production, env, index]) {
      expect(source).not.toContain('@prisma/client');
      expect(source).not.toContain('@doodle-dash/database');
      expect(source).not.toContain('elevenlabs');
      expect(source).not.toContain('runpod');
      expect(source).not.toMatch(/sk-[A-Za-z0-9]/);
    }
  });
});

describe('Preview export and import', () => {
  it('exports a versioned backup and imports it after confirmation', () => {
    const backend = seededBackend();
    const episode = loadPreviewWorkspace(backend).episodes[0];
    createPreviewRenderRequest(episode.id, backend);
    const backup = exportPreviewBackup(backend);
    expect(backup.kind).toBe(TIVVLEJOY_BACKUP_KIND);
    expect(backup.version).toBe(1);
    expect(backup.workspace.episodes[0]?.title).toBe('Map Walk');
    const serialized = serializePreviewBackup(backup);
    const other = memoryBackend();
    const imported = importPreviewBackup(serialized, other, { confirm: true });
    expect(imported.episodes[0]?.title).toBe('Map Walk');
    expect(imported.renderRequests[0]?.status).toBe('NOT_RENDERED');
    expect(imported.durable).toBe(false);
    expect(loadPreviewWorkspace(other).assets[0]?.name).toBe('Stand-in');
  });

  it('refuses unconfirmed, malformed, wrong-version, and oversized backups', () => {
    const backend = memoryBackend();
    expect(() => importPreviewBackup('{}', backend, { confirm: false })).toThrowError(/cancelled/i);
    expect(() => parsePreviewBackup('{')).toThrowError(/not valid JSON/i);
    expect(() => parsePreviewBackup(JSON.stringify({ kind: 'NOPE', version: 1, exportedAt: 'x', workspace: {} }))).toThrowError(
      /schema or version/i,
    );
    expect(() =>
      parsePreviewBackup(
        JSON.stringify({
          kind: TIVVLEJOY_BACKUP_KIND,
          version: 99,
          exportedAt: '2026-01-01T00:00:00.000Z',
          workspace: {},
        }),
      ),
    ).toThrowError(/schema or version/i);
    expect(() => assertBackupSize(TIVVLEJOY_BACKUP_MAX_BYTES + 1)).toThrowError(/too large/i);
    expect(() => parsePreviewBackup('{"kind":"TIVVLEJOY_PREVIEW_BACKUP"}', TIVVLEJOY_BACKUP_MAX_BYTES + 8)).toThrowError(
      /too large/i,
    );
  });
});

describe('schema relationships and closed production actions', () => {
  it('documents the TivvleJoy table relationships', () => {
    expect(TIVVLEJOY_PERSISTENCE_RELATIONSHIPS.length).toBeGreaterThanOrEqual(8);
    const schema = readRepo('packages/database/prisma/schema.prisma');
    const migration = readRepo(
      'packages/database/prisma/migrations/20260817010000_tivvlejoy_persistence_foundation/migration.sql',
    );
    for (const table of [
      'tivvlejoy_workspaces',
      'tivvlejoy_productions',
      'tivvlejoy_episodes',
      'tivvlejoy_assets',
      'tivvlejoy_voice_profiles',
      'tivvlejoy_workflow_statuses',
      'tivvlejoy_readiness_results',
      'tivvlejoy_render_requests',
      'tivvlejoy_audit_events',
    ]) {
      expect(schema).toContain(`@@map("${table}")`);
      expect(migration).toContain(`CREATE TABLE "${table}"`);
    }
    expect(schema).toContain('consentVoiceCloningAuthorized');
    expect(migration).not.toContain('production-library');
  });

  it('keeps gates closed and paid work unauthorized', () => {
    expect(currentStage().id).toBe('DDP_STEPS_1_8');
    expect(evaluateTheatricalGate().allowed).toBe(false);
    expect(planSteps9To16Infrastructure().opened).toBe(false);
    expect(planStudioCompletion25To32Infrastructure().opened).toBe(false);
    expect(evaluatePaidResourcePolicy({ allowPaidGpu: true, estimateUsd: 1 }).allowed).toBe(false);
    expect(readRepo('apps/web/src/components/preview/PreviewBackupControls.tsx')).toContain(
      'Export Preview Backup',
    );
    expect(readRepo('apps/web/src/components/preview/PreviewBackupControls.tsx')).toContain(
      'Import Preview Backup',
    );
  });
});

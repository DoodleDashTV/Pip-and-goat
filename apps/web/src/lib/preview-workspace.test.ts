import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { currentStage, evaluateTheatricalGate } from '@doodle-dash/direction';
import {
  evaluatePaidResourcePolicy,
  planSteps9To16Infrastructure,
  planStudioCompletion25To32Infrastructure,
} from '@doodle-dash/preproduction';
import { isPublicWebsitePreview } from './public-preview';
import {
  PREVIEW_DRAFT_STAGES,
  PREVIEW_WORKSPACE_KIND,
  advancePreviewEpisode,
  assertProductionPersistenceAvailable,
  calculatePreviewReadiness,
  canAdvancePreviewStage,
  createPreviewEpisode,
  createPreviewRenderRequest,
  emptyPreviewWorkspace,
  loadPreviewWorkspace,
  memoryBackend,
  previewSafetySnapshot,
  registerPreviewAsset,
  resetPreviewStudio,
  savePreviewSettings,
  savePreviewVoiceProfile,
  PreviewWorkspaceError,
} from './preview-workspace';

const repoRoot = path.resolve(__dirname, '../../../..');

function readRepo(relative: string) {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

function seededBackend() {
  const backend = memoryBackend();
  savePreviewSettings({ projectName: 'Preview QA Studio' }, backend);
  return backend;
}

describe('Preview workspace initialization', () => {
  it('starts empty, labeled, and non-durable', () => {
    const workspace = emptyPreviewWorkspace();
    expect(workspace.kind).toBe(PREVIEW_WORKSPACE_KIND);
    expect(workspace.durable).toBe(false);
    expect(workspace.label).toContain('this browser only');
    expect(workspace.settings.format).toBe('1080x1920');
    expect(workspace.settings.fps).toBe(30);
    expect(workspace.settings.paidResourcesAuthorized).toBe(false);
    expect(workspace.settings.theatricalBindingCompleted).toBe(false);
    expect(workspace.episodes).toEqual([]);
  });

  it('saves and reloads production settings through the Preview adapter', () => {
    const backend = memoryBackend();
    const saved = savePreviewSettings({ projectName: 'Joy Shorts Preview' }, backend);
    expect(saved.settingsSaved).toBe(true);
    expect(saved.settings.projectName).toBe('Joy Shorts Preview');
    expect(saved.settings.format).toBe('1080x1920');
    expect(saved.settings.paidResourcesAuthorized).toBe(false);
    const reloaded = savePreviewSettings({ projectName: 'Joy Shorts Preview' }, backend);
    expect(reloaded.settings.projectName).toBe('Joy Shorts Preview');
  });
});

describe('Preview episode creation', () => {
  it('validates required fields', () => {
    const backend = seededBackend();
    expect(() =>
      createPreviewEpisode({ title: '', episodeNumber: 1, durationSec: 30, premise: 'x' }, backend),
    ).toThrowError(/Title/);
    expect(() =>
      createPreviewEpisode({ title: 'A', episodeNumber: 0, durationSec: 30, premise: 'x' }, backend),
    ).toThrowError(/Episode number/);
    expect(() =>
      createPreviewEpisode({ title: 'A', episodeNumber: 1, durationSec: 12, premise: 'x' }, backend),
    ).toThrowError(/Duration/);
  });

  it('creates a Preview episode and prevents duplicate submissions', () => {
    const backend = seededBackend();
    const first = createPreviewEpisode(
      { title: 'Map Walk', episodeNumber: 1, durationSec: 30, premise: 'A draft walk.' },
      backend,
    );
    expect(first.episode.classification).toBe('PREVIEW_NONCANONICAL');
    expect(first.episode.currentStage).toBe('BRIEF');
    expect(() =>
      createPreviewEpisode(
        { title: 'Map Walk', episodeNumber: 1, durationSec: 30, premise: 'A draft walk.' },
        backend,
      ),
    ).toThrow(PreviewWorkspaceError);
    expect(() =>
      createPreviewEpisode(
        { title: 'Other', episodeNumber: 1, durationSec: 15, premise: 'Different' },
        backend,
      ),
    ).toThrowError(/already exists/);
  });
});

describe('Preview assets, voices, workflow, readiness, and render requests', () => {
  it('registers metadata-only assets that are never canonical', () => {
    const backend = seededBackend();
    const { asset } = registerPreviewAsset(
      { name: 'Preview meadow', type: 'ENVIRONMENT', version: 'v1' },
      backend,
    );
    expect(asset.canonical).toBe(false);
    expect(asset.status).toBe('REGISTERED_METADATA_ONLY');
    expect(asset.classification).toBe('PREVIEW_NONCANONICAL');
  });

  it('saves a voice profile without a provider voice ID or audition', () => {
    const backend = seededBackend();
    const { voice } = savePreviewVoiceProfile(
      { characterLabel: 'Occupant A', displayName: 'Warm preview' },
      backend,
    );
    expect(voice.providerVoiceId).toBeNull();
    expect(voice.auditionAvailable).toBe(false);
  });

  it('enforces workflow prerequisites and stops before forbidden stages', () => {
    const backend = seededBackend();
    const { episode } = createPreviewEpisode(
      { title: 'Map Walk', episodeNumber: 1, durationSec: 30, premise: 'A draft walk.' },
      backend,
    );
    let current = episode;
    while (current.currentStage !== 'SHOTS') {
      current = advancePreviewEpisode(current.id, backend).episode;
    }
    expect(current.currentStage).toBe('SHOTS');
    const blocked = canAdvancePreviewStage(loadFrom(backend), current);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toMatch(/asset/);
    registerPreviewAsset({ name: 'Stand-in', type: 'PROP', version: 'v1' }, backend);
    current = advancePreviewEpisode(current.id, backend).episode;
    expect(current.currentStage).toBe('LIBRARY');
    expect(canAdvancePreviewStage(loadFrom(backend), current).allowed).toBe(false);
    savePreviewVoiceProfile({ characterLabel: 'A', displayName: 'Voice' }, backend);
    current = advancePreviewEpisode(current.id, backend).episode;
    expect(current.currentStage).toBe('AUDIO');
    while (current.currentStage !== 'OUTPUT_GATE') {
      current = advancePreviewEpisode(current.id, backend).episode;
    }
    expect(current.currentStage).toBe('OUTPUT_GATE');
    expect(() => advancePreviewEpisode(current.id, backend)).toThrowError(/OUTPUT_GATE|closed/i);
    expect(PREVIEW_DRAFT_STAGES).not.toContain('FINAL_RENDER');
    expect(PREVIEW_DRAFT_STAGES).not.toContain('THEATRICAL');
  });

  it('calculates readiness from saved Preview data and never reports production-ready', () => {
    const backend = memoryBackend();
    let readiness = calculatePreviewReadiness(emptyPreviewWorkspace());
    expect(readiness.productionReady).toBe(false);
    expect(readiness.items.find((item) => item.id === 'episode')?.state).toBe('MISSING');
    savePreviewSettings({ projectName: 'Ready Check' }, backend);
    createPreviewEpisode(
      { title: 'Map Walk', episodeNumber: 2, durationSec: 15, premise: 'Check readiness.' },
      backend,
    );
    registerPreviewAsset({ name: 'Stand-in', type: 'OTHER', version: 'v1' }, backend);
    savePreviewVoiceProfile({ characterLabel: 'A', displayName: 'Voice' }, backend);
    readiness = calculatePreviewReadiness(loadFrom(backend));
    expect(readiness.productionReady).toBe(false);
    expect(readiness.items.find((item) => item.id === 'settings')?.state).toBe('READY');
    expect(readiness.items.find((item) => item.id === 'theatrical')?.state).toBe('CLOSED');
    expect(readiness.items.find((item) => item.id === 'paid')?.state).toBe('CLOSED');
    expect(readiness.items.find((item) => item.id === 'render')?.state).toBe('CLOSED');
  });

  it('records a draft render request without contacting a provider', () => {
    const backend = seededBackend();
    const { episode } = createPreviewEpisode(
      { title: 'Map Walk', episodeNumber: 3, durationSec: 45, premise: 'Draft request only.' },
      backend,
    );
    const { request } = createPreviewRenderRequest(episode.id, backend);
    expect(request.label).toBe('Draft request — not rendered');
    expect(request.status).toBe('NOT_RENDERED');
    expect(request.contactedProvider).toBe(false);
    expect(request.outputFile).toBeNull();
    expect(request.progress).toBeNull();
  });
});

describe('Production fail-closed and closed gates', () => {
  it('refuses to treat Preview as a silent production fallback', () => {
    expect(() => assertProductionPersistenceAvailable({})).toThrowError(
      /Production persistence is unavailable/,
    );
    expect(() => assertProductionPersistenceAvailable({ DATABASE_URL: 'postgresql://local' })).not.toThrow();
    expect(isPublicWebsitePreview({})).toBe(true);
    expect(isPublicWebsitePreview({ DATABASE_URL: 'postgresql://local' })).toBe(false);
  });

  it('keeps paid resources unauthorized and theatrical gates closed', () => {
    const safety = previewSafetySnapshot();
    expect(safety.stageId).toBe('DDP_STEPS_1_8');
    expect(safety.theatricalAllowed).toBe(false);
    expect(safety.steps9to16Opened).toBe(false);
    expect(safety.steps25to32Opened).toBe(false);
    expect(safety.paidAllowed).toBe(false);
    expect(currentStage().id).toBe('DDP_STEPS_1_8');
    expect(evaluateTheatricalGate().allowed).toBe(false);
    expect(planSteps9To16Infrastructure().opened).toBe(false);
    expect(planStudioCompletion25To32Infrastructure().opened).toBe(false);
    expect(evaluatePaidResourcePolicy({ allowPaidGpu: true, estimateUsd: 1 }).allowed).toBe(false);
  });

  it('reset clears Preview data only', () => {
    const backend = seededBackend();
    createPreviewEpisode(
      { title: 'Temp', episodeNumber: 9, durationSec: 15, premise: 'reset me' },
      backend,
    );
    const reset = resetPreviewStudio(backend);
    expect(reset.episodes).toEqual([]);
    expect(reset.lastResetAt).toBeTruthy();
  });
});

describe('Preview navigation and primary workflow wiring', () => {
  it('keeps the primary path pages on the Preview adapter', () => {
    const shell = readRepo('apps/web/src/components/StudioShell.tsx');
    expect(shell).toContain('PRIMARY_NAV');
    expect(shell).toContain('Advanced / debug');
    expect(shell).toContain('aria-current');
    expect(shell).toContain('Close menu');
    for (const file of [
      'apps/web/src/app/production-setup/page.tsx',
      'apps/web/src/app/new-episode/page.tsx',
      'apps/web/src/app/asset-intake/page.tsx',
      'apps/web/src/app/voices/page.tsx',
      'apps/web/src/app/workflow/page.tsx',
      'apps/web/src/app/readiness/page.tsx',
      'apps/web/src/app/render-queue/page.tsx',
    ]) {
      expect(readRepo(file)).toContain('isPublicWebsitePreview');
    }
    expect(readRepo('apps/web/src/components/preview/PreviewVoices.tsx')).toContain(
      'Generate audition — unavailable',
    );
    expect(readRepo('apps/web/src/components/preview/PreviewVoices.tsx')).toContain('disabled');
  });
});

function loadFrom(backend: ReturnType<typeof memoryBackend>) {
  return loadPreviewWorkspace(backend);
}

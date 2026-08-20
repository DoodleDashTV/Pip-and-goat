import { describe, expect, it } from 'vitest';
import { createFileStore, persistFileStore } from './tivvlejoy-production-persistence';
import {
  FIRST_EPISODE_PREFLIGHT_SCHEMA,
  bindEp012VoiceReceipts,
  compileFirstEpisodePreflight,
  compileProductionLock,
  persistRealEvidence,
  loadPersistedPreflight,
  preflightImpact,
} from './tivvlejoy-real-input-convergence';

function compileDefault() {
  return compileFirstEpisodePreflight({
    voice: bindEp012VoiceReceipts(),
    candidates: [],
    realApprovedLogicalAssets: 0,
    humanApprovals: 0,
    blenderAvailable: false,
    paidRenderAuthorized: false,
    realMediaReceipts: 0,
  });
}

describe('TIVVLEJOY_FIRST_EPISODE_PREFLIGHT_V1', () => {
  it('compiles an honest EP012 preflight that synthetic evidence cannot satisfy', () => {
    const preflight = compileDefault();
    expect(preflight.schemaVersion).toBe(FIRST_EPISODE_PREFLIGHT_SCHEMA);
    expect(preflight.episodeId).toBe('EP012');
    expect(preflight.shotCount).toBe(11);
    expect(preflight.realReadyShots).toBe(0);
    expect(preflight.blockedShots).toBe(11);
    expect(preflight.syntheticCannotSatisfyRealPreflight).toBe(true);
    expect(preflight.lockState).toBe('NOT_LOCKABLE');
    expect(preflight.subsystems.find((item) => item.subsystem === 'RIGS')?.state).toBe('WAITING_EXTERNAL_INPUT');
    expect(preflight.subsystems.find((item) => item.subsystem === 'VOICE')?.state).toBe('SYNTHETIC_ONLY');
    expect(preflight.subsystems.find((item) => item.subsystem === 'RENDER')?.state).toBe('WAITING_PAID_AUTHORIZATION');
    expect(preflight.subsystems.every((item) => item.syntheticCannotSatisfy)).toBe(true);
  });

  it('keeps the production lock NOT_LOCKABLE while prerequisites are missing', () => {
    const lock = compileProductionLock({
      preflight: compileDefault(),
      scriptHash: 'aa'.repeat(32),
      voiceReceipts: [],
      directorPackageHash: null,
      assetRegistrySnapshot: null,
      rigVersions: { pip: null, goat: null },
      animationManifests: [],
      shotSpecs: [],
      approvals: [],
    });
    expect(lock.state).toBe('NOT_LOCKABLE');
  });

  it('changes only affected shot readiness on impact', () => {
    const base = compileDefault();
    const next = preflightImpact(base, ['SH003']);
    expect(next.shots.find((shot) => shot.shotId === 'SH003')?.exactBlocker).toContain('impact:SH003');
    expect(next.shots.find((shot) => shot.shotId === 'SH001')?.exactBlocker).toBe(base.shots[0]?.exactBlocker);
  });

  it('reloads the same real/synthetic classification after a cold persist restart', () => {
    const directory = new Map<string, string>();
    const store = createFileStore(directory, { workspaceId: 'ws_preflight_restart' });
    const preflight = compileDefault();
    persistRealEvidence({ store, preflight, voice: bindEp012VoiceReceipts() });
    persistFileStore(store, directory);
    const reloaded = createFileStore(directory, { workspaceId: 'ws_preflight_restart' });
    const loaded = loadPersistedPreflight(reloaded);
    expect(loaded?.subsystems.find((item) => item.subsystem === 'RIGS')?.state).toBe('WAITING_EXTERNAL_INPUT');
    expect(loaded?.subsystems.find((item) => item.subsystem === 'VOICE')?.state).toBe('SYNTHETIC_ONLY');
    expect(loaded?.realReadyShots).toBe(0);
  });
});

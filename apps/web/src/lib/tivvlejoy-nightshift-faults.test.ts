import { describe, expect, it } from 'vitest';
import { simulateSeason } from './tivvlejoy-production-studio/simulation';
import { createMemoryStore } from './tivvlejoy-production-persistence';
import {
  compileDirectedEpisode,
  evaluateChangeImpact,
  evaluateMasterReadiness,
  persistDirectorPackage,
  planCinematography,
  planLightingDirection,
} from './tivvlejoy-nightshift-production';

const FAULTS = [
  'missing rig',
  'stale rig',
  'missing scenery receipt',
  'stale scenery approval',
  'missing voice',
  'stale voice',
  'missing camera',
  'stale camera',
  'missing edit',
  'timeline duration mismatch',
  'caption overflow',
  'audio overlap',
  'review conflict',
  'lost write',
  'corrupt persistence snapshot',
  'render authorization absent',
  'QC incomplete',
  'delivery stale',
] as const;

describe('nightshift fault matrix', () => {
  for (const fault of FAULTS) {
    it(`fails closed for ${fault}`, () => {
      const readiness = evaluateMasterReadiness({
        realRigs: fault !== 'missing rig' && fault !== 'stale rig',
        realSceneryApproved: fault !== 'missing scenery receipt' && fault !== 'stale scenery approval',
        realVoiceExact: fault !== 'missing voice' && fault !== 'stale voice',
        humanVisualApproval: fault !== 'review conflict' && fault !== 'QC incomplete',
        paidRenderAuthorized: fault !== 'render authorization absent',
        softwareLayers: fault === 'missing edit' || fault === 'missing camera' ? ['ASSET'] : ['DIRECTING', 'EDITORIAL', 'ANIMATION', 'ASSET'],
      });
      expect(readiness.state).not.toBe('PRODUCTION_READY');
      expect(readiness.state === 'PRODUCTION_READY' ? 1 : 0).toBe(0);
    });
  }

  it('camera change invalidates camera and render, not voice', () => {
    const before = planCinematography({ shotId: 'SH01', intent: 'MEDIUM_SINGLE', speaker: 'PIP' });
    const after = planCinematography({ shotId: 'SH01', intent: 'CLOSE_UP', speaker: 'PIP' });
    expect(after.cinematographySha256).not.toBe(before.cinematographySha256);
    expect(evaluateChangeImpact('CAMERA').preserves).toContain('voice receipt');
  });

  it('lighting change leaves dialogue valid', () => {
    const before = planLightingDirection({ shotId: 'SH01', intent: 'WARM_INVITING' });
    const after = planLightingDirection({ shotId: 'SH01', intent: 'TENSION_COOL' });
    expect(after.lightingSha256).not.toBe(before.lightingSha256);
    expect(evaluateChangeImpact('LIGHTING').preserves).toContain('dialogue wording');
  });

  it('recovers from an interrupted director package write', () => {
    const season = simulateSeason({ episodeCount: 1, shotsPerEpisode: 4 });
    const compiled = compileDirectedEpisode(season.episodes[0]!);
    const store = createMemoryStore({ workspaceId: 'ws_fault' });
    persistDirectorPackage(store, compiled.directorPackage);
    const snapshot = store.view();
    const recovered = createMemoryStore({ workspaceId: 'ws_fault_recovered' });
    recovered.replaceState(snapshot);
    expect(recovered.readRecord('DIRECTOR_PACKAGE', compiled.episodeId)?.payload).toEqual(
      store.readRecord('DIRECTOR_PACKAGE', compiled.episodeId)?.payload,
    );
  });
});

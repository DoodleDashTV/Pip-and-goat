import { describe, expect, it } from 'vitest';
import {
  animationStaleAfter,
  buildShotAnimationManifest,
  cacheIdentitySha256,
  evaluateCache,
  planAnimationBatches,
  planCharacterShot,
  sceneryOnlyChangeInvalidatesAnimation,
  syntheticGoatContract,
  syntheticPipContract,
} from './tivvlejoy-character-animation';

describe('animation manifest cache and batching', () => {
  it('builds a filename-free shot animation manifest', () => {
    const plan = planCharacterShot({ shotId: 'S1', characterId: 'PIP', contract: syntheticPipContract(), speaking: true });
    expect(plan.manifest.schema).toBe('TIVVLEJOY_SHOT_ANIMATION_MANIFEST_V1');
    expect(plan.manifest.shotAnimationDependencySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(plan.manifest)).not.toMatch(/\.blend|latest/);
  });

  it('stales a Pip manifest when the rig version changes', () => {
    const v1 = planCharacterShot({ shotId: 'S1', characterId: 'PIP', contract: syntheticPipContract('V1') });
    const v2 = planCharacterShot({ shotId: 'S1', characterId: 'PIP', contract: syntheticPipContract('V2') });
    expect(animationStaleAfter({ previous: v1.manifest, next: v2.manifest })).toBe(true);
  });

  it('does not stale Goat when only Pip changes', () => {
    const goat = planCharacterShot({ shotId: 'S1', characterId: 'GOAT', contract: syntheticGoatContract('V1') });
    const goatSame = planCharacterShot({ shotId: 'S1', characterId: 'GOAT', contract: syntheticGoatContract('V1') });
    expect(goat.manifest.shotAnimationDependencySha256).toBe(goatSame.manifest.shotAnimationDependencySha256);
  });

  it('stales dependent animation after a voice receipt change', () => {
    const first = planCharacterShot({
      shotId: 'S1',
      characterId: 'PIP',
      speaking: true,
      voice: { audioReceiptRef: 'A', audioSha256: 'aa'.repeat(32), durationMs: 1200 },
    });
    const second = planCharacterShot({
      shotId: 'S1',
      characterId: 'PIP',
      speaking: true,
      voice: { audioReceiptRef: 'B', audioSha256: 'bb'.repeat(32), durationMs: 1200 },
    });
    expect(first.manifest.dialogueTimingSha256).not.toBe(second.manifest.dialogueTimingSha256);
    expect(first.manifest.shotAnimationDependencySha256).not.toBe(second.manifest.shotAnimationDependencySha256);
  });

  it('does not invalidate animation for a scenery-only background change', () => {
    expect(sceneryOnlyChangeInvalidatesAnimation()).toBe(false);
  });

  it('keeps an unrelated shot valid when one line changes', () => {
    const other = planCharacterShot({ shotId: 'S9', characterId: 'GOAT', speaking: false });
    const otherAgain = planCharacterShot({ shotId: 'S9', characterId: 'GOAT', speaking: false });
    expect(other.manifest.shotAnimationDependencySha256).toBe(otherAgain.manifest.shotAnimationDependencySha256);
  });

  it('returns CACHE_MISS when nothing is stored', () => {
    expect(
      evaluateCache({
        requested: {
          category: 'IDLE_FOUNDATION',
          characterId: 'PIP',
          rigVersion: 'V1',
          rigDependencySha256: 'r1',
          semanticContextSha256: 'c1',
        },
        stored: null,
      }),
    ).toBe('CACHE_MISS');
  });

  it('reuses a compatible idle foundation', () => {
    const key = {
      category: 'IDLE_FOUNDATION' as const,
      characterId: 'PIP',
      rigVersion: 'V1',
      rigDependencySha256: 'r1',
      semanticContextSha256: 'c1',
    };
    expect(
      evaluateCache({
        requested: key,
        stored: { key, identitySha256: cacheIdentitySha256(key), payloadSha256: 'p' },
      }),
    ).toBe('CACHE_REUSABLE');
  });

  it('does not blindly reuse a full performance', () => {
    const key = {
      category: 'IDLE_FOUNDATION' as const,
      characterId: 'PIP',
      rigVersion: 'V1',
      rigDependencySha256: 'r1',
      semanticContextSha256: 'c1',
    };
    expect(evaluateCache({ requested: key, stored: { key, identitySha256: cacheIdentitySha256(key), payloadSha256: 'p' }, allowFullPerformanceReuse: true })).toBe(
      'CACHE_CONTEXT_MISMATCH',
    );
  });

  it('detects a rig version mismatch in cache', () => {
    const requested = {
      category: 'WALK_CYCLE_SEMANTIC' as const,
      characterId: 'PIP',
      rigVersion: 'V2',
      rigDependencySha256: 'r1',
      semanticContextSha256: 'c1',
    };
    const storedKey = { ...requested, rigVersion: 'V1' };
    expect(
      evaluateCache({
        requested,
        stored: { key: storedKey, identitySha256: cacheIdentitySha256(storedKey), payloadSha256: 'p' },
      }),
    ).toBe('CACHE_RIG_VERSION_MISMATCH');
  });

  it('detects stale cache after a rig hash change', () => {
    const requested = {
      category: 'RUN_CYCLE_SEMANTIC' as const,
      characterId: 'GOAT',
      rigVersion: 'V1',
      rigDependencySha256: 'r2',
      semanticContextSha256: 'c1',
    };
    const storedKey = { ...requested, rigDependencySha256: 'r1' };
    expect(
      evaluateCache({
        requested,
        stored: { key: storedKey, identitySha256: cacheIdentitySha256(storedKey), payloadSha256: 'p' },
      }),
    ).toBe('CACHE_STALE');
  });

  it('detects a semantic context mismatch', () => {
    const requested = {
      category: 'LOOK_TRANSITION' as const,
      characterId: 'PIP',
      rigVersion: 'V1',
      rigDependencySha256: 'r1',
      semanticContextSha256: 'happy',
    };
    const storedKey = { ...requested, semanticContextSha256: 'sad' };
    expect(
      evaluateCache({
        requested,
        stored: { key: storedKey, identitySha256: cacheIdentitySha256(storedKey), payloadSha256: 'p' },
      }),
    ).toBe('CACHE_CONTEXT_MISMATCH');
  });

  it('groups 60-episode work while keeping real-rig batches blocked', () => {
    const shots = Array.from({ length: 12 }, (_, index) => ({
      shotId: `S${index}`,
      episodeId: 'EP001',
      characterIds: [index % 2 === 0 ? 'PIP' : 'GOAT'] as Array<'PIP' | 'GOAT'>,
      locationId: index < 6 ? 'bakery' : 'forest_exit',
      dialogueReady: index % 3 !== 0,
      animationDependencyReady: true,
      locomotionClass: index % 4 === 0 ? 'WALK' : 'STATIONARY',
      actionFoundation: 'curious',
      pipRigVersion: 'SYNTHETIC_V1',
      goatRigVersion: 'SYNTHETIC_V1',
      pipAdmitted: false,
      goatAdmitted: false,
    }));
    const plan = planAnimationBatches({ shots, episodeHorizon: 60 });
    expect(plan.blockedRealRigWork).toBe(12);
    expect(plan.executableAfterAdmission).toBe(0);
    expect(plan.groups.length).toBeGreaterThan(1);
  });

  for (const horizon of [1, 10, 30, 60] as const) {
    it(`supports a ${horizon}-episode animation horizon`, () => {
      const plan = planAnimationBatches({
        episodeHorizon: horizon,
        shots: [
          {
            shotId: 'S1',
            episodeId: 'EP001',
            characterIds: ['PIP', 'GOAT'],
            locationId: 'bakery',
            dialogueReady: true,
            animationDependencyReady: true,
            locomotionClass: 'WALK',
            actionFoundation: 'idle',
            pipRigVersion: 'V1',
            goatRigVersion: 'V1',
            pipAdmitted: false,
            goatAdmitted: false,
          },
        ],
      });
      expect(plan.episodeHorizon).toBe(horizon);
      expect(plan.groups[0]?.blockedByRealRig).toBe(true);
    });
  }

  it('reuses a manifest hash builder independently of filenames', () => {
    const plan = planCharacterShot({ shotId: 'S2', characterId: 'GOAT' });
    const rebuilt = buildShotAnimationManifest(plan.manifest);
    expect(rebuilt.shotAnimationDependencySha256).toBe(plan.manifest.shotAnimationDependencySha256);
  });

  const refs = [
    'performanceIntentSha256',
    'dialogueTimingSha256',
    'visemePlanSha256',
    'blinkPlanSha256',
    'gazePlanSha256',
    'bodyActingPlanSha256',
    'locomotionPlanSha256',
    'contactPlanSha256',
    'propInteractionSha256',
    'continuityDependencySha256',
  ] as const;
  for (const ref of refs) {
    it(`includes ${ref} in the shot animation dependency`, () => {
      const plan = planCharacterShot({ shotId: 'REF', characterId: 'PIP', speaking: true });
      expect(plan.manifest[ref]).toMatch(/^[a-f0-9]{64}$/);
    });
  }

  it('changes the dependency when performance intent changes', () => {
    const calm = planCharacterShot({ shotId: 'S1', characterId: 'PIP' });
    const run = planCharacterShot({ shotId: 'S1', characterId: 'PIP', locomotion: 'run' });
    expect(calm.manifest.performanceIntentSha256).not.toBe(run.manifest.performanceIntentSha256);
  });

  it('does not stale Goat animation when only a Pip voice receipt changes', () => {
    const goat = planCharacterShot({ shotId: 'S1', characterId: 'GOAT' });
    const goatAfterPipVoice = planCharacterShot({ shotId: 'S1', characterId: 'GOAT' });
    const pipChanged = planCharacterShot({
      shotId: 'S1',
      characterId: 'PIP',
      speaking: true,
      voice: { audioReceiptRef: 'X', audioSha256: '99'.repeat(32), durationMs: 800 },
    });
    expect(goat.manifest.shotAnimationDependencySha256).toBe(goatAfterPipVoice.manifest.shotAnimationDependencySha256);
    expect(pipChanged.speaking).toBe(true);
  });

  it('groups shared walk foundations separately from run foundations', () => {
    const plan = planAnimationBatches({
      episodeHorizon: 10,
      shots: [
        {
          shotId: 'W1',
          episodeId: 'EP001',
          characterIds: ['PIP'],
          locationId: 'bakery',
          dialogueReady: true,
          animationDependencyReady: true,
          locomotionClass: 'WALK',
          actionFoundation: 'curious',
          pipRigVersion: 'V1',
          goatRigVersion: 'V1',
          pipAdmitted: false,
          goatAdmitted: false,
        },
        {
          shotId: 'R1',
          episodeId: 'EP001',
          characterIds: ['PIP'],
          locationId: 'bakery',
          dialogueReady: true,
          animationDependencyReady: true,
          locomotionClass: 'RUN',
          actionFoundation: 'curious',
          pipRigVersion: 'V1',
          goatRigVersion: 'V1',
          pipAdmitted: false,
          goatAdmitted: false,
        },
      ],
    });
    expect(plan.groups).toHaveLength(2);
  });
});

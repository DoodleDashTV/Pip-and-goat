import { describe, expect, it } from 'vitest';
import { createMemoryStore } from './tivvlejoy-production-persistence';
import { buildProductionStateGraph } from './tivvlejoy-production-studio/state-graph';
import { assembleShot, ep012AssemblyInputs } from './tivvlejoy-shot-assembly-manifest';
import {
  evaluateRigAdmission,
  persistAnimationArtifacts,
  planAnimationBatches,
  planCharacterShot,
  restoreAnimationDependencyHashes,
  syntheticPipContract,
  syntheticGoatContract,
} from './tivvlejoy-character-animation';
import { evaluateAnimationQc } from './tivvlejoy-character-animation/qc';
import { buildBlinkPlan, buildContactPlan, buildDialogueTiming, buildGazePlan, buildLocomotionPlan, buildVisemePlan, identityAccessories } from './tivvlejoy-character-animation';

describe('animation persistence and state graph integration', () => {
  it('persists animation hashes and restores them after a cold restart', () => {
    const store = createMemoryStore({ workspaceId: 'ws_anim' });
    const pip = planCharacterShot({ shotId: 'S1', characterId: 'PIP', contract: syntheticPipContract(), speaking: true });
    const goat = planCharacterShot({ shotId: 'S1', characterId: 'GOAT', contract: syntheticGoatContract() });
    persistAnimationArtifacts({
      store,
      plans: [pip, goat],
      admissions: [
        evaluateRigAdmission({ characterId: 'PIP', contract: syntheticPipContract() }),
        evaluateRigAdmission({ characterId: 'GOAT', contract: syntheticGoatContract() }),
      ],
      qcReports: [],
      batch: planAnimationBatches({
        episodeHorizon: 1,
        shots: [
          {
            shotId: 'S1',
            episodeId: 'EP001',
            characterIds: ['PIP', 'GOAT'],
            locationId: 'bakery',
            dialogueReady: true,
            animationDependencyReady: true,
            locomotionClass: 'STATIONARY',
            actionFoundation: 'curious',
            pipRigVersion: 'SYNTHETIC_V1',
            goatRigVersion: 'SYNTHETIC_V1',
            pipAdmitted: false,
            goatAdmitted: false,
          },
        ],
      }),
      cacheIdentities: [{ id: 'idle-pip', sha256: pip.manifest.shotAnimationDependencySha256 }],
    });
    const first = restoreAnimationDependencyHashes(store);
    const replay = createMemoryStore({ workspaceId: 'ws_anim' });
    persistAnimationArtifacts({
      store: replay,
      plans: [pip, goat],
      admissions: [
        evaluateRigAdmission({ characterId: 'PIP', contract: syntheticPipContract() }),
        evaluateRigAdmission({ characterId: 'GOAT', contract: syntheticGoatContract() }),
      ],
      qcReports: [],
      batch: planAnimationBatches({
        episodeHorizon: 1,
        shots: [
          {
            shotId: 'S1',
            episodeId: 'EP001',
            characterIds: ['PIP', 'GOAT'],
            locationId: 'bakery',
            dialogueReady: true,
            animationDependencyReady: true,
            locomotionClass: 'STATIONARY',
            actionFoundation: 'curious',
            pipRigVersion: 'SYNTHETIC_V1',
            goatRigVersion: 'SYNTHETIC_V1',
            pipAdmitted: false,
            goatAdmitted: false,
          },
        ],
      }),
      cacheIdentities: [{ id: 'idle-pip', sha256: pip.manifest.shotAnimationDependencySha256 }],
    });
    expect(restoreAnimationDependencyHashes(replay)).toEqual(first);
    expect(store.readRecord('SHOT_ANIMATION_MANIFEST', 'S1:PIP')?.payload.shotAnimationDependencySha256).toBe(
      pip.manifest.shotAnimationDependencySha256,
    );
  });

  it('does not connect a production database while persisting animation', () => {
    expect(createMemoryStore().mode).toBe('PREVIEW_MEMORY');
  });

  it('keeps ANIMATION waiting for unresolved rigs', () => {
    const graph = buildProductionStateGraph([
      {
        episodeId: 'EP012',
        scriptSha256: 'aa'.repeat(32),
        shots: [{ shotId: 'SH001', locationId: 'bakery', charactersVisible: ['PIP', 'GOAT'], dialogueRefs: ['DL'] }],
        voiceReceipts: [{ dialogueRef: 'DL', receiptRef: 'VR', receiptSha256: 'ff'.repeat(32), characterId: 'PIP' }],
      },
    ]);
    expect(graph.nodes.find((node) => node.kind === 'ANIMATION')?.state).toBe('WAITING_FOR_RIG');
  });

  it('uses WAITING_FOR_ANIMATION_PLAN after rigs resolve without a plan', () => {
    const graph = buildProductionStateGraph([
      {
        episodeId: 'EP012',
        scriptSha256: 'aa'.repeat(32),
        characterRigsResolved: true,
        pipRigVersion: 'PIP_V1',
        goatRigVersion: 'GOAT_V1',
        shots: [{ shotId: 'SH001', locationId: 'bakery', charactersVisible: ['PIP'] }],
      },
    ]);
    expect(graph.nodes.find((node) => node.kind === 'ANIMATION')?.state).toBe('WAITING_FOR_ANIMATION_PLAN');
  });

  it('uses WAITING_FOR_RIG_APPROVAL when resolved rigs are not approved', () => {
    const graph = buildProductionStateGraph([
      {
        episodeId: 'EP012',
        scriptSha256: 'aa'.repeat(32),
        characterRigsResolved: true,
        characterRigsApproved: false,
        shots: [{ shotId: 'SH001', locationId: 'bakery', charactersVisible: ['PIP'] }],
      },
    ]);
    expect(graph.nodes.find((node) => node.kind === 'ANIMATION')?.state).toBe('WAITING_FOR_RIG_APPROVAL');
  });

  it('uses WAITING_FOR_VOICE_TIMING when a dialogue shot lacks timing', () => {
    const graph = buildProductionStateGraph([
      {
        episodeId: 'EP012',
        scriptSha256: 'aa'.repeat(32),
        characterRigsResolved: true,
        shots: [{ shotId: 'SH001', locationId: 'bakery', charactersVisible: ['PIP'], dialogueRefs: ['DL'], voiceTimingReady: false }],
      },
    ]);
    expect(graph.nodes.find((node) => node.kind === 'ANIMATION')?.state).toBe('WAITING_FOR_VOICE_TIMING');
  });

  it('uses WAITING_FOR_CONTINUITY when continuity is not ready', () => {
    const graph = buildProductionStateGraph([
      {
        episodeId: 'EP012',
        scriptSha256: 'aa'.repeat(32),
        characterRigsResolved: true,
        shots: [{ shotId: 'SH001', locationId: 'bakery', charactersVisible: ['PIP'], continuityReady: false }],
      },
    ]);
    expect(graph.nodes.find((node) => node.kind === 'ANIMATION')?.state).toBe('WAITING_FOR_CONTINUITY');
  });

  it('uses WAITING_FOR_ANIMATION_QC when a plan exists without QC', () => {
    const graph = buildProductionStateGraph([
      {
        episodeId: 'EP012',
        scriptSha256: 'aa'.repeat(32),
        characterRigsResolved: true,
        shots: [{ shotId: 'SH001', locationId: 'bakery', charactersVisible: ['PIP'], animationPlanReady: true }],
      },
    ]);
    expect(graph.nodes.find((node) => node.kind === 'ANIMATION')?.state).toBe('WAITING_FOR_ANIMATION_QC');
  });

  it('can become ready for character animation assembly without completing real animation', () => {
    const graph = buildProductionStateGraph([
      {
        episodeId: 'EP012',
        scriptSha256: 'aa'.repeat(32),
        characterRigsResolved: true,
        shots: [
          {
            shotId: 'SH001',
            locationId: 'bakery',
            charactersVisible: ['PIP'],
            animationPlanReady: true,
            animationQcReady: true,
            shotAnimationManifestSha256: '11'.repeat(32),
          },
        ],
      },
    ]);
    expect(graph.nodes.find((node) => node.kind === 'ANIMATION')?.state).toBe('READY_FOR_CHARACTER_ANIMATION_ASSEMBLY');
    expect(graph.nodes.find((node) => node.kind === 'ANIMATION')?.state).not.toBe('COMPLETE');
  });

  it('does not change assembly hashes when animation refs are attached', () => {
    const input = ep012AssemblyInputs()[0]!;
    const baseline = assembleShot(input).assemblyDependencySha256;
    const withAnim = assembleShot({
      ...input,
      shotAnimationManifestSha256: '11'.repeat(32),
      characterRigDependencySha256: '22'.repeat(32),
      animationQcRequirement: 'REQUIRED',
    }).assemblyDependencySha256;
    expect(withAnim).toBe(baseline);
  });

  it('keeps MISSING_CHARACTER_RIG and can add animation blockers without weakening it', () => {
    const input = ep012AssemblyInputs().find((item) => item.charactersVisible.includes('PIP') || item.charactersVisible.includes('GOAT'))!;
    const manifest = assembleShot({
      ...input,
      animationQcRequirement: 'REQUIRED',
      animationManifestFresh: false,
      shotAnimationManifestSha256: '11'.repeat(32),
    });
    expect(manifest.hardBlockers).toContain('MISSING_CHARACTER_RIG');
    expect(manifest.hardBlockers).toContain('STALE_ANIMATION_MANIFEST');
    expect(manifest.hardBlockers).toContain('ANIMATION_QC_REQUIRED');
  });

  it('persists an animation QC receipt hash', () => {
    const store = createMemoryStore({ workspaceId: 'ws_qc' });
    const timing = buildDialogueTiming({ lineId: 'L', characterId: 'PIP' });
    const report = evaluateAnimationQc({
      admission: { characterId: 'PIP' },
      characterIdExpected: 'PIP',
      timing,
      viseme: buildVisemePlan(timing),
      blink: buildBlinkPlan({
        shotId: 'S1',
        characterId: 'PIP',
        durationMs: 1000,
        emotion: 'curious',
        speaking: false,
        attentionShifts: [],
        seed: 1,
      }),
      gaze: buildGazePlan({ shotId: 'S1', characterId: 'PIP', speaking: false, partnerVisible: true }),
      contact: buildContactPlan(buildLocomotionPlan({ shotId: 'S1', characterId: 'PIP', speedClass: 'STATIONARY', durationMs: 1000 })),
      continuityIssues: [],
      accessories: identityAccessories('PIP').map((item) => ({ itemId: item.itemId, present: true, removable: false })),
      framing: {
        aspect: '9:16',
        headInFrame: true,
        faceInFrame: true,
        propInFrame: true,
        gestureInFrame: true,
        walkEntryVisible: true,
        walkExitVisible: true,
        importantActingOutsideFrame: false,
      },
      animationFresh: true,
      gestureReadable: true,
      faceReadable: true,
    });
    persistAnimationArtifacts({
      store,
      plans: [],
      admissions: [evaluateRigAdmission({ characterId: 'PIP' })],
      qcReports: [{ id: 'S1:PIP', report }],
      batch: planAnimationBatches({ episodeHorizon: 1, shots: [] }),
    });
    expect(store.readRecord('ANIMATION_QC_RECEIPT', 'S1:PIP')?.payload.claimsVisualDeformationSuccess).toBe(false);
  });

  const entities = [
    'RIG_ADMISSION_REPORT',
    'RIG_VERSION_IDENTITY',
    'PERFORMANCE_INTENT',
    'DIALOGUE_TIMING_PLAN',
    'VISEME_PLAN',
    'SHOT_ANIMATION_MANIFEST',
    'ANIMATION_QC_RECEIPT',
    'ANIMATION_CACHE_IDENTITY',
    'ANIMATION_BATCH_PLAN',
  ] as const;
  for (const entity of entities) {
    it(`accepts durable ${entity} records`, () => {
      const store = createMemoryStore();
      const receipt = store.writeRecord({
        entityType: entity,
        entityId: entity,
        payload: { sha256: 'cc'.repeat(32) },
        expectedRevision: 0,
        eventType: 'ANIMATION_PLAN_WRITTEN',
        reason: entity,
      });
      expect(receipt.result).toBe('WRITE_ACCEPTED');
    });
  }

  it('does not complete a synthetic animation node', () => {
    const graph = buildProductionStateGraph([
      {
        episodeId: 'EP012',
        scriptSha256: 'aa'.repeat(32),
        characterRigsResolved: true,
        shots: [{ shotId: 'SH001', locationId: 'bakery', charactersVisible: ['PIP', 'GOAT'], animationPlanReady: true, animationQcReady: true }],
      },
    ]);
    expect(graph.nodes.filter((node) => node.kind === 'ANIMATION').every((node) => node.state !== 'COMPLETE')).toBe(true);
  });

  it('keeps CHARACTER_RIG waiting label stable when rigs are unresolved', () => {
    const graph = buildProductionStateGraph([
      {
        episodeId: 'EP012',
        scriptSha256: 'aa'.repeat(32),
        shots: [{ shotId: 'SH001', locationId: 'bakery', charactersVisible: ['PIP'] }],
      },
    ]);
    expect(graph.nodes.find((node) => node.kind === 'CHARACTER_RIG')?.humanLabel).toBe('Waiting for Pip production rig');
  });
});

import { describe, expect, it } from 'vitest';
import {
  QC_CHECK_IDS,
  animationSafetyReport,
  blenderExecutionAuthorized,
  buildBlinkPlan,
  buildContactPlan,
  buildDialogueTiming,
  buildGazePlan,
  buildLocomotionPlan,
  buildVisemePlan,
  evaluateAnimationQc,
  futureBlenderAnimationDriver,
  identityAccessories,
  syntheticPipContract,
  flipTestCandidateContract,
  type AnimationQcInput,
} from './tivvlejoy-character-animation';

function qc(overrides: Partial<AnimationQcInput> = {}): ReturnType<typeof evaluateAnimationQc> {
  const timing = buildDialogueTiming({
    lineId: 'L1',
    characterId: 'PIP',
    audioReceiptRef: 'VR',
    audioSha256: 'aa'.repeat(32),
    durationMs: 1800,
  });
  const input: AnimationQcInput = {
    admission: { characterId: 'PIP', contract: syntheticPipContract() },
    characterIdExpected: 'PIP',
    timing,
    viseme: buildVisemePlan(timing),
    blink: buildBlinkPlan({
      shotId: 'S1',
      characterId: 'PIP',
      durationMs: 1800,
      emotion: 'curious',
      speaking: true,
      attentionShifts: [],
      seed: 1,
    }),
    gaze: buildGazePlan({ shotId: 'S1', characterId: 'PIP', speaking: true, partnerVisible: true }),
    contact: buildContactPlan(buildLocomotionPlan({ shotId: 'S1', characterId: 'PIP', speedClass: 'WALK', durationMs: 1800 })),
    continuityIssues: [],
    accessories: identityAccessories('PIP').map((item) => ({ itemId: item.itemId, present: true, removable: item.removable })),
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
    ...overrides,
  };
  return evaluateAnimationQc(input);
}

describe('animation QC and future Blender contract', () => {
  it('evaluates every required check id', () => {
    const report = qc();
    expect(report.checks.map((item) => item.id).sort()).toEqual([...QC_CHECK_IDS].sort());
  });

  it('fails admission for a synthetic fixture and never claims deformation success', () => {
    const report = qc();
    expect(report.claimsVisualDeformationSuccess).toBe(false);
    expect(report.checks.find((item) => item.id === 'RIG_ADMITTED')?.status).toBe('FAIL');
  });

  it('hard-blocks stale animation', () => {
    expect(qc({ animationFresh: false }).hardBlockers.some((item) => item.id === 'ANIMATION_DEPENDENCY_FRESH')).toBe(true);
  });

  it('hard-blocks a missing identity accessory', () => {
    const report = qc({
      accessories: [{ itemId: 'scarf', present: false, removable: false }],
    });
    expect(report.hardBlockers.some((item) => item.id === 'ACCESSORY_PRESENT')).toBe(true);
  });

  it('fails foot slide when injected', () => {
    expect(qc({ contactDefects: ['UNEXPLAINED_FOOT_SLIDE'] }).checks.find((item) => item.id === 'FOOT_SLIDE')?.status).toBe('FAIL');
  });

  it('fails floating contact when injected', () => {
    expect(qc({ contactDefects: ['DOUBLE_FLOATING_CONTACT'] }).checks.find((item) => item.id === 'FOOT_CONTACT')?.status).toBe('FAIL');
  });

  it('fails ground penetration when injected', () => {
    expect(qc({ contactDefects: ['GROUND_PENETRATION'] }).checks.find((item) => item.id === 'GROUND_CONTACT')?.status).toBe('FAIL');
  });

  it('fails impossible speed changes', () => {
    expect(qc({ contactDefects: ['IMPOSSIBLE_SPEED_CHANGE'] }).checks.find((item) => item.id === 'MOVEMENT_SPEED')?.status).toBe('FAIL');
  });

  it('fails prop teleport continuity', () => {
    expect(
      qc({
        continuityIssues: [
          { kind: 'PROP_TELEPORT', fromShotId: 'A', toShotId: 'B', characterId: 'PIP', detail: 'map jumped' },
        ],
      }).checks.find((item) => item.id === 'PROP_CONTINUITY')?.status,
    ).toBe('FAIL');
  });

  it('fails pose continuity on a position jump', () => {
    expect(
      qc({
        continuityIssues: [
          { kind: 'POSITION_JUMP', fromShotId: 'A', toShotId: 'B', characterId: 'PIP', detail: 'teleport' },
        ],
      }).checks.find((item) => item.id === 'POSE_CONTINUITY')?.status,
    ).toBe('FAIL');
  });

  it('warns on low viseme confidence instead of inventing lip sync', () => {
    const report = qc();
    expect(report.warnings.some((item) => item.id === 'VISEME_CONFIDENCE')).toBe(true);
    expect(report.checks.find((item) => item.id === 'VISEME_CONFIDENCE')?.detail).toContain('pretendsAccurateLipSync=false');
  });

  it('warns when dialogue timing is unavailable', () => {
    const timing = buildDialogueTiming({ lineId: 'L0', characterId: 'PIP' });
    expect(qc({ timing, viseme: buildVisemePlan(timing) }).checks.find((item) => item.id === 'DIALOGUE_TIMING_AVAILABLE')?.status).toBe(
      'WARNING',
    );
  });

  it('fails character identity mismatch', () => {
    expect(qc({ characterIdExpected: 'GOAT' }).hardBlockers.some((item) => item.id === 'CHARACTER_IDENTITY_MATCH')).toBe(true);
  });

  it('fails framing when the head leaves the 9:16 frame', () => {
    expect(
      qc({
        framing: {
          aspect: '9:16',
          headInFrame: false,
          faceInFrame: false,
          propInFrame: true,
          gestureInFrame: true,
          walkEntryVisible: true,
          walkExitVisible: true,
          importantActingOutsideFrame: false,
        },
      }).hardBlockers.some((item) => item.id === 'CAMERA_PERFORMANCE_VISIBILITY'),
    ).toBe(true);
  });

  it('still fails RIG_ADMITTED when a synthetic contract is swapped for a candidate without full evidence', () => {
    expect(qc({ admission: { characterId: 'PIP', contract: flipTestCandidateContract('PIP') } }).checks.find((item) => item.id === 'RIG_ADMITTED')?.status).toBe(
      'FAIL',
    );
  });

  it('exposes a future Blender driver that is not authorized', () => {
    const driver = futureBlenderAnimationDriver();
    expect(driver.generatedExecutionAuthorized).toBe(false);
    expect(driver.blenderExecuted).toBe(false);
    expect(driver.commercialCharacterBytesRead).toBe(false);
    expect(blenderExecutionAuthorized()).toBe(false);
    expect(driver.operations).toContain('APPLY_VISEME_LAYER');
    expect(driver.operations).toContain('VALIDATE_CONTACT');
  });

  it('records the required safety flags', () => {
    expect(animationSafetyReport()).toMatchObject({
      blenderExecuted: false,
      pipGeometryMutated: false,
      goatGeometryMutated: false,
      productionRigModified: false,
      voiceIdentityMutated: false,
      commercialBytesRead: false,
      runPodMutation: false,
      gpuLaunched: false,
      paidComputeUsd: 0,
      productionMutation: false,
    });
  });

  for (const id of QC_CHECK_IDS) {
    it(`includes ${id} as a first-class QC check`, () => {
      expect(qc().checks.some((item) => item.id === id)).toBe(true);
    });
  }

  it('fails turn continuity on a facing flip', () => {
    expect(
      qc({
        continuityIssues: [{ kind: 'FACING_FLIP', fromShotId: 'A', toShotId: 'B', characterId: 'PIP', detail: 'flip' }],
      }).checks.find((item) => item.id === 'TURN_CONTINUITY')?.status,
    ).toBe('FAIL');
  });

  it('warns when a gesture is not readable', () => {
    expect(qc({ gestureReadable: false }).warnings.some((item) => item.id === 'GESTURE_READABILITY')).toBe(true);
  });

  it('warns when a face is not readable', () => {
    expect(qc({ faceReadable: false }).warnings.some((item) => item.id === 'FACE_READABILITY')).toBe(true);
  });
});

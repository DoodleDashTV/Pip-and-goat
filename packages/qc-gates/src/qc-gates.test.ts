import { describe, expect, it } from 'vitest';
import {
  assertReadyForCloudAcceptance,
  cameraOnlyStaticCharactersEvidence,
  constantCurveEvidence,
  detachedMapMarkEvidence,
  duplicateLightsEvidence,
  evaluateLocalQcGates,
  fakeRigBindingEvidence,
  hasCharacterMotion,
  isReadyForCloudAcceptance,
  rotationMismatchEvidence,
  validProductionEvidence,
} from './index';

describe('local QC gates — happy path', () => {
  it('passes all gates including READY_FOR_CLOUD_ACCEPTANCE for valid evidence', () => {
    const report = evaluateLocalQcGates(validProductionEvidence());
    expect(report.gates.RIG_BINDING_VALID.status).toBe('PASS');
    expect(report.gates.PIP_MOTION_VALID.status).toBe('PASS');
    expect(report.gates.GOAT_MOTION_VALID.status).toBe('PASS');
    expect(report.gates.ANIMATION_CHANNELS_VALID.status).toBe('PASS');
    expect(report.gates.LIGHTING_STATE_VALID.status).toBe('PASS');
    expect(report.gates.NO_DUPLICATE_LIGHTS.status).toBe('PASS');
    expect(report.gates.ASSET_HIERARCHY_VALID.status).toBe('PASS');
    expect(report.gates.SCENE_ASSEMBLY_VALID.status).toBe('PASS');
    expect(report.gates.LOCAL_VISUAL_ACCEPTANCE.status).toBe('PASS');
    expect(report.gates.TECHNICAL_RENDER_VALID.status).toBe('PASS');
    expect(report.gates.VISUAL_QUALITY_VALID.status).toBe('PASS');
    expect(report.gates.READY_FOR_CLOUD_ACCEPTANCE.status).toBe('PASS');
    expect(report.readyForCloudAcceptance).toBe(true);
    expect(isReadyForCloudAcceptance(validProductionEvidence())).toBe(true);
  });

  it('supports deformation and rigid-part rig bindings', () => {
    const evidence = validProductionEvidence();
    // Pip = deformation, Goat = rigid-part only
    expect(evidence.rigBindings[0]?.deformationBinding).toBe(true);
    expect(evidence.rigBindings[1]?.rigidPartBinding).toBe(true);
    const report = evaluateLocalQcGates(evidence);
    expect(report.gates.RIG_BINDING_VALID.status).toBe('PASS');
  });
});

describe('critical regression — static Pip/Goat + camera-only', () => {
  it('rejects camera motion as character animation and fail-closes cloud readiness', () => {
    const evidence = cameraOnlyStaticCharactersEvidence();
    expect(hasCharacterMotion(evidence.pipMotion)).toBe(false);
    expect(hasCharacterMotion(evidence.goatMotion)).toBe(false);

    const report = evaluateLocalQcGates(evidence);

    expect(report.gates.TECHNICAL_RENDER_VALID.status).toBe('PASS');
    expect(report.gates.PIP_MOTION_VALID.status).toBe('FAIL');
    expect(report.gates.GOAT_MOTION_VALID.status).toBe('FAIL');
    expect(report.gates.VISUAL_QUALITY_VALID.status).toBe('FAIL');
    expect(report.gates.READY_FOR_CLOUD_ACCEPTANCE.status).toBe('FAIL');
    expect(report.readyForCloudAcceptance).toBe(false);

    expect(report.gates.PIP_MOTION_VALID.reason).toMatch(/camera motion/i);
    expect(report.gates.GOAT_MOTION_VALID.reason).toMatch(/camera motion/i);
    expect(report.gates.VISUAL_QUALITY_VALID.reason).toMatch(/camera-only/i);

    expect(report.defects.agent1RiggingAnimation.length).toBeGreaterThan(0);
  });
});

describe('animation channel contract', () => {
  it('rejects constant f-curves / claimed-but-static motion', () => {
    const report = evaluateLocalQcGates(constantCurveEvidence());
    expect(report.gates.PIP_MOTION_VALID.status).toBe('FAIL');
    expect(report.gates.ANIMATION_CHANNELS_VALID.status).toBe('FAIL');
    expect(report.gates.READY_FOR_CLOUD_ACCEPTANCE.status).toBe('FAIL');
  });

  it('rejects incompatible rotation channels', () => {
    const report = evaluateLocalQcGates(rotationMismatchEvidence());
    expect(report.gates.ANIMATION_CHANNELS_VALID.status).toBe('FAIL');
    expect(report.gates.ANIMATION_CHANNELS_VALID.reason).toMatch(/rotation mode mismatch/i);
    expect(report.readyForCloudAcceptance).toBe(false);
  });

  it('rejects keyed-but-unevaluated motion', () => {
    const evidence = validProductionEvidence();
    evidence.pipMotion.fcurves = [
      {
        dataPath: 'pose.bones["upper_arm_L"].rotation_euler',
        valueRange: 0.5,
        keyframeCount: 4,
        evaluated: false,
        muted: true,
        rotationMode: 'XYZ',
        keyedRotationMode: 'XYZ',
      },
    ];
    // boneChannelRange still high from fixture numbers — set to 0 to isolate channel gate
    evidence.pipMotion.boneChannelRange = 0;
    evidence.pipMotion.shapeKeyRange = 0;
    evidence.localVisualAcceptance = false;
    const report = evaluateLocalQcGates(evidence);
    expect(report.gates.ANIMATION_CHANNELS_VALID.status).toBe('FAIL');
    expect(report.gates.ANIMATION_CHANNELS_VALID.reason).toMatch(/keyed-but-unevaluated/i);
  });
});

describe('lighting + hierarchy contracts', () => {
  it('rejects duplicate production lights', () => {
    const report = evaluateLocalQcGates(duplicateLightsEvidence());
    expect(report.gates.NO_DUPLICATE_LIGHTS.status).toBe('FAIL');
    expect(report.gates.READY_FOR_CLOUD_ACCEPTANCE.status).toBe('FAIL');
    expect(report.defects.agent2LightingScene.join(' ')).toMatch(/duplicate/i);
  });

  it('verifies MapMark attachment and fails when detached', () => {
    const report = evaluateLocalQcGates(detachedMapMarkEvidence());
    expect(report.gates.ASSET_HIERARCHY_VALID.status).toBe('FAIL');
    expect(report.gates.ASSET_HIERARCHY_VALID.reason).toMatch(/MapMark/i);
    expect(report.gates.SCENE_ASSEMBLY_VALID.status).toBe('FAIL');
    expect(report.readyForCloudAcceptance).toBe(false);
  });

  it('rejects fake/nonfunctional rig bindings', () => {
    const report = evaluateLocalQcGates(fakeRigBindingEvidence());
    expect(report.gates.RIG_BINDING_VALID.status).toBe('FAIL');
    expect(report.gates.RIG_BINDING_VALID.reason).toMatch(/fake/i);
    expect(report.readyForCloudAcceptance).toBe(false);
  });

  it('requires lightingState ownership/preset', () => {
    const evidence = validProductionEvidence();
    evidence.lightingState = {};
    evidence.localVisualAcceptance = false;
    const report = evaluateLocalQcGates(evidence);
    expect(report.gates.LIGHTING_STATE_VALID.status).toBe('FAIL');
  });
});

describe('fail-closed cloud gate', () => {
  it('assertReadyForCloudAcceptance throws when not ready', () => {
    expect(() => assertReadyForCloudAcceptance(cameraOnlyStaticCharactersEvidence())).toThrow(
      /READY_FOR_CLOUD_ACCEPTANCE=false/,
    );
  });

  it('never marks READY_FOR_CLOUD_ACCEPTANCE true when any prerequisite fails', () => {
    const report = evaluateLocalQcGates(duplicateLightsEvidence());
    expect(report.failClosed).toBe(true);
    expect(report.gates.NO_DUPLICATE_LIGHTS.status).toBe('FAIL');
    expect(report.gates.READY_FOR_CLOUD_ACCEPTANCE.status).toBe('FAIL');
  });
});

import { describe, expect, it } from 'vitest';
import {
  ADMISSION_STATES,
  PIP_TEST_POSES,
  GOAT_TEST_POSES,
  approvedLikeSyntheticContract,
  buildInspectionReport,
  buildTestPoseMatrix,
  canAutoReplacePriorRigVersion,
  dryRunRigArrival,
  evaluateRigAdmission,
  flipTestCandidateContract,
  humanAdmission,
  neverAutoApprove,
  syntheticGoatInspection,
  syntheticPipContract,
  syntheticPipInspection,
  validateInspectionReport,
} from './tivvlejoy-character-animation';

describe('rig admission gate', () => {
  it('starts at RIG_NOT_PRESENT', () => {
    const report = evaluateRigAdmission({ characterId: 'PIP' });
    expect(report.state).toBe('RIG_NOT_PRESENT');
    expect(report.humanLabel).toBe('Waiting for approved Pip production rig');
    expect(report.approvedForAnimation).toBe(false);
  });

  it('never auto-approves a missing Goat rig', () => {
    const report = evaluateRigAdmission({ characterId: 'GOAT' });
    expect(neverAutoApprove(report)).toBe(true);
    expect(report.humanLabel).toBe('Waiting for approved Goat production rig');
  });

  it('discovers a synthetic contract without source hash as discovered', () => {
    const contract = syntheticPipContract();
    const stripped = { ...contract, sourceSha256: null };
    const report = evaluateRigAdmission({ characterId: 'PIP', contract: stripped });
    expect(report.state).toBe('RIG_DISCOVERED');
  });

  it('flags hash mismatch against the expected rig sha', () => {
    const report = evaluateRigAdmission({
      characterId: 'PIP',
      contract: syntheticPipContract(),
      expectedRigSha256: 'other-hash',
    });
    expect(report.state).toBe('RIG_HASH_MISMATCH');
  });

  it('flags version mismatch', () => {
    const report = evaluateRigAdmission({
      characterId: 'PIP',
      contract: syntheticPipContract('SYNTHETIC_V1'),
      expectedRigVersion: 'SYNTHETIC_V2',
    });
    expect(report.state).toBe('RIG_VERSION_MISMATCH');
  });

  it('blocks incompatible Blender versions', () => {
    expect(evaluateRigAdmission({ characterId: 'PIP', contract: syntheticPipContract(), blenderCompatible: false }).state).toBe('RIG_BLOCKED');
  });

  it('requires inspection before capability check', () => {
    expect(evaluateRigAdmission({ characterId: 'PIP', contract: syntheticPipContract() }).state).toBe('RIG_INSPECTION_REQUIRED');
  });

  it('holds capability check pending after inspection', () => {
    expect(
      evaluateRigAdmission({ characterId: 'PIP', contract: syntheticPipContract(), inspectionPresent: true }).state,
    ).toBe('RIG_CAPABILITY_CHECK_PENDING');
  });

  it('reports incomplete capabilities', () => {
    const thin = { ...syntheticPipContract(), capabilities: [] };
    expect(
      evaluateRigAdmission({
        characterId: 'PIP',
        contract: thin,
        inspectionPresent: true,
        capabilityCheckComplete: true,
      }).state,
    ).toBe('RIG_CAPABILITY_INCOMPLETE');
  });

  it('blocks identity-incompatible rigs', () => {
    expect(
      evaluateRigAdmission({
        characterId: 'PIP',
        contract: syntheticPipContract(),
        inspectionPresent: true,
        capabilityCheckComplete: true,
        characterIdentityCompatible: false,
      }).state,
    ).toBe('RIG_BLOCKED');
  });

  it('requires visual test evidence', () => {
    expect(
      evaluateRigAdmission({
        characterId: 'PIP',
        contract: syntheticPipContract(),
        inspectionPresent: true,
        capabilityCheckComplete: true,
      }).state,
    ).toBe('RIG_VISUAL_TEST_REQUIRED');
  });

  it('requires human approval after visual tests', () => {
    expect(
      evaluateRigAdmission({
        characterId: 'PIP',
        contract: syntheticPipContract(),
        inspectionPresent: true,
        capabilityCheckComplete: true,
        visualTestPresent: true,
        deformationEvidenceRef: 'deform',
      }).state,
    ).toBe('RIG_HUMAN_APPROVAL_REQUIRED');
  });

  it('refuses synthetic fixtures even when approval paperwork is attached', () => {
    const report = evaluateRigAdmission({
      characterId: 'PIP',
      contract: approvedLikeSyntheticContract('PIP'),
      inspectionPresent: true,
      capabilityCheckComplete: true,
      visualTestPresent: true,
      deformationEvidenceRef: 'deform',
      humanApprovalReceiptRef: 'human',
      humanApprovalSha256: 'human-sha',
      characterIdentityCompatible: true,
      blenderCompatible: true,
    });
    expect(report.approvedForAnimation).toBe(false);
    expect(report.syntheticCannotApprove).toBe(true);
    expect(report.state).not.toBe('RIG_APPROVED_FOR_ANIMATION');
  });

  it('can admit a production-candidate only after every gate, without calling it a real file', () => {
    const report = evaluateRigAdmission({
      characterId: 'PIP',
      contract: flipTestCandidateContract('PIP'),
      inspectionPresent: true,
      capabilityCheckComplete: true,
      visualTestPresent: true,
      deformationEvidenceRef: 'deform',
      humanApprovalReceiptRef: 'human',
      humanApprovalSha256: 'human-sha',
      characterIdentityCompatible: true,
      blenderCompatible: true,
    });
    expect(report.approvedForAnimation).toBe(true);
    expect(report.state).toBe('RIG_APPROVED_FOR_ANIMATION');
    expect(flipTestCandidateContract('PIP').rigId).toContain('FLIP_TEST');
  });

  it('enumerates every admission state', () => {
    expect(ADMISSION_STATES).toHaveLength(11);
  });

  it('uses friendly labels instead of raw codes in the operator path', () => {
    expect(humanAdmission('PIP', 'RIG_CAPABILITY_INCOMPLETE')).toBe('Pip rig is missing required controls');
  });

  it('validates synthetic inspection reports without running Blender', () => {
    const pip = syntheticPipInspection();
    const goat = syntheticGoatInspection();
    expect(pip.blenderExecuted).toBe(false);
    expect(goat.synthetic).toBe(true);
    expect(validateInspectionReport(pip)).toEqual([]);
  });

  it('flags empty inspection reports', () => {
    expect(
      validateInspectionReport({
        characterId: 'PIP',
        armatureCount: 0,
        boneCount: 0,
        deformBoneCount: 0,
        controlCount: 0,
        shapeKeyCount: 0,
        constraints: [],
        drivers: [],
        ikControls: [],
        fkControls: [],
        attachmentPoints: [],
        materials: [],
        meshAssociations: [],
        weightGroups: [],
        unsupportedDependencies: ['paid-plugin'],
        missingControllers: [],
        duplicateBoneNames: ['Bone'],
        unboundMeshes: ['Mesh'],
        nonuniformScaleConcerns: [],
        synthetic: true,
      }),
    ).toEqual(expect.arrayContaining(['NO_ARMATURE', 'DUPLICATE_BONE_NAMES', 'UNBOUND_MESHES', 'UNSUPPORTED_DEPENDENCIES']));
  });

  it('hashes inspection reports deterministically', () => {
    const { reportSha256: _ignored, schemaVersion: _schema, blenderExecuted: _blender, ...rest } = syntheticPipInspection();
    expect(buildInspectionReport(rest).reportSha256).toBe(syntheticPipInspection().reportSha256);
  });

  it('builds Pip and Goat test-pose matrices as NOT_TESTED synthetics', () => {
    const pip = buildTestPoseMatrix('PIP');
    const goat = buildTestPoseMatrix('GOAT');
    expect(pip.rows).toHaveLength(PIP_TEST_POSES.length);
    expect(goat.rows).toHaveLength(GOAT_TEST_POSES.length);
    expect(pip.rows.every((row) => row.result === 'NOT_TESTED')).toBe(true);
    expect(goat.synthetic).toBe(true);
  });

  it('allows synthetic pose overrides without claiming visual pass', () => {
    const matrix = buildTestPoseMatrix('PIP', { blink: 'WARNING' });
    expect(matrix.rows.find((row) => row.poseId === 'blink')?.result).toBe('WARNING');
    expect(matrix.rows.find((row) => row.poseId === 'blink')?.detail).toContain('synthetic');
  });

  it('dry-runs rig arrival without touching nonexistent files', () => {
    const workflow = dryRunRigArrival('PIP');
    expect(workflow.sourcePresent).toBe(false);
    expect(workflow.rows).toHaveLength(11);
    expect(workflow.neverAutoReplacePriorVersion).toBe(true);
    expect(canAutoReplacePriorRigVersion()).toBe(false);
  });

  it('keeps Goat arrival on the same dry-run checklist', () => {
    expect(dryRunRigArrival('GOAT').rows.map((row) => row.step)).toContain('HUMAN_VISUAL_REVIEW');
  });

  it('exposes wouldBeEligibleAfterHumanApproval for complete synthetic paperwork', () => {
    const report = evaluateRigAdmission({
      characterId: 'GOAT',
      contract: approvedLikeSyntheticContract('GOAT'),
      inspectionPresent: true,
      capabilityCheckComplete: true,
      visualTestPresent: true,
      deformationEvidenceRef: 'deform',
      characterIdentityCompatible: true,
      blenderCompatible: true,
    });
    expect(report.wouldBeEligibleAfterHumanApproval).toBe(true);
    expect(report.approvedForAnimation).toBe(false);
  });

  it('does not treat a synthetic Goat approval receipt as production admission', () => {
    const report = evaluateRigAdmission({
      characterId: 'GOAT',
      contract: approvedLikeSyntheticContract('GOAT'),
      inspectionPresent: true,
      capabilityCheckComplete: true,
      visualTestPresent: true,
      deformationEvidenceRef: 'deform',
      humanApprovalReceiptRef: 'human',
      humanApprovalSha256: 'human-sha',
      characterIdentityCompatible: true,
      blenderCompatible: true,
    });
    expect(report.blockers).toContain('SYNTHETIC_CANNOT_RECEIVE_HUMAN_APPROVAL');
  });

  it('keeps report hashes stable', () => {
    const input = { characterId: 'PIP' as const };
    expect(evaluateRigAdmission(input).reportSha256).toBe(evaluateRigAdmission(input).reportSha256);
  });

  it('lists all Goat test poses including sit-if-supported', () => {
    expect(GOAT_TEST_POSES).toContain('sit if supported');
    expect(PIP_TEST_POSES).toContain('backpack continuity');
  });
});

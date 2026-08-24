import { evaluateRigAdmission } from '@/lib/tivvlejoy-character-animation';
import { ZERO_SIDE_EFFECTS } from './types';
import { inspectGoatSourcePackage, resolveRepoRoot } from './source-intake';
import { evaluateBlenderCompatibility } from './blender-compat';
import { compileGoatIdentityReport } from './identity';
import { auditTopology } from './topology';
import { goatSyntheticTalkingPlan } from './visemes';
import { compilePerformanceReport } from './performance';
import { planGoatCharacterExecution } from './execution';
import { evaluateWeightProblemChecks, automaticWeightsAreFinal } from './weights';
import { GENERIC_SKELETON_PLAN } from './skeleton';
import { CONTROL_SYSTEMS } from './controls';
import { FACE_CONTROLS } from './face';
import { SECONDARY_CONTROLS, simulationMandatory } from './secondary';
import { VALIDATION_CLIP_PLANS, NINE_SIXTEEN } from './animation-suite';
import { planCorrectiveDeformation } from './correctives';

export const GOAT_REAL_ASSET_EXECUTION_BLOCKED = 'GOAT_REAL_ASSET_EXECUTION_BLOCKED' as const;
export const BLOCKED_REAL_EXECUTION_REQUIRED = 'BLOCKED_REAL_EXECUTION_REQUIRED' as const;

export function evaluateGoatCharacterMasterGate(input?: {
  repoRoot?: string;
  humanApproved?: boolean;
  deformationGatePassed?: boolean;
  renderQaPassed?: boolean;
  exportQaPassed?: boolean;
}) {
  const repoRoot = input?.repoRoot ?? resolveRepoRoot();
  const intake = inspectGoatSourcePackage(repoRoot);
  const identity = compileGoatIdentityReport({ realInspectionAvailable: intake.present });
  const topology = auditTopology(null);
  const weights = evaluateWeightProblemChecks(false);
  const visemes = goatSyntheticTalkingPlan();
  const performance = compilePerformanceReport(null);
  const execution = planGoatCharacterExecution();
  const blender = evaluateBlenderCompatibility(intake.present ? null : '4.3');
  const admission = evaluateRigAdmission({ characterId: 'GOAT' });

  const blockers: string[] = [];
  if (!intake.present) {
    blockers.push(GOAT_REAL_ASSET_EXECUTION_BLOCKED);
    blockers.push(BLOCKED_REAL_EXECUTION_REQUIRED);
  } else {
    blockers.push(BLOCKED_REAL_EXECUTION_REQUIRED);
  }
  if (identity.state !== 'READY_FOR_HUMAN_REVIEW') blockers.push(`IDENTITY_${identity.state}`);
  if (topology.state !== 'PLANNED') blockers.push(`TOPOLOGY_${topology.state}`);
  if (performance.state !== 'PROFILED') blockers.push(`PERFORMANCE_${performance.state}`);
  if (blender.status === 'CONVERSION_COPY_REQUIRED' || blender.status === 'UNKNOWN_SOURCE_VERSION') {
    blockers.push(`BLENDER_${blender.status}`);
  }
  blockers.push(...admission.blockers);
  if (input?.humanApproved !== true) blockers.push('HUMAN_APPROVAL_REQUIRED');
  if (input?.deformationGatePassed !== true) blockers.push('DEFORMATION_GATE_NOT_PASSED');
  if (input?.renderQaPassed !== true) blockers.push('RENDER_QA_NOT_PASSED');
  if (input?.exportQaPassed !== true) blockers.push('EXPORT_QA_NOT_PASSED');
  if (automaticWeightsAreFinal()) blockers.push('AUTOMATIC_WEIGHTS_ACCEPTED');
  if (simulationMandatory()) blockers.push('SIMULATION_MADE_MANDATORY');

  const uniqueBlockers = [...new Set(blockers)];
  const humanTriedToForcePass =
    input?.humanApproved === true &&
    input.deformationGatePassed === true &&
    input.renderQaPassed === true &&
    input.exportQaPassed === true;

  return {
    task: 'TIVVLEJOY_CHARACTER_RIGGING_ANIMATION_DEPARTMENT_V1' as const,
    characterId: 'CHAR_GOAT_001' as const,
    status: 'BLOCKED' as const,
    verdict: 'NOT_PRODUCTION_READY' as const,
    reason: intake.present
      ? 'Real Goat bytes are present but Blender execution, deformation renders, and recorded human approval have not passed.'
      : 'Goat_FINN.zip is not in this environment. Pipeline is implemented; real-asset execution is blocked.',
    realAssetStatus: intake.status,
    goatProductionReady: false,
    noFalsePass: true,
    humanApprovalDoesNotBypassMissingEvidence: true,
    forcedApprovalIgnored: humanTriedToForcePass,
    nextInputRequired: intake.nextInputRequired,
    reports: {
      goat_source_audit: intake.status,
      goat_topology_report: topology.state,
      goat_texture_report: BLOCKED_REAL_EXECUTION_REQUIRED,
      goat_rig_build_report: 'PLANNED_NOT_EXECUTED',
      goat_weight_report: BLOCKED_REAL_EXECUTION_REQUIRED,
      goat_face_report: BLOCKED_REAL_EXECUTION_REQUIRED,
      goat_viseme_report: visemes.source,
      goat_deformation_report: BLOCKED_REAL_EXECUTION_REQUIRED,
      goat_animation_validation: BLOCKED_REAL_EXECUTION_REQUIRED,
      goat_performance_report: performance.state,
      goat_character_master_gate: 'BLOCKED',
    } as const,
    subsystems: {
      intake,
      identity,
      topology,
      weights,
      skeletonBoneCount: GENERIC_SKELETON_PLAN.length,
      controlSystems: CONTROL_SYSTEMS.map((item) => item.id),
      faceControls: FACE_CONTROLS.map((item) => item.id),
      visemes,
      secondary: SECONDARY_CONTROLS.map((item) => item.id),
      correctives: planCorrectiveDeformation(),
      animationClips: VALIDATION_CLIP_PLANS.map((item) => item.clipId),
      framing: NINE_SIXTEEN,
      performance,
      execution,
      blender,
      admission,
    },
    blockers: uniqueBlockers,
    safety: {
      ...ZERO_SIDE_EFFECTS,
      noCanonicalAssetOverwrite: true,
      noPaidGpuLaunched: true,
      productionUntouched: true,
      draftPrOnly: true,
    },
  };
}

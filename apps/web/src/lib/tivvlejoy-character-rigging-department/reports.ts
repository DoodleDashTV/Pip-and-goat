import { BLOCKED_REAL_EXECUTION_REQUIRED, evaluateGoatCharacterMasterGate } from './quality-gate';
import { inspectGoatSourcePackage, resolveRepoRoot } from './source-intake';
import { compileGoatIdentityReport } from './identity';
import { auditTopology, EXPECTED_GOAT_PACKAGE_HINTS } from './topology';
import { TEXTURE_ROLES } from './types';
import { GENERIC_SKELETON_PLAN } from './skeleton';
import { CONTROL_SYSTEMS } from './controls';
import { evaluateWeightProblemChecks } from './weights';
import { FACE_CONTROLS, allGoatExpressions } from './face';
import { goatSyntheticTalkingPlan, allProductionVisemes } from './visemes';
import {
  ANIMATION_QUALITY_PRIORITIES,
  NINE_SIXTEEN,
  VALIDATION_CLIP_PLANS,
  deformationPoseCatalog,
} from './animation-suite';
import { compilePerformanceReport } from './performance';

export function compileGoatDepartmentReports(input?: { repoRoot?: string }) {
  const repoRoot = input?.repoRoot ?? resolveRepoRoot();
  const intake = inspectGoatSourcePackage(repoRoot);
  const identity = compileGoatIdentityReport({ realInspectionAvailable: intake.present });
  const topology = auditTopology(null);
  const gate = evaluateGoatCharacterMasterGate({ repoRoot });
  return {
    goat_source_audit: {
      ...intake,
      identity,
      packageHintsAreNotInspection: true,
      expectedPackageHints: EXPECTED_GOAT_PACKAGE_HINTS,
    },
    goat_topology_report: topology,
    goat_texture_report: {
      status: BLOCKED_REAL_EXECUTION_REQUIRED,
      roles: TEXTURE_ROLES,
      resolutionHint: '2K',
      doNotInventHigherResDetail: true,
    },
    goat_rig_build_report: {
      status: 'PLANNED_NOT_EXECUTED',
      skeleton: GENERIC_SKELETON_PLAN,
      controls: CONTROL_SYSTEMS,
    },
    goat_weight_report: {
      status: BLOCKED_REAL_EXECUTION_REQUIRED,
      checks: evaluateWeightProblemChecks(false),
    },
    goat_face_report: {
      status: BLOCKED_REAL_EXECUTION_REQUIRED,
      controls: FACE_CONTROLS,
      expressions: allGoatExpressions(),
    },
    goat_viseme_report: goatSyntheticTalkingPlan(),
    goat_deformation_report: {
      status: BLOCKED_REAL_EXECUTION_REQUIRED,
      poses: deformationPoseCatalog(),
    },
    goat_animation_validation: {
      status: BLOCKED_REAL_EXECUTION_REQUIRED,
      clips: VALIDATION_CLIP_PLANS,
      framing: NINE_SIXTEEN,
      qualityPriorities: ANIMATION_QUALITY_PRIORITIES,
    },
    goat_performance_report: compilePerformanceReport(null),
    goat_character_master_gate: gate,
    visemeSet: allProductionVisemes(),
  };
}

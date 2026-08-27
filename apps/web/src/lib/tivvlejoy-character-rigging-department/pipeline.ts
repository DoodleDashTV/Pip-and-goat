import { sha256Canonical } from './hash';
import { inspectGoatSourcePackage, resolveRepoRoot } from './source-intake';
import { evaluateBlenderCompatibility } from './blender-compat';
import { compileGoatIdentityReport } from './identity';
import { auditTopology } from './topology';
import { evaluateWeightProblemChecks } from './weights';
import { requiredSkeletonBones } from './skeleton';
import { CONTROL_SYSTEMS } from './controls';
import { FACE_CONTROLS } from './face';
import { goatSyntheticTalkingPlan } from './visemes';
import { SECONDARY_CONTROLS } from './secondary';
import { VALIDATION_CLIP_PLANS } from './animation-suite';
import { compilePerformanceReport } from './performance';
import { planGoatCharacterExecution } from './execution';
import { evaluateGoatCharacterMasterGate } from './quality-gate';
import { decideStageOutcome } from './idempotence';
import { BUILD_STAGES, type CharacterBuildStageId, type StageOutcome } from './types';

export type PipelineStageResult = {
  stage: CharacterBuildStageId;
  disposition: StageOutcome;
  status: 'PLANNED' | 'BLOCKED' | 'FAILED';
  reason: string;
  reportName: string | null;
  inputHash: string;
};

function stage(
  id: CharacterBuildStageId,
  reason: string,
  reportName: string | null,
  extra: Record<string, unknown>,
  outcomeInput: { blocked: boolean; stageExists?: boolean; previousInputHash?: string | null },
): PipelineStageResult {
  const inputHash = sha256Canonical({ stage: id, ...extra });
  return {
    stage: id,
    disposition: decideStageOutcome({
      blocked: outcomeInput.blocked,
      stageExists: outcomeInput.stageExists === true,
      inputHash,
      previousInputHash: outcomeInput.previousInputHash ?? null,
    }),
    status: outcomeInput.blocked ? 'BLOCKED' : 'PLANNED',
    reason,
    reportName,
    inputHash,
  };
}

export function runGoatCharacterBuildPipeline(input?: {
  repoRoot?: string;
  remoteHashLocked?: boolean;
}) {
  const repoRoot = input?.repoRoot ?? resolveRepoRoot();
  const intake = inspectGoatSourcePackage(repoRoot);
  const gate = evaluateGoatCharacterMasterGate({ repoRoot });
  const missing =
    'Real Goat_FINN.zip bytes and offline Blender execution are required. Stage is planned and fail-closed.';
  const remoteHashLocked = input?.remoteHashLocked === true;
  const hashLocked = Boolean(intake.present && intake.sha256) || remoteHashLocked;
  const laterBlocked = true;

  const stages: PipelineStageResult[] = [
    stage(
      'SOURCE_INTAKE',
      remoteHashLocked
        ? 'R2 SOURCE is locked. Local worker materialization is still required before Blender stages.'
        : intake.nextInputRequired,
      'goat_source_audit.json',
      { intake: intake.status, remoteHashLocked },
      { blocked: !intake.present && !remoteHashLocked },
    ),
    stage(
      'SOURCE_HASH_LOCK',
      hashLocked
        ? remoteHashLocked
          ? 'R2 SOURCE hash is locked. Local worker materialization is still required before Blender stages.'
          : 'Source hash locked from real bytes.'
        : intake.nextInputRequired,
      'goat_source_audit.json',
      { hash: intake.sha256, remoteHashLocked },
      { blocked: !hashLocked },
    ),
    stage(
      'BLENDER_VERSION_CHECK',
      evaluateBlenderCompatibility(intake.present ? null : '4.3').detail,
      'goat_source_audit.json',
      { blender: '4.3-hint' },
      { blocked: laterBlocked },
    ),
    stage('OBJECT_INVENTORY', missing, 'goat_source_audit.json', {}, { blocked: laterBlocked }),
    stage('MATERIAL_INVENTORY', missing, 'goat_texture_report.json', {}, { blocked: laterBlocked }),
    stage('TEXTURE_INVENTORY', missing, 'goat_texture_report.json', {}, { blocked: laterBlocked }),
    stage('UV_VALIDATION', missing, 'goat_topology_report.json', {}, { blocked: laterBlocked }),
    stage(
      'TOPOLOGY_AUDIT',
      auditTopology(null).notes.join(' '),
      'goat_topology_report.json',
      {},
      { blocked: laterBlocked },
    ),
    stage('SCALE_ORIENTATION_NORMALIZATION', missing, 'goat_source_audit.json', {}, { blocked: laterBlocked }),
    stage('CHARACTER_SEMANTIC_MAPPING', missing, 'goat_rig_build_report.json', {}, { blocked: laterBlocked }),
    stage('RIG_GUIDE_GENERATION', missing, 'goat_rig_build_report.json', {}, { blocked: laterBlocked }),
    stage(
      'SKELETON_BUILD',
      `${missing} Skeleton plan exists: ${requiredSkeletonBones().length} required bones.`,
      'goat_rig_build_report.json',
      { bones: requiredSkeletonBones().length },
      { blocked: laterBlocked },
    ),
    stage(
      'CONTROL_RIG_BUILD',
      `${missing} Control families planned: ${CONTROL_SYSTEMS.map((item) => item.id).join(', ')}.`,
      'goat_rig_build_report.json',
      { controls: CONTROL_SYSTEMS.length },
      { blocked: laterBlocked },
    ),
    stage(
      'INITIAL_SKIN_BIND',
      `${missing} Automatic weights may initialize only.`,
      'goat_weight_report.json',
      {},
      { blocked: laterBlocked },
    ),
    stage(
      'WEIGHT_REFINEMENT',
      evaluateWeightProblemChecks(false)
        .map((item) => item.check)
        .join(', '),
      'goat_weight_report.json',
      {},
      { blocked: laterBlocked },
    ),
    stage(
      'FACIAL_SYSTEM_BUILD',
      `${missing} Face controls planned: ${FACE_CONTROLS.length}.`,
      'goat_face_report.json',
      {},
      { blocked: laterBlocked },
    ),
    stage(
      'VISEME_SYSTEM_BUILD',
      goatSyntheticTalkingPlan().source,
      'goat_viseme_report.json',
      { visemes: goatSyntheticTalkingPlan().cues.length },
      { blocked: laterBlocked },
    ),
    stage(
      'SECONDARY_CONTROLS',
      `${missing} Secondary controls planned: ${SECONDARY_CONTROLS.map((item) => item.id).join(', ')}.`,
      'goat_rig_build_report.json',
      {},
      { blocked: laterBlocked },
    ),
    stage('CORRECTIVE_DEFORMATION_BUILD', missing, 'goat_deformation_report.json', {}, { blocked: laterBlocked }),
    stage('ACCESSORY_BINDING', missing, 'goat_rig_build_report.json', {}, { blocked: laterBlocked }),
    stage('DEFORMATION_TESTS', missing, 'goat_deformation_report.json', {}, { blocked: laterBlocked }),
    stage(
      'ANIMATION_TESTS',
      `${missing} ${VALIDATION_CLIP_PLANS.length} validation clips are planned, not episode animation.`,
      'goat_animation_validation.json',
      {},
      { blocked: laterBlocked },
    ),
    stage(
      'PERFORMANCE_PROFILE',
      compilePerformanceReport(null).recommendations.join(' '),
      'goat_performance_report.json',
      {},
      { blocked: laterBlocked },
    ),
    stage('RENDER_QA', missing, 'goat_deformation_report.json', {}, { blocked: laterBlocked }),
    stage('EXPORT_QA', missing, 'goat_character_master_gate.json', {}, { blocked: laterBlocked }),
    stage('CHARACTER_MASTER_GATE', gate.reason, 'goat_character_master_gate.json', {}, { blocked: laterBlocked }),
  ];

  if (remoteHashLocked) {
    for (const item of stages) {
      if (item.stage === 'SOURCE_INTAKE' || item.stage === 'SOURCE_HASH_LOCK') {
        item.disposition = 'REUSED';
        item.status = 'PLANNED';
      }
    }
  }

  if (stages.length !== BUILD_STAGES.length) {
    throw new Error('Pipeline must emit every character-build stage.');
  }

  return {
    characterId: 'CHAR_GOAT_001' as const,
    resumable: true,
    deterministic: true,
    failClosed: true,
    idempotent: true,
    dispositions: ['CREATED', 'REUSED', 'UPDATED', 'BLOCKED', 'FAILED'] as const,
    stages,
    execution: planGoatCharacterExecution(),
    identity: compileGoatIdentityReport({ realInspectionAvailable: intake.present }),
    gate,
    pipelineHash: sha256Canonical({
      stages: stages.map((item) => ({
        stage: item.stage,
        disposition: item.disposition,
        status: item.status,
      })),
    }),
  };
}

import { FOUNDING_CODES } from '@doodle-dash/domain';
import { evaluateAllRigBindings } from './rig';
import {
  hasCameraMotion,
  hasCharacterMotion,
  summarizeChannelIssues,
} from './motion';
import { evaluateLightingState, findDuplicateProductionLights } from './lighting';
import {
  evaluateCharacterAccessoryHierarchy,
  evaluateMapMarkHierarchy,
  evaluateSceneAssembly,
} from './hierarchy';
import {
  LocalQcEvidenceSchema,
  QC_GATE_IDS,
  type LocalQcEvidence,
  type LocalQcReport,
  type QcGateId,
  type QcGateResult,
  type QcGateStatus,
} from './types';

function gate(id: QcGateId, status: QcGateStatus, reason: string, evidence?: Record<string, unknown>): QcGateResult {
  return { id, status, reason, evidence };
}

function statusBool(ok: boolean, blocked = false): QcGateStatus {
  if (blocked) return 'BLOCKED';
  return ok ? 'PASS' : 'FAIL';
}

/**
 * Evaluate local QC gates from structured scene evidence.
 * READY_FOR_CLOUD_ACCEPTANCE is fail-closed: any FAIL/BLOCKED prerequisite ⇒ false.
 */
export function evaluateLocalQcGates(raw: unknown): LocalQcReport {
  const evidence: LocalQcEvidence = LocalQcEvidenceSchema.parse(raw);
  const gates = {} as Record<QcGateId, QcGateResult>;
  const agent1: string[] = [];
  const agent2: string[] = [];

  // RIG_BINDING_VALID
  const rig = evaluateAllRigBindings(evidence.rigBindings);
  gates.RIG_BINDING_VALID = gate('RIG_BINDING_VALID', statusBool(rig.ok), rig.reason, {
    foundingCodes: FOUNDING_CODES,
    failures: rig.failures,
  });
  if (!rig.ok) agent1.push(...rig.failures);

  // PIP_MOTION_VALID — camera motion must never count
  const pipMoves = hasCharacterMotion(evidence.pipMotion);
  const cameraMoves = hasCameraMotion(evidence.cameraMotion);
  gates.PIP_MOTION_VALID = gate(
    'PIP_MOTION_VALID',
    statusBool(pipMoves),
    pipMoves
      ? 'Pip character motion detected (root/bones/shape keys)'
      : cameraMoves
        ? 'Pip static; camera motion present but must not count as character animation'
        : 'Pip static; no character motion evidence',
    {
      pipMotion: evidence.pipMotion,
      cameraMotion: evidence.cameraMotion,
      cameraOnly: !pipMoves && cameraMoves,
    },
  );
  if (!pipMoves) agent1.push(gates.PIP_MOTION_VALID.reason);

  // GOAT_MOTION_VALID
  const goatMoves = hasCharacterMotion(evidence.goatMotion);
  gates.GOAT_MOTION_VALID = gate(
    'GOAT_MOTION_VALID',
    statusBool(goatMoves),
    goatMoves
      ? 'Goat character motion detected (root/bones/shape keys)'
      : cameraMoves
        ? 'Goat static; camera motion present but must not count as character animation'
        : 'Goat static; no character motion evidence',
    {
      goatMotion: evidence.goatMotion,
      cameraMotion: evidence.cameraMotion,
      cameraOnly: !goatMoves && cameraMoves,
    },
  );
  if (!goatMoves) agent1.push(gates.GOAT_MOTION_VALID.reason);

  // ANIMATION_CHANNELS_VALID
  const channelIssues = [
    ...summarizeChannelIssues(evidence.pipMotion.fcurves),
    ...summarizeChannelIssues(evidence.goatMotion.fcurves),
  ];
  // If motion is claimed via action but channels are constant / unevaluated → fail
  const claimedButInvalid =
    (evidence.pipMotion.actionAssigned &&
      !pipMoves &&
      (evidence.pipMotion.fcurves?.length ?? 0) > 0) ||
    (evidence.goatMotion.actionAssigned &&
      !goatMoves &&
      (evidence.goatMotion.fcurves?.length ?? 0) > 0);
  const channelsOk = channelIssues.length === 0 && !claimedButInvalid;
  gates.ANIMATION_CHANNELS_VALID = gate(
    'ANIMATION_CHANNELS_VALID',
    statusBool(channelsOk),
    channelsOk
      ? 'animation channels valid (no constant/mismatched/unevaluated failures)'
      : [...channelIssues, claimedButInvalid ? 'action assigned without evaluated character motion' : '']
          .filter(Boolean)
          .join('; '),
    { channelIssues, claimedButInvalid },
  );
  if (!channelsOk) agent1.push(gates.ANIMATION_CHANNELS_VALID.reason);

  // LIGHTING_STATE_VALID
  const lighting = evaluateLightingState({
    lights: evidence.lights,
    lightingState: evidence.lightingState,
  });
  gates.LIGHTING_STATE_VALID = gate('LIGHTING_STATE_VALID', statusBool(lighting.ok), lighting.reason);
  if (!lighting.ok) agent2.push(lighting.reason);

  // NO_DUPLICATE_LIGHTS
  const dupes = findDuplicateProductionLights(evidence.lights);
  gates.NO_DUPLICATE_LIGHTS = gate(
    'NO_DUPLICATE_LIGHTS',
    statusBool(dupes.length === 0),
    dupes.length === 0 ? 'no duplicate production lights' : `duplicate production lights: ${dupes.join(', ')}`,
    { duplicates: dupes },
  );
  if (dupes.length) agent2.push(gates.NO_DUPLICATE_LIGHTS.reason);

  // ASSET_HIERARCHY_VALID
  const mapMark = evaluateMapMarkHierarchy(evidence.hierarchy);
  const accessories = evaluateCharacterAccessoryHierarchy(evidence.hierarchy);
  const hierarchyOk = mapMark.ok && accessories.ok;
  gates.ASSET_HIERARCHY_VALID = gate(
    'ASSET_HIERARCHY_VALID',
    statusBool(hierarchyOk),
    hierarchyOk ? 'asset hierarchy valid (MapMark + accessories)' : [mapMark.reason, accessories.reason].join('; '),
    { mapMark, accessories },
  );
  if (!hierarchyOk) {
    if (!mapMark.ok) agent2.push(mapMark.reason);
    if (!accessories.ok) agent1.push(...accessories.issues);
  }

  // SCENE_ASSEMBLY_VALID
  const assembly = evaluateSceneAssembly(evidence.sceneAssembly);
  gates.SCENE_ASSEMBLY_VALID = gate('SCENE_ASSEMBLY_VALID', statusBool(assembly.ok), assembly.reason);
  if (!assembly.ok) agent2.push(assembly.reason);

  // TECHNICAL_RENDER_VALID — technical only; never implies visual quality
  const tech = evidence.technicalRender;
  const techOk =
    tech.outputExists &&
    !tech.corrupt &&
    (tech.blackFrameRatio === undefined || tech.blackFrameRatio < 0.25) &&
    (tech.expectedFrameCount === undefined ||
      tech.frameCount === undefined ||
      tech.frameCount >= tech.expectedFrameCount);
  gates.TECHNICAL_RENDER_VALID = gate(
    'TECHNICAL_RENDER_VALID',
    statusBool(techOk),
    techOk ? 'technical render artifacts acceptable' : 'technical render validation failed',
    { technicalRender: tech },
  );

  // VISUAL_QUALITY_VALID — separate from technical; camera-only fails
  const cameraOnlyIllusion =
    evidence.visualQuality.cameraOnlyIllusion === true ||
    ((!pipMoves || !goatMoves) && cameraMoves && !evidence.visualQuality.characterMotionVisible);
  const visualOk =
    evidence.visualQuality.characterMotionVisible &&
    evidence.visualQuality.lightingLooksProduction &&
    !evidence.visualQuality.hierarchyArtifactsVisible &&
    pipMoves &&
    goatMoves &&
    !cameraOnlyIllusion;
  gates.VISUAL_QUALITY_VALID = gate(
    'VISUAL_QUALITY_VALID',
    statusBool(visualOk),
    visualOk
      ? 'visual quality signals accept character motion + lighting + hierarchy'
      : cameraOnlyIllusion
        ? 'visual quality failed: camera-only motion cannot satisfy character animation'
        : 'visual quality failed',
    { visualQuality: evidence.visualQuality, cameraOnlyIllusion, pipMoves, goatMoves },
  );
  if (!visualOk) {
    if (cameraOnlyIllusion || !pipMoves || !goatMoves) agent1.push(gates.VISUAL_QUALITY_VALID.reason);
    if (!evidence.visualQuality.lightingLooksProduction || evidence.visualQuality.hierarchyArtifactsVisible) {
      agent2.push(gates.VISUAL_QUALITY_VALID.reason);
    }
  }

  // LOCAL_VISUAL_ACCEPTANCE — explicit local acceptance signal + gates above
  const localVisual =
    evidence.localVisualAcceptance === true &&
    visualOk &&
    techOk &&
    hierarchyOk &&
    assembly.ok &&
    lighting.ok &&
    dupes.length === 0;
  gates.LOCAL_VISUAL_ACCEPTANCE = gate(
    'LOCAL_VISUAL_ACCEPTANCE',
    statusBool(localVisual),
    localVisual
      ? 'local visual acceptance granted'
      : 'local visual acceptance denied (fail closed)',
  );

  // READY_FOR_CLOUD_ACCEPTANCE — fail-closed aggregate
  const prerequisiteIds = QC_GATE_IDS.filter((id) => id !== 'READY_FOR_CLOUD_ACCEPTANCE');
  const prerequisiteFail = prerequisiteIds.some((id) => gates[id].status !== 'PASS');
  const ready = !prerequisiteFail;
  gates.READY_FOR_CLOUD_ACCEPTANCE = gate(
    'READY_FOR_CLOUD_ACCEPTANCE',
    statusBool(ready),
    ready
      ? 'all local QC gates passed; eligible for cloud acceptance preflight'
      : 'fail-closed: one or more local QC gates did not PASS',
    {
      failedOrBlocked: prerequisiteIds.filter((id) => gates[id].status !== 'PASS'),
    },
  );

  let passed = 0;
  let failed = 0;
  let blocked = 0;
  for (const id of QC_GATE_IDS) {
    if (gates[id].status === 'PASS') passed += 1;
    else if (gates[id].status === 'BLOCKED') blocked += 1;
    else failed += 1;
  }

  return {
    gates,
    readyForCloudAcceptance: ready,
    failClosed: true,
    summary: { passed, failed, blocked },
    defects: {
      agent1RiggingAnimation: unique(agent1),
      agent2LightingScene: unique(agent2),
    },
  };
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

/** Integration hook for DoodleDash Production / cloud preflight consumers. */
export function isReadyForCloudAcceptance(raw: unknown): boolean {
  return evaluateLocalQcGates(raw).readyForCloudAcceptance;
}

export function assertReadyForCloudAcceptance(raw: unknown): void {
  const report = evaluateLocalQcGates(raw);
  if (!report.readyForCloudAcceptance) {
    const failed = Object.values(report.gates)
      .filter((g) => g.id !== 'READY_FOR_CLOUD_ACCEPTANCE' && g.status !== 'PASS')
      .map((g) => `${g.id}=${g.status}`)
      .join(', ');
    throw new Error(`READY_FOR_CLOUD_ACCEPTANCE=false (${failed})`);
  }
}

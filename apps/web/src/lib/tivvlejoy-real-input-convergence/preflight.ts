import { sampleEpisodeWithKnownHashes } from '@/lib/tivvlejoy-episode-scene-planner';
import { sceneryGapKind } from './classify-real';
import { currentRigReadiness } from './rig-arrival';
import { blenderInstallationPlan, renderEnvironmentReadiness } from './blender-plan';
import type { VoiceConvergence } from './types';
import {
  EP012_REQUIRED_ROLES,
  FIRST_EPISODE_PREFLIGHT_SCHEMA,
  PREFLIGHT_SUBSYSTEMS,
  SHOT_MATRIX_COLUMNS,
  type ApprovalCounts,
  type EvidenceBadge,
  type FirstEpisodePreflight,
  type PreflightState,
  type RealLogicalCandidate,
  type SceneryGapKind,
  type ShotMatrixColumn,
  type ShotPreflightRow,
  type SubsystemPreflight,
} from './types';

export type PreflightInput = {
  voice: VoiceConvergence;
  candidates: readonly RealLogicalCandidate[];
  realApprovedLogicalAssets: number;
  humanApprovals: number;
  blenderAvailable: boolean;
  paidRenderAuthorized: boolean;
  realMediaReceipts: number;
};

function badgeFor(state: PreflightState): EvidenceBadge {
  if (state === 'REAL_READY' || state === 'REAL_PARTIAL') return 'REAL';
  if (state === 'SYNTHETIC_ONLY') return 'SYNTHETIC';
  if (state === 'WAITING_HUMAN_APPROVAL') return 'HUMAN APPROVAL';
  if (state === 'WAITING_PAID_AUTHORIZATION') return 'PAID AUTH';
  return 'PENDING';
}

function subsystem(
  name: SubsystemPreflight['subsystem'],
  state: PreflightState,
  blocker: string | null,
): SubsystemPreflight {
  return {
    subsystem: name,
    state,
    evidenceBadge: badgeFor(state),
    blocker,
    syntheticCannotSatisfy: true,
  };
}

export function firstEpisodeCoverage(input: {
  candidates: readonly RealLogicalCandidate[];
  realApprovedLogicalAssets: number;
}): Record<(typeof EP012_REQUIRED_ROLES)[number], SceneryGapKind> {
  const coverage = {} as Record<(typeof EP012_REQUIRED_ROLES)[number], SceneryGapKind>;
  for (const role of EP012_REQUIRED_ROLES) {
    const inspected = input.candidates.some((candidate) => candidate.roles.includes(role));
    const native = role === 'SKY';
    coverage[role] = sceneryGapKind({
      approved: false,
      inspected,
      nativeProcedural: native && !inspected,
      syntheticOnly: !inspected && !native,
    });
    if (input.realApprovedLogicalAssets > 0 && inspected) {
      coverage[role] = 'REAL_APPROVED';
    }
  }
  return coverage;
}

export function compileFirstEpisodePreflight(input: PreflightInput): FirstEpisodePreflight {
  const plan = sampleEpisodeWithKnownHashes();
  const directed = true;
  const rigs = currentRigReadiness();
  const blender = blenderInstallationPlan();
  const render = renderEnvironmentReadiness();
  const realVoice = input.voice.pipConfirmedRealReceipts + input.voice.goatConfirmedRealReceipts;
  const inspected = input.candidates.length > 0;
  const approved = input.realApprovedLogicalAssets > 0 && input.humanApprovals > 0;

  const subsystems: SubsystemPreflight[] = [
    subsystem('SCRIPT', 'REAL_PARTIAL', 'Script planner hashes exist; production lock remains NOT_LOCKABLE until real voice, rigs, and approvals bind.'),
    subsystem(
      'VOICE',
      realVoice > 0 ? 'REAL_PARTIAL' : 'SYNTHETIC_ONLY',
      realVoice > 0 ? 'Some real receipts exist but exact timing is incomplete.' : 'EP012 voice fixtures are synthetic and cannot satisfy real preflight.',
    ),
    subsystem(
      'SCENERY',
      approved ? 'REAL_READY' : inspected ? 'WAITING_HUMAN_APPROVAL' : 'WAITING_EXTERNAL_INPUT',
      approved ? null : inspected ? 'Real candidates are inspected but not human-approved.' : 'No real approved scenery children exist for EP012 roles.',
    ),
    subsystem('RIGS', 'WAITING_EXTERNAL_INPUT', 'Pip and Goat production rigs are NOT_PRESENT.'),
    subsystem('DIRECTING', directed ? 'SYNTHETIC_ONLY' : 'BLOCKED', 'Director package exists as synthetic/planning evidence only.'),
    subsystem('ANIMATION', 'WAITING_EXTERNAL_INPUT', 'Animation manifests cannot become real without admitted rigs and real voice timing.'),
    subsystem('CAMERA', 'SYNTHETIC_ONLY', 'Camera plans are directed fixtures, not shot-approved photography.'),
    subsystem('STAGING', 'SYNTHETIC_ONLY', 'Staging plans are synthetic until real scenery and rigs exist.'),
    subsystem('LIGHTING', 'SYNTHETIC_ONLY', 'Lighting direction is planned only; Gaffer remains optional and not activated.'),
    subsystem('VFX', 'SYNTHETIC_ONLY', 'VFX direction is planned only.'),
    subsystem('EDITORIAL', 'SYNTHETIC_ONLY', 'Editorial timeline is a planning package, not a real cut.'),
    subsystem('AUDIO', realVoice > 0 ? 'REAL_PARTIAL' : 'SYNTHETIC_ONLY', 'No real mix exists. Synthetic voice cannot stand in for production audio.'),
    subsystem('CAPTIONS', 'SYNTHETIC_ONLY', 'Caption plans exist; they cannot lock without real line timing.'),
    subsystem('SHOT_REVIEW', 'WAITING_HUMAN_APPROVAL', 'No human visual shot approvals have been issued.'),
    subsystem('ASSEMBLY', 'SYNTHETIC_ONLY', 'Shot assembly manifests are planning fixtures.'),
    subsystem(
      'BLENDER',
      input.blenderAvailable || blender.reasonNotInstalled.includes('detected') ? 'REAL_PARTIAL' : 'WAITING_EXTERNAL_INPUT',
      'Deep Blender inspection remains pending. Local availability is not admission.',
    ),
    subsystem('RENDER', input.paidRenderAuthorized ? 'REAL_PARTIAL' : 'WAITING_PAID_AUTHORIZATION', 'Paid render authorization is required. RunPod was not launched.'),
    subsystem('QC', input.realMediaReceipts > 0 ? 'REAL_PARTIAL' : 'WAITING_EXTERNAL_INPUT', 'Real media QC requires an actual rendered media receipt.'),
    subsystem('DELIVERY', 'BLOCKED', 'Delivery cannot compile without real media, approvals, and paid render.'),
  ];

  const shots: ShotPreflightRow[] = plan.shots.map((shot) => {
    const hasDialogue = shot.dialogueRefs.length > 0;
    const voiceState: PreflightState = !hasDialogue
      ? 'REAL_PARTIAL'
      : realVoice > 0 && shot.dialogueRefs.every((ref) => input.voice.bindings.find((item) => item.dialogueRef === ref)?.realReceipt)
        ? 'REAL_PARTIAL'
        : 'SYNTHETIC_ONLY';
    const columns: Record<ShotMatrixColumn, PreflightState> = {
      script: 'REAL_PARTIAL',
      voice: voiceState,
      camera: 'SYNTHETIC_ONLY',
      staging: 'SYNTHETIC_ONLY',
      scenery: approved ? 'REAL_PARTIAL' : inspected ? 'WAITING_HUMAN_APPROVAL' : 'WAITING_EXTERNAL_INPUT',
      rig: 'WAITING_EXTERNAL_INPUT',
      animation: 'WAITING_EXTERNAL_INPUT',
      visualApproval: 'WAITING_HUMAN_APPROVAL',
      renderReadiness: input.paidRenderAuthorized ? 'WAITING_HUMAN_APPROVAL' : 'WAITING_PAID_AUTHORIZATION',
      qc: 'WAITING_EXTERNAL_INPUT',
    };
    return {
      shotId: shot.shotId,
      columns,
      exactBlocker: `WAITING_EXTERNAL_INPUT: production ${shot.charactersVisible.includes('GOAT') || shot.charactersVisible.includes('PIP') ? 'Pip/Goat rigs' : 'hero scenery and rigs'} are not present; synthetic fixtures cannot satisfy real preflight.`,
      evidenceBadge: 'PENDING',
    };
  });

  void rigs;
  void render;
  void PREFLIGHT_SUBSYSTEMS;
  void SHOT_MATRIX_COLUMNS;

  return {
    schemaVersion: FIRST_EPISODE_PREFLIGHT_SCHEMA,
    episodeId: 'EP012',
    episodeVersion: 'ep012-plan-v1',
    title: 'The Bakery Map',
    subsystems,
    shots,
    shotCount: shots.length,
    realReadyShots: shots.filter((shot) => Object.values(shot.columns).every((state) => state === 'REAL_READY')).length,
    partialShots: shots.filter((shot) => Object.values(shot.columns).some((state) => state === 'REAL_PARTIAL') && Object.values(shot.columns).every((state) => state !== 'REAL_READY')).length,
    blockedShots: shots.filter((shot) => Object.values(shot.columns).some((state) => state === 'BLOCKED' || state === 'WAITING_EXTERNAL_INPUT' || state === 'WAITING_HUMAN_APPROVAL' || state === 'WAITING_PAID_AUTHORIZATION' || state === 'SYNTHETIC_ONLY')).length,
    syntheticCannotSatisfyRealPreflight: true,
    lockState: 'NOT_LOCKABLE',
  };
}

export function approvalCountsFrom(input: {
  downloaded: number;
  hashesVerified: number;
  inspected: number;
  candidates: readonly RealLogicalCandidate[];
}): ApprovalCounts {
  return {
    realSourcesDownloaded: input.downloaded,
    realHashesVerified: input.hashesVerified,
    realSourcesStaticallyInspected: input.inspected,
    realLogicalChildrenDiscovered: input.candidates.length,
    realHeroCandidates: input.candidates.filter((item) => item.heroCandidate).length,
    realInteriorCandidates: input.candidates.filter((item) => item.interiorCandidate).length,
    realMountainCandidates: input.candidates.filter((item) => item.mountainCandidate).length,
    realPropCandidates: input.candidates.filter((item) => item.propCandidate).length,
    realCandidatesReadyForVisualReview: input.candidates.filter((item) => item.readyForVisualReview).length,
    realCandidatesTechnicallyBlocked: input.candidates.filter((item) => item.technicallyBlocked).length,
    humanSceneryApprovalsIssued: 0,
    realApprovedLogicalAssets: 0,
  };
}

export function preflightImpact(base: FirstEpisodePreflight, changedShotIds: readonly string[]): FirstEpisodePreflight {
  return {
    ...base,
    shots: base.shots.map((shot) =>
      changedShotIds.includes(shot.shotId)
        ? { ...shot, exactBlocker: `${shot.exactBlocker} [impact:${shot.shotId}]` }
        : shot,
    ),
  };
}

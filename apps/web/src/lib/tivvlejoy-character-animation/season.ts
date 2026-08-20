import { simulateSeason, type SimulatedSeason } from '@/lib/tivvlejoy-production-studio/simulation';
import { evaluateRigAdmission } from './admission';
import { cacheIdentitySha256, evaluateCache, reusableSemanticContext, type AnimationCacheEntry } from './cache';
import { detectAnimationContinuity, type ShotContinuitySnapshot } from './continuity';
import { detectContactDefects } from './contact';
import {
  approvedLikeSyntheticContract,
  flipTestCandidateContract,
  syntheticGoatContract,
  syntheticPipContract,
  SYNTHETIC_BANNER,
} from './fixtures';
import { sha256Canonical } from './hash';
import { planCharacterShot, type ShotAnimationPlan } from './planner';
import { detectPropTeleport, mapHandoffPlan } from './props';
import { planAnimationBatches } from './scheduler';
import { ANIMATION_SEASON_SCHEMA } from './types';

export type AnimationSeasonSimulation = {
  schema: typeof ANIMATION_SEASON_SCHEMA;
  banner: typeof SYNTHETIC_BANNER;
  totalEpisodes: number;
  totalShots: number;
  pipDependentShots: number;
  goatDependentShots: number;
  dialogueShots: number;
  locomotionShots: number;
  propInteractionShots: number;
  lowConfidenceVisemeShots: number;
  shotsPlanReady: number;
  shotsBlockedByPipRig: number;
  shotsBlockedByGoatRig: number;
  shotsNeedingVoiceTiming: number;
  continuityWarnings: number;
  animationQcBlockers: number;
  reusableActionPlanCount: number;
  cacheHitEstimate: number;
  batchCount: number;
  syntheticRigsHumanApproved: false;
  realProductionRig: false;
  simulationSha256: string;
};

function locomotionFor(shotIndex: number): string {
  if (shotIndex % 12 === 2) return 'walk';
  if (shotIndex % 12 === 4) return 'run';
  if (shotIndex % 12 === 6) return 'jump';
  if (shotIndex % 12 === 8) return 'turn';
  return 'stationary';
}

function propFor(shotIndex: number): string | undefined {
  if (shotIndex % 12 === 3) return 'PICK_UP';
  if (shotIndex % 12 === 7) return 'HAND_OVER';
  if (shotIndex % 12 === 9) return 'RECEIVE';
  if (shotIndex % 12 === 11) return 'PUT_DOWN';
  return undefined;
}

export function planSeasonShots(season: SimulatedSeason, options: { useSyntheticContracts?: boolean } = {}): ShotAnimationPlan[] {
  const pip = options.useSyntheticContracts === false ? null : syntheticPipContract();
  const goat = options.useSyntheticContracts === false ? null : syntheticGoatContract();
  const plans: ShotAnimationPlan[] = [];
  for (const episode of season.episodes) {
    episode.shots.forEach((shot, index) => {
      const locomotion = locomotionFor(index + 1);
      const prop = propFor(index + 1);
      const speaker = shot.charactersVisible.includes(shot.charactersVisible[0] ?? 'PIP') ? (shot.charactersVisible[0] === 'GOAT' ? 'GOAT' : 'PIP') : 'PIP';
      for (const raw of shot.charactersVisible) {
        const characterId = raw === 'GOAT' ? 'GOAT' : 'PIP';
        const speaking = characterId === speaker && Boolean(shot.dialogueRef);
        const receipt = episode.voiceReceipts.find((item) => item.dialogueRef === shot.dialogueRef);
        plans.push(
          planCharacterShot({
            shotId: shot.shotId,
            characterId,
            contract: characterId === 'PIP' ? pip : goat,
            speaking,
            locomotion,
            prop,
            partner: characterId === 'PIP' ? 'GOAT' : 'PIP',
            durationMs: speaking ? 2600 : 2000,
            seed: shot.shotId.length * 17,
            voice: speaking
              ? {
                  audioReceiptRef: receipt?.receiptRef,
                  audioSha256: receipt?.receiptSha256,
                  durationMs: 2600,
                }
              : undefined,
            storyCriticalProp: Boolean(prop),
          }),
        );
      }
    });
  }
  return plans;
}

export function simulateAnimationSeason(input: { episodeCount?: number; shotsPerEpisode?: number } = {}): AnimationSeasonSimulation {
  const season = simulateSeason({ episodeCount: input.episodeCount ?? 60, shotsPerEpisode: input.shotsPerEpisode ?? 12 });
  const plans = planSeasonShots(season);
  const pipAdmission = evaluateRigAdmission({ characterId: 'PIP', contract: syntheticPipContract() });
  const goatAdmission = evaluateRigAdmission({ characterId: 'GOAT', contract: syntheticGoatContract() });
  const snapshots = new Map<string, ShotContinuitySnapshot>();
  let continuityWarnings = 0;
  const cacheStore = new Map<string, AnimationCacheEntry>();
  let cacheHits = 0;
  const actionFoundations = new Set<string>();

  for (const plan of plans) {
    const snap: ShotContinuitySnapshot = {
      shotId: plan.shotId,
      characterId: plan.characterId,
      positionToken: plan.locomotion.phase,
      facing: String(plan.locomotion.path.at(-1)?.facing ?? 0),
      screenDirection: 'RIGHT',
      poseToken: plan.body.personality,
      propAttachment: plan.props.events[0]?.toCarrier ?? 'none',
      gazeTarget: plan.gaze.primary,
      motionEntry: plan.usesLocomotion ? 'ARRIVE' : 'STATIONARY',
      motionExit: plan.usesLocomotion ? 'DEPART' : 'HOLD',
      locomotionPhase: plan.usesLocomotion ? 'CONTACT' : 'PLANTED',
      hardCut: false,
    };
    const previous = snapshots.get(plan.characterId);
    if (previous) continuityWarnings += detectAnimationContinuity(previous, snap).length;
    snapshots.set(`${plan.characterId}:${plan.shotId}`, snap);
    snapshots.set(plan.characterId, snap);
    const context = reusableSemanticContext({
      emotionFamily: plan.intent.emotion,
      speedClass: plan.locomotionClass,
      speaking: plan.speaking,
    });
    actionFoundations.add(`${plan.characterId}:${plan.locomotionClass}:${plan.intent.emotion}`);
    const key = {
      category: plan.usesLocomotion ? (plan.locomotionClass === 'RUN' ? 'RUN_CYCLE_SEMANTIC' : 'WALK_CYCLE_SEMANTIC') : 'IDLE_FOUNDATION',
      characterId: plan.characterId,
      rigVersion: plan.manifest.rig.rigVersion,
      rigDependencySha256: plan.manifest.rig.rigDependencySha256,
      semanticContextSha256: context,
    } as const;
    const stored = cacheStore.get(`${key.category}:${key.characterId}:${context}`);
    const status = evaluateCache({ requested: key, stored: stored ?? null });
    if (status === 'CACHE_REUSABLE') cacheHits += 1;
    else {
      cacheStore.set(`${key.category}:${key.characterId}:${context}`, {
        key,
        identitySha256: cacheIdentitySha256(key),
        payloadSha256: plan.manifest.shotAnimationDependencySha256,
      });
    }
  }

  const batches = planAnimationBatches({
    episodeHorizon: 60,
    shots: plans.map((plan) => ({
      shotId: plan.shotId,
      episodeId: plan.shotId.slice(0, 5),
      characterIds: [plan.characterId],
      locationId: plan.shotId.includes('01') ? 'bakery' : 'forest_exit',
      dialogueReady: plan.timing.fallbackTimingSource !== 'TIMING_UNAVAILABLE',
      animationDependencyReady: true,
      locomotionClass: plan.locomotionClass,
      actionFoundation: plan.intent.emotion,
      pipRigVersion: 'SYNTHETIC_V1',
      goatRigVersion: 'SYNTHETIC_V1',
      pipAdmitted: pipAdmission.approvedForAnimation,
      goatAdmitted: goatAdmission.approvedForAnimation,
    })),
  });

  const shotIds = new Set(plans.map((plan) => plan.shotId));
  const byShot = new Map<string, ShotAnimationPlan[]>();
  for (const plan of plans) {
    const list = byShot.get(plan.shotId) ?? [];
    list.push(plan);
    byShot.set(plan.shotId, list);
  }

  const body = {
    schema: ANIMATION_SEASON_SCHEMA,
    banner: SYNTHETIC_BANNER,
    totalEpisodes: season.episodeCount,
    totalShots: season.shotCount,
    pipDependentShots: [...shotIds].filter((id) => byShot.get(id)?.some((plan) => plan.characterId === 'PIP')).length,
    goatDependentShots: [...shotIds].filter((id) => byShot.get(id)?.some((plan) => plan.characterId === 'GOAT')).length,
    dialogueShots: [...shotIds].filter((id) => byShot.get(id)?.some((plan) => plan.speaking)).length,
    locomotionShots: [...shotIds].filter((id) => byShot.get(id)?.some((plan) => plan.usesLocomotion)).length,
    propInteractionShots: [...shotIds].filter((id) => byShot.get(id)?.some((plan) => plan.usesProp)).length,
    lowConfidenceVisemeShots: [...shotIds].filter((id) => byShot.get(id)?.some((plan) => plan.visemeLowConfidence && plan.speaking)).length,
    shotsPlanReady: season.shotCount,
    shotsBlockedByPipRig: [...shotIds].filter((id) => byShot.get(id)?.some((plan) => plan.characterId === 'PIP' && !plan.admitted)).length,
    shotsBlockedByGoatRig: [...shotIds].filter((id) => byShot.get(id)?.some((plan) => plan.characterId === 'GOAT' && !plan.admitted)).length,
    shotsNeedingVoiceTiming: [...shotIds].filter((id) =>
      byShot.get(id)?.some((plan) => plan.speaking && plan.timing.fallbackTimingSource !== 'TIMING_EXACT'),
    ).length,
    continuityWarnings,
    animationQcBlockers: plans.filter((plan) => !plan.admitted).length,
    reusableActionPlanCount: actionFoundations.size,
    cacheHitEstimate: cacheHits,
    batchCount: batches.groups.length,
    syntheticRigsHumanApproved: false as const,
    realProductionRig: false as const,
  };
  return { ...body, simulationSha256: sha256Canonical(body) };
}

export function simulateRigArrivalFlip() {
  const unresolvedPip = evaluateRigAdmission({ characterId: 'PIP' });
  const unresolvedGoat = evaluateRigAdmission({ characterId: 'GOAT' });
  const approvedLikePip = evaluateRigAdmission({
    characterId: 'PIP',
    contract: approvedLikeSyntheticContract('PIP'),
    inspectionPresent: true,
    capabilityCheckComplete: true,
    visualTestPresent: true,
    deformationEvidenceRef: 'synthetic-deform',
    humanApprovalReceiptRef: 'synthetic-human',
    humanApprovalSha256: 'synthetic-human-sha',
    characterIdentityCompatible: true,
    blenderCompatible: true,
  });
  const approvedLikeGoat = evaluateRigAdmission({
    characterId: 'GOAT',
    contract: approvedLikeSyntheticContract('GOAT'),
    inspectionPresent: true,
    capabilityCheckComplete: true,
    visualTestPresent: true,
    deformationEvidenceRef: 'synthetic-deform',
    humanApprovalReceiptRef: 'synthetic-human',
    humanApprovalSha256: 'synthetic-human-sha',
    characterIdentityCompatible: true,
    blenderCompatible: true,
  });
  const candidatePip = evaluateRigAdmission({
    characterId: 'PIP',
    contract: flipTestCandidateContract('PIP'),
    inspectionPresent: true,
    capabilityCheckComplete: true,
    visualTestPresent: true,
    deformationEvidenceRef: 'candidate-deform',
    humanApprovalReceiptRef: 'candidate-human',
    humanApprovalSha256: 'candidate-human-sha',
    characterIdentityCompatible: true,
    blenderCompatible: true,
  });
  return {
    initialStudio: 'WAITING_FOR_CHARACTER_RIGS' as const,
    unresolved: { pip: unresolvedPip.state, goat: unresolvedGoat.state },
    approvedLike: {
      pip: approvedLikePip.state,
      goat: approvedLikeGoat.state,
      pipApproved: approvedLikePip.approvedForAnimation,
      goatApproved: approvedLikeGoat.approvedForAnimation,
      calledRealApproved: false,
    },
    afterCandidateFlip: {
      pip: candidatePip.state,
      goatEligibleNext: ['WAITING_FOR_ANIMATION_PLAN', 'WAITING_FOR_ANIMATION_QC', 'READY_FOR_CHARACTER_ANIMATION_ASSEMBLY'],
      sceneryInvalidated: false,
      voiceReceiptsInvalidated: false,
      realProductionRig: false,
    },
    syntheticCannotApprove: true as const,
  };
}

export function mapHandoffStress(shotIds: string[]) {
  const plan = mapHandoffPlan(shotIds);
  const missingTransfer = detectPropTeleport([
    { shotId: shotIds[0] ?? 'A', propId: 'STORY_MAP', fromCarrier: null, toCarrier: 'PIP', state: 'ATTACHED' },
    { shotId: shotIds[1] ?? 'B', propId: 'STORY_MAP', fromCarrier: 'GOAT', toCarrier: 'GOAT', state: 'HELD' },
  ]);
  return { plan, missingTransferDetected: missingTransfer, teleportOnValidHandoff: detectPropTeleport(plan.events) };
}

export function locomotionStressDefects() {
  return {
    slide: detectContactDefects({ sliding: true }),
    flying: detectContactDefects({ floating: true }),
    speed: detectContactDefects({ speedJump: true }),
    teleport: detectContactDefects({ teleport: true }),
    penetration: detectContactDefects({ penetration: true }),
  };
}

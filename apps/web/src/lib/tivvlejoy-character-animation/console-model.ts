import { simulateSeason } from '@/lib/tivvlejoy-production-studio/simulation';
import { evaluateRigAdmission } from './admission';
import { dryRunRigArrival } from './arrival';
import { PIP_CAPABILITY_PROFILE } from './pip-profile';
import { GOAT_CAPABILITY_PROFILE } from './goat-profile';
import { SYNTHETIC_BANNER } from './fixtures';
import { simulateAnimationSeason } from './season';
import { ANIMATION_CONSOLE_SCHEMA } from './types';

export type AnimationConsoleModel = {
  schema: typeof ANIMATION_CONSOLE_SCHEMA;
  banner: typeof SYNTHETIC_BANNER;
  studioReadiness: 'WAITING_FOR_CHARACTER_RIGS';
  softwareLayer: 'CHARACTER_ANIMATION_PIPELINE_OPERATIONAL';
  pip: {
    statusLabel: string;
    state: string;
    requiredControls: string[];
    optionalControls: string[];
  };
  goat: {
    statusLabel: string;
    state: string;
    requiredControls: string[];
    optionalControls: string[];
  };
  episodesWaitingForRig: number;
  shotsWaitingForVoiceTiming: number;
  shotsAnimationPlanReady: number;
  dialogueTimingConfidence: string;
  visemeConfidence: string;
  locomotionPlans: number;
  propInteractions: number;
  continuityWarnings: number;
  animationQcBlockers: number;
  batchCount: number;
  staleAnimationDependencies: number;
  nextSafeActions: string[];
  arrival: ReturnType<typeof dryRunRigArrival>[];
  season: ReturnType<typeof simulateAnimationSeason>;
};

let cached: AnimationConsoleModel | null = null;

export function buildAnimationConsoleModel(): AnimationConsoleModel {
  if (cached) return cached;
  const season = simulateSeason();
  const sim = simulateAnimationSeason({ episodeCount: season.episodeCount, shotsPerEpisode: 12 });
  const pip = evaluateRigAdmission({ characterId: 'PIP' });
  const goat = evaluateRigAdmission({ characterId: 'GOAT' });
  cached = {
    schema: ANIMATION_CONSOLE_SCHEMA,
    banner: SYNTHETIC_BANNER,
    studioReadiness: 'WAITING_FOR_CHARACTER_RIGS',
    softwareLayer: 'CHARACTER_ANIMATION_PIPELINE_OPERATIONAL',
    pip: {
      statusLabel: pip.humanLabel,
      state: pip.state,
      requiredControls: PIP_CAPABILITY_PROFILE.filter((item) => item.requirement === 'REQUIRED').map((item) => item.controlId),
      optionalControls: PIP_CAPABILITY_PROFILE.filter((item) => item.requirement !== 'REQUIRED').map((item) => item.controlId),
    },
    goat: {
      statusLabel: goat.humanLabel,
      state: goat.state,
      requiredControls: GOAT_CAPABILITY_PROFILE.filter((item) => item.requirement === 'REQUIRED').map((item) => item.controlId),
      optionalControls: GOAT_CAPABILITY_PROFILE.filter((item) => item.requirement !== 'REQUIRED').map((item) => item.controlId),
    },
    episodesWaitingForRig: sim.totalEpisodes,
    shotsWaitingForVoiceTiming: sim.shotsNeedingVoiceTiming,
    shotsAnimationPlanReady: sim.shotsPlanReady,
    dialogueTimingConfidence: 'Line-level synthetic receipts only; exact phonemes unavailable',
    visemeConfidence: 'Low-confidence rhythmic beak/jaw plans until phonemes arrive',
    locomotionPlans: sim.locomotionShots,
    propInteractions: sim.propInteractionShots,
    continuityWarnings: sim.continuityWarnings,
    animationQcBlockers: sim.animationQcBlockers,
    batchCount: sim.batchCount,
    staleAnimationDependencies: 0,
    nextSafeActions: [
      'Wait for Michael to return the approved Pip production rig',
      'Wait for Michael to return the approved Goat production rig',
      'Keep planning semantic acting, gaze, blinks, and locomotion without executing Blender',
      'Do not auto-approve synthetic fixtures',
    ],
    arrival: [dryRunRigArrival('PIP'), dryRunRigArrival('GOAT')],
    season: sim,
  };
  return cached;
}

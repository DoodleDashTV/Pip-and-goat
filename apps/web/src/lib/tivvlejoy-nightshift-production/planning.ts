import { sha256Canonical } from './hash';
import {
  DIRECTOR_TO_RENDER_SCHEMA,
  PREVIEW_LADDER,
  QUALITY_TARGETS,
  type PreviewLadderLevel,
  type QualityTarget,
  type ShotIntent,
} from './types';
import type { FinalShotSpec } from './specs';

export type RenderLadderRung = {
  level: PreviewLadderLevel;
  resolution: { width: number; height: number };
  samplingIntent: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  requiredApprovals: string[];
  costClass: 'ZERO' | 'PREVIEW' | 'REVIEW' | 'PAID_FINAL';
  purpose: string;
  executed: false;
  paidAuthorizationIssued: false;
};

export type CriticalPathResult = {
  delayCode: string;
  label: string;
  rank: number;
  captionPolishOutranksRig: false;
};

export type ThroughputEstimate = {
  confidence: 'LOW_CONFIDENCE' | 'MEDIUM_CONFIDENCE' | 'HIGH_CONFIDENCE';
  assumedStaffInvented: false;
  reviewCapacity: number | null;
  animationCapacity: number | null;
  renderCapacity: number | null;
  voiceCapacity: number | null;
  conceptualEpisodesPerCycle: number | null;
  promise: false;
};

export type DirectorToRenderPackage = {
  schemaVersion: typeof DIRECTOR_TO_RENDER_SCHEMA;
  finalShotSpecSha256: string;
  animationManifestSha256: string | null;
  sceneryResolutionSha256: string | null;
  visualApprovalFresh: boolean;
  renderPreflightFresh: boolean;
  paidAuthorizationIssued: false;
  readyForPaidAuthorization: boolean;
  packageSha256: string;
};

const QUALITY_FOR_INTENT: Record<ShotIntent, QualityTarget> = {
  ESTABLISHING: 'HERO_SHOT',
  ENVIRONMENT_HERO: 'HERO_SHOT',
  WIDE_TWO_SHOT: 'BACKGROUND_HEAVY',
  SILHOUETTE: 'BACKGROUND_HEAVY',
  MEDIUM_TWO_SHOT: 'STANDARD_SHOT',
  MEDIUM_SINGLE: 'STANDARD_SHOT',
  OVER_SHOULDER: 'STANDARD_SHOT',
  CLOSE_UP: 'DIALOGUE_CLOSEUP',
  EXTREME_CLOSE_UP: 'DIALOGUE_CLOSEUP',
  REACTION: 'DIALOGUE_CLOSEUP',
  INSERT: 'STANDARD_SHOT',
  PROP_INSERT: 'STANDARD_SHOT',
  POV: 'STANDARD_SHOT',
  FOLLOW: 'ACTION_SHOT',
  TRACKING: 'ACTION_SHOT',
  PUSH_IN: 'STANDARD_SHOT',
  PULL_OUT: 'STANDARD_SHOT',
  PAN_REVEAL: 'HERO_SHOT',
  TILT_REVEAL: 'HERO_SHOT',
  STATIC_COMEDY: 'STANDARD_SHOT',
  LOCATION_TRANSITION: 'TRANSITION_SHOT',
};

export function qualityTargetFor(intent: ShotIntent): QualityTarget {
  return QUALITY_FOR_INTENT[intent];
}

export function qualityTargets(): readonly QualityTarget[] {
  return QUALITY_TARGETS;
}

export function planDailiesRenderLadder(): RenderLadderRung[] {
  return PREVIEW_LADDER.map((level) => {
    const paidFinal = level === 'FINAL';
    return {
      level,
      resolution: paidFinal ? { width: 1080, height: 1920 } : level === 'FINAL_PREFLIGHT' ? { width: 720, height: 1280 } : { width: 540, height: 960 },
      samplingIntent: paidFinal ? 'HIGH' : level.includes('PREVIEW') || level === 'PLANNING' ? 'LOW' : 'MEDIUM',
      requiredApprovals: paidFinal
        ? ['STORY_APPROVED', 'CAMERA_APPROVED', 'PERFORMANCE_APPROVED', 'SCENERY_APPROVED', 'EDITORIAL_APPROVED', 'PAID_RENDER_AUTHORIZATION']
        : level === 'DIRECTOR_PREVIEW' || level === 'FINAL_PREFLIGHT'
          ? ['DIRECTOR_REVIEW']
          : [],
      costClass: paidFinal ? 'PAID_FINAL' : level === 'PLANNING' ? 'ZERO' : level === 'FINAL_PREFLIGHT' ? 'REVIEW' : 'PREVIEW',
      purpose:
        level === 'PLANNING'
          ? 'Software-only directing and editorial planning.'
          : level === 'FINAL'
            ? 'Paid final render after human authorization.'
            : `${level.replaceAll('_', ' ').toLowerCase()} review, not a finished episode.`,
      executed: false as const,
      paidAuthorizationIssued: false as const,
    };
  });
}

export function analyzeCriticalPath(input: {
  missingRig?: boolean;
  missingVisualApproval?: boolean;
  missingVoiceTiming?: boolean;
  missingHeroScenery?: boolean;
  missingPaidRender?: boolean;
  captionPolishOnly?: boolean;
}): CriticalPathResult {
  if (input.missingRig) {
    return {
      delayCode: 'MISSING_CHARACTER_RIG',
      label: 'Waiting for approved Pip or Goat production rig.',
      rank: 1,
      captionPolishOutranksRig: false,
    };
  }
  if (input.missingHeroScenery) {
    return {
      delayCode: 'MISSING_HERO_SCENERY',
      label: 'Review the mountain hero candidate.',
      rank: 2,
      captionPolishOutranksRig: false,
    };
  }
  if (input.missingVoiceTiming) {
    return {
      delayCode: 'MISSING_VOICE_RECEIPT',
      label: 'Confirm the episode dialogue receipt.',
      rank: 3,
      captionPolishOutranksRig: false,
    };
  }
  if (input.missingVisualApproval) {
    return {
      delayCode: 'MISSING_SHOT_REVIEW',
      label: 'Review Shot 08 camera and performance.',
      rank: 4,
      captionPolishOutranksRig: false,
    };
  }
  if (input.missingPaidRender) {
    return {
      delayCode: 'MISSING_PAID_RENDER_AUTHORIZATION',
      label: 'Paid final render authorization required.',
      rank: 5,
      captionPolishOutranksRig: false,
    };
  }
  return {
    delayCode: input.captionPolishOnly ? 'CAPTION_POLISH' : 'NONE',
    label: input.captionPolishOnly ? 'Caption polish is not the critical path.' : 'No software-visible critical-path delay.',
    rank: input.captionPolishOnly ? 99 : 0,
    captionPolishOutranksRig: false,
  };
}

export function estimateThroughput(input: {
  reviewCapacity?: number;
  animationCapacity?: number;
  renderCapacity?: number;
  voiceCapacity?: number;
}): ThroughputEstimate {
  const values = [input.reviewCapacity, input.animationCapacity, input.renderCapacity, input.voiceCapacity];
  const supplied = values.filter((value): value is number => typeof value === 'number' && value >= 0);
  const confidence: ThroughputEstimate['confidence'] =
    supplied.length >= 4 ? 'HIGH_CONFIDENCE' : supplied.length >= 2 ? 'MEDIUM_CONFIDENCE' : 'LOW_CONFIDENCE';
  return {
    confidence,
    assumedStaffInvented: false,
    reviewCapacity: input.reviewCapacity ?? null,
    animationCapacity: input.animationCapacity ?? null,
    renderCapacity: input.renderCapacity ?? null,
    voiceCapacity: input.voiceCapacity ?? null,
    conceptualEpisodesPerCycle: supplied.length ? Math.min(...supplied) : null,
    promise: false,
  };
}

export function compileDirectorToRenderPackage(input: {
  spec: FinalShotSpec;
  animationManifestSha256?: string | null;
  sceneryResolutionSha256?: string | null;
  visualApprovalFresh?: boolean;
  renderPreflightFresh?: boolean;
}): DirectorToRenderPackage {
  const body = {
    schemaVersion: DIRECTOR_TO_RENDER_SCHEMA,
    finalShotSpecSha256: input.spec.finalShotSpecSha256,
    animationManifestSha256: input.animationManifestSha256 ?? input.spec.animationManifestSha256,
    sceneryResolutionSha256: input.sceneryResolutionSha256 ?? input.spec.environmentSha256,
    visualApprovalFresh: input.visualApprovalFresh === true,
    renderPreflightFresh: input.renderPreflightFresh === true,
    paidAuthorizationIssued: false as const,
    readyForPaidAuthorization:
      Boolean(input.spec.finalShotSpecSha256) &&
      Boolean(input.animationManifestSha256 ?? input.spec.animationManifestSha256) &&
      Boolean(input.sceneryResolutionSha256 ?? input.spec.environmentSha256) &&
      input.visualApprovalFresh === true &&
      input.renderPreflightFresh === true,
  };
  return { ...body, packageSha256: sha256Canonical(body) };
}

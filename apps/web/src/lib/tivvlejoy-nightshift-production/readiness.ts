import { sha256Canonical } from './hash';
import { MASTER_READINESS_SCHEMA, MASTER_READINESS_STATES, type MasterReadinessState } from './types';
import { assertNeverClaimsProductionReady } from './safety';
import type { EpisodeDirectorPackage } from './specs';

export type MasterReadiness = {
  schemaVersion: typeof MASTER_READINESS_SCHEMA;
  state: Exclude<MasterReadinessState, 'PRODUCTION_READY'> | 'WAITING_FOR_RIGS';
  blockers: Array<{ code: string; label: string }>;
  nextSafeActions: string[];
  readinessSha256: string;
};

export function evaluateMasterReadiness(input: {
  packages?: EpisodeDirectorPackage[];
  realRigs?: boolean;
  realSceneryApproved?: boolean;
  realVoiceExact?: boolean;
  humanVisualApproval?: boolean;
  paidRenderAuthorized?: boolean;
  softwareLayers?: Array<'DIRECTING' | 'ANIMATION' | 'EDITORIAL' | 'ASSET'>;
}): MasterReadiness {
  const blockers: MasterReadiness['blockers'] = [];
  if (!input.realRigs) blockers.push({ code: 'MISSING_CHARACTER_RIG', label: 'Waiting for approved Pip or Goat production rig.' });
  if (!input.realSceneryApproved) blockers.push({ code: 'MISSING_SCENERY_APPROVAL', label: 'Review the mountain hero candidate.' });
  if (!input.realVoiceExact) blockers.push({ code: 'MISSING_VOICE_RECEIPT', label: 'Confirm the episode dialogue receipt.' });
  if (!input.humanVisualApproval) blockers.push({ code: 'MISSING_SHOT_REVIEW', label: 'Review Shot 08 camera and performance.' });
  if (!input.paidRenderAuthorized) blockers.push({ code: 'MISSING_PAID_RENDER_AUTHORIZATION', label: 'Paid final render authorization required.' });
  let state: MasterReadiness['state'] = 'EDITORIAL_PIPELINE_OPERATIONAL';
  if (!input.softwareLayers?.includes('DIRECTING')) state = 'PLANNING_OPERATIONAL';
  if (!input.realRigs) state = 'WAITING_FOR_RIGS';
  if (input.realRigs && !input.realSceneryApproved) state = 'WAITING_FOR_EXTERNAL_ASSETS';
  if (input.realRigs && input.realSceneryApproved && !input.humanVisualApproval) state = 'WAITING_FOR_HUMAN_APPROVAL';
  if (input.realRigs && input.realSceneryApproved && input.humanVisualApproval && !input.paidRenderAuthorized) {
    state = 'WAITING_FOR_PAID_RENDER_AUTHORIZATION';
  }
  if (input.realRigs && input.realSceneryApproved && input.humanVisualApproval && input.paidRenderAuthorized) {
    state = 'CONTROLLED_PRODUCTION_VALIDATION_READY';
  }
  assertNeverClaimsProductionReady(state);
  const nextSafeActions = blockers.map((item) => item.label);
  return {
    schemaVersion: MASTER_READINESS_SCHEMA,
    state,
    blockers,
    nextSafeActions,
    readinessSha256: sha256Canonical({ state, blockers: blockers.map((item) => item.code) }),
  };
}

export function masterReadinessStates(): readonly MasterReadinessState[] {
  return MASTER_READINESS_STATES;
}

export function humanBlockerLabel(code: string): string {
  if (code === 'MISSING_CHARACTER_RIG') return 'Waiting for approved Pip or Goat production rig.';
  if (code === 'MISSING_SCENERY_APPROVAL') return 'Review the mountain hero candidate.';
  if (code === 'MISSING_VOICE_RECEIPT') return 'Confirm the episode dialogue receipt.';
  if (code === 'MISSING_SHOT_REVIEW') return 'Review Shot 08 camera and performance.';
  if (code === 'MISSING_PAID_RENDER_AUTHORIZATION') return 'Paid final render authorization required.';
  return code.split('_').join(' ').toLowerCase();
}

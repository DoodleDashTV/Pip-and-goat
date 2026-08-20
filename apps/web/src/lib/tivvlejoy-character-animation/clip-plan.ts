import { sha256Canonical } from './hash';
import { CLIP_PLAN_SCHEMA, type ActionId } from './types';
import type { ActionResolution } from './action-resolver';

export type AnimationClipPlan = {
  schema: typeof CLIP_PLAN_SCHEMA;
  shotId: string;
  characterId: 'PIP' | 'GOAT';
  actions: ActionResolution[];
  clipPlanSha256: string;
};

export function buildAnimationClipPlan(input: {
  shotId: string;
  characterId: 'PIP' | 'GOAT';
  actions: ActionResolution[];
}): AnimationClipPlan {
  const body = {
    schema: CLIP_PLAN_SCHEMA,
    shotId: input.shotId,
    characterId: input.characterId,
    actions: input.actions,
  };
  return { ...body, clipPlanSha256: sha256Canonical(body) };
}

export function defaultActionsForBeat(input: {
  characterId: 'PIP' | 'GOAT';
  speaking: boolean;
  locomotion: string;
  prop?: string;
}): ActionId[] {
  const actions: ActionId[] = [input.characterId === 'PIP' ? 'IDLE_CURIOUS' : 'IDLE_HAPPY'];
  if (input.speaking) actions.push('BEAK_OR_MOUTH_OPEN');
  if (/walk/i.test(input.locomotion)) actions.push('WALK_FORWARD');
  if (/run/i.test(input.locomotion)) actions.push('RUN');
  if (/jump/i.test(input.locomotion)) actions.push('JUMP');
  if (input.prop === 'PICK_UP') actions.push('PICK_UP');
  if (input.prop === 'HAND_OVER') actions.push('HAND_PROP_OVER');
  if (input.prop === 'RECEIVE') actions.push('RECEIVE_PROP');
  if (input.characterId === 'PIP') actions.push('PIP_WING_GESTURE_SMALL');
  else actions.push('GOAT_HEAD_BOB');
  return actions;
}

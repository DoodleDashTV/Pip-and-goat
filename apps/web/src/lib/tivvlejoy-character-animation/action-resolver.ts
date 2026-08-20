import type { CharacterRigContract } from './rig-contract';
import { evaluateRigAdmission } from './admission';
import type { ActionId, ActionSupport, CapabilityFamily } from './types';

const DIRECT: Partial<Record<ActionId, CapabilityFamily[]>> = {
  LOOK_LEFT: ['HEAD', 'EYE_AIM'],
  LOOK_RIGHT: ['HEAD', 'EYE_AIM'],
  LOOK_UP: ['HEAD', 'EYE_AIM'],
  LOOK_DOWN: ['HEAD', 'EYE_AIM'],
  LOOK_AT_CHARACTER: ['HEAD', 'EYE_AIM'],
  LOOK_AT_PROP: ['HEAD', 'EYE_AIM'],
  BLINK_SINGLE: ['EYELID_LEFT', 'EYELID_RIGHT'],
  BLINK_DOUBLE: ['EYELID_LEFT', 'EYELID_RIGHT'],
  HEAD_NOD: ['HEAD', 'NECK'],
  HEAD_SHAKE: ['HEAD'],
  HEAD_TILT: ['HEAD'],
  WALK_FORWARD: ['LEG_LEFT', 'LEG_RIGHT', 'ROOT_MOTION'],
  WALK_SLOW: ['LEG_LEFT', 'LEG_RIGHT', 'ROOT_MOTION'],
  WALK_EXCITED: ['LEG_LEFT', 'LEG_RIGHT', 'ROOT_MOTION'],
  RUN: ['LEG_LEFT', 'LEG_RIGHT', 'ROOT_MOTION'],
  STOP: ['ROOT_MOTION'],
  TURN_LEFT: ['ROOT_MOTION'],
  TURN_RIGHT: ['ROOT_MOTION'],
  JUMP: ['LEG_LEFT', 'LEG_RIGHT'],
  LAND: ['FOOT_LEFT', 'FOOT_RIGHT'],
  BEAK_OR_MOUTH_OPEN: ['MOUTH_OR_BEAK_UPPER', 'MOUTH_OR_BEAK_LOWER'],
  BEAK_OR_MOUTH_CLOSE: ['MOUTH_OR_BEAK_UPPER', 'MOUTH_OR_BEAK_LOWER'],
  HOLD_PROP: ['PROP_ATTACHMENT_POINTS'],
  PICK_UP: ['PROP_ATTACHMENT_POINTS'],
  PUT_DOWN: ['PROP_ATTACHMENT_POINTS'],
  IDLE_NEUTRAL: ['BODY_CENTER'],
  IDLE_CURIOUS: ['HEAD', 'BODY_CENTER'],
  IDLE_HAPPY: ['BODY_CENTER'],
};

export type ActionResolution = {
  actionId: ActionId;
  support: ActionSupport;
  usedFamilies: CapabilityFamily[];
  note: string;
};

export function resolveCharacterAction(input: {
  characterId: 'PIP' | 'GOAT';
  actionId: ActionId;
  contract?: CharacterRigContract | null;
  admitted?: boolean;
}): ActionResolution {
  if (!input.admitted) {
    const gate = evaluateRigAdmission({ characterId: input.characterId, contract: input.contract });
    if (gate.state !== 'RIG_APPROVED_FOR_ANIMATION') {
      return {
        actionId: input.actionId,
        support: 'RIG_NOT_ADMITTED',
        usedFamilies: [],
        note: gate.humanLabel,
      };
    }
  }
  const families = new Set((input.contract?.capabilities ?? []).map((item) => item.family));
  const needed = DIRECT[input.actionId] ?? [];
  const hasAll = needed.every((family) => families.has(family));
  if (input.actionId === 'POINT' && input.characterId === 'PIP') {
    return {
      actionId: 'POINT',
      support: families.has('ARM_OR_WING_LEFT') ? 'SUPPORTED_COMPOSITE' : 'UNSUPPORTED',
      usedFamilies: ['ARM_OR_WING_LEFT', 'HEAD', 'EYE_AIM'],
      note: 'Pip points with wing + head/gaze; no finger-like pointing control is assumed',
    };
  }
  if (input.actionId === 'GOAT_EAR_REACTION') {
    const ears = families.has('FACE_EXPRESSION');
    return {
      actionId: input.actionId,
      support: ears ? 'SUPPORTED_WITH_LIMITATION' : 'UNSUPPORTED',
      usedFamilies: ['FACE_EXPRESSION'],
      note: ears ? 'ear reaction only if ear controls exist' : 'no ear capability',
    };
  }
  if (input.actionId.startsWith('PIP_WING') && input.characterId !== 'PIP') {
    return { actionId: input.actionId, support: 'UNSUPPORTED', usedFamilies: [], note: 'Pip-only wing action' };
  }
  if (hasAll && needed.length) {
    return { actionId: input.actionId, support: 'SUPPORTED_DIRECTLY', usedFamilies: needed, note: 'direct semantic mapping' };
  }
  if (needed.length && needed.some((family) => families.has(family))) {
    return { actionId: input.actionId, support: 'SUPPORTED_WITH_LIMITATION', usedFamilies: needed.filter((family) => families.has(family)), note: 'partial controls' };
  }
  if (!needed.length) {
    return { actionId: input.actionId, support: 'SUPPORTED_COMPOSITE', usedFamilies: ['BODY_CENTER', 'HEAD'], note: 'composite acting layer' };
  }
  return { actionId: input.actionId, support: 'UNSUPPORTED', usedFamilies: [], note: 'required families absent' };
}

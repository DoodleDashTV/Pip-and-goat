import { sha256Canonical } from './hash';
import { CONTACT_SCHEMA } from './types';
import type { LocomotionPlan } from './locomotion';

export type ContactPlan = {
  schemaVersion: typeof CONTACT_SCHEMA;
  characterId: 'PIP' | 'GOAT';
  leftFoot: string[];
  rightFoot: string[];
  rearHallux: string[];
  hoof: string[];
  groundReference: 'SYMBOLIC_GROUND';
  slidingTolerance: 'ZERO_UNEXPLAINED_SLIDE';
  plantInterval: number;
  liftInterval: number;
  contactPlanSha256: string;
};

export type ContactDefect =
  | 'UNEXPLAINED_FOOT_SLIDE'
  | 'DOUBLE_FLOATING_CONTACT'
  | 'GROUND_PENETRATION'
  | 'TELEPORTING_CONTACT'
  | 'IMPOSSIBLE_SPEED_CHANGE';

export function buildContactPlan(plan: LocomotionPlan): ContactPlan {
  const plants = plan.contactTiming.filter((item) => item.event === 'PLANT');
  const lifts = plan.contactTiming.filter((item) => item.event === 'LIFT');
  const body = {
    schemaVersion: CONTACT_SCHEMA,
    characterId: plan.characterId,
    leftFoot: plants.filter((item) => item.foot === 'LEFT').map((item) => String(item.at)),
    rightFoot: plants.filter((item) => item.foot === 'RIGHT').map((item) => String(item.at)),
    rearHallux: plan.characterId === 'PIP' ? ['symbolic-hallux-support'] : [],
    hoof: plan.characterId === 'GOAT' ? ['symbolic-hoof-contact'] : [],
    groundReference: 'SYMBOLIC_GROUND' as const,
    slidingTolerance: 'ZERO_UNEXPLAINED_SLIDE' as const,
    plantInterval: plants.length > 1 ? plants[1]!.at - plants[0]!.at : 0,
    liftInterval: lifts.length > 1 ? lifts[1]!.at - lifts[0]!.at : 0,
  };
  return { ...body, contactPlanSha256: sha256Canonical(body) };
}

export function detectContactDefects(input: {
  sliding?: boolean;
  floating?: boolean;
  penetration?: boolean;
  teleport?: boolean;
  speedJump?: boolean;
}): ContactDefect[] {
  const defects: ContactDefect[] = [];
  if (input.sliding) defects.push('UNEXPLAINED_FOOT_SLIDE');
  if (input.floating) defects.push('DOUBLE_FLOATING_CONTACT');
  if (input.penetration) defects.push('GROUND_PENETRATION');
  if (input.teleport) defects.push('TELEPORTING_CONTACT');
  if (input.speedJump) defects.push('IMPOSSIBLE_SPEED_CHANGE');
  return defects;
}

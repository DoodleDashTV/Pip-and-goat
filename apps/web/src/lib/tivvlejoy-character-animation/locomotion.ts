import { sha256Canonical } from './hash';
import { LOCOMOTION_SCHEMA, type LocomotionClass } from './types';

export type LocomotionPlan = {
  schemaVersion: typeof LOCOMOTION_SCHEMA;
  shotId: string;
  characterId: 'PIP' | 'GOAT';
  speedClass: LocomotionClass;
  path: Array<{ t: number; x: number; y: number; facing: number }>;
  phase: string;
  contactTiming: Array<{ at: number; foot: 'LEFT' | 'RIGHT'; event: 'PLANT' | 'LIFT' }>;
  turnTiming: number[];
  arrivalSettle: number;
  units: 'NORMALIZED_SYMBOLIC';
  locomotionPlanSha256: string;
};

export function buildLocomotionPlan(input: {
  shotId: string;
  characterId: 'PIP' | 'GOAT';
  speedClass: LocomotionClass;
  durationMs: number;
  startAnchor?: string;
  endAnchor?: string;
}): LocomotionPlan {
  const steps = input.speedClass === 'STATIONARY' ? 1 : input.speedClass === 'RUN' ? 8 : 6;
  const path = Array.from({ length: steps }, (_, index) => ({
    t: index / Math.max(1, steps - 1),
    x: input.speedClass === 'STATIONARY' ? 0 : index * 0.12,
    y: 0,
    facing: input.speedClass === 'TURN' ? index * 15 : 0,
  }));
  const contactTiming =
    input.speedClass === 'STATIONARY'
      ? []
      : Array.from({ length: steps }, (_, index) => ({
          at: Math.round((input.durationMs * index) / steps),
          foot: index % 2 === 0 ? ('LEFT' as const) : ('RIGHT' as const),
          event: index % 2 === 0 ? ('PLANT' as const) : ('LIFT' as const),
        }));
  const body = {
    schemaVersion: LOCOMOTION_SCHEMA,
    shotId: input.shotId,
    characterId: input.characterId,
    speedClass: input.speedClass,
    path,
    phase: `${input.startAnchor ?? 'A'}->${input.endAnchor ?? 'B'}`,
    contactTiming,
    turnTiming: input.speedClass === 'TURN' ? [Math.round(input.durationMs / 2)] : [],
    arrivalSettle: input.speedClass === 'STATIONARY' ? 0 : 0.2,
    units: 'NORMALIZED_SYMBOLIC' as const,
  };
  return { ...body, locomotionPlanSha256: sha256Canonical(body) };
}

export function classifyLocomotion(label: string | undefined): LocomotionClass {
  if (!label) return 'STATIONARY';
  if (/run/i.test(label)) return 'RUN';
  if (/jump/i.test(label)) return 'JUMP';
  if (/land/i.test(label)) return 'LAND';
  if (/turn/i.test(label)) return 'TURN';
  if (/approach/i.test(label)) return 'APPROACH';
  if (/depart/i.test(label)) return 'DEPART';
  if (/fast.?walk/i.test(label)) return 'FAST_WALK';
  if (/walk/i.test(label)) return 'WALK';
  return 'STATIONARY';
}

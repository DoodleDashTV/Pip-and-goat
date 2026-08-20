import { sha256Canonical } from './hash';
import { BODY_ACTING_SCHEMA } from './types';
import type { PerformanceIntent } from './intent';

export type BodyActingPlan = {
  schemaVersion: typeof BODY_ACTING_SCHEMA;
  characterId: 'PIP' | 'GOAT';
  poseEnergy: number;
  bodyLean: number;
  headTilt: number;
  gestureScale: number;
  weightShift: number;
  anticipation: number;
  reaction: number;
  settle: number;
  personality: string;
  bodyActingPlanSha256: string;
};

export function buildBodyActingPlan(intent: PerformanceIntent): BodyActingPlan {
  const pip = intent.characterId === 'PIP';
  const body = {
    schemaVersion: BODY_ACTING_SCHEMA,
    characterId: intent.characterId,
    poseEnergy: pip ? Math.min(1, intent.poseEnergy + 0.08) : intent.poseEnergy,
    bodyLean: intent.dialogueIntent === 'speak' ? 0.18 : 0.08,
    headTilt: /curious|confus/i.test(intent.emotion) ? 0.22 : 0.06,
    gestureScale: pip ? 0.7 : 0.45,
    weightShift: intent.movementIntent === 'stationary' ? 0.12 : 0.3,
    anticipation: intent.urgency * 0.4,
    reaction: intent.reactionType === 'listen-react' ? 0.55 : 0.15,
    settle: 0.35,
    personality: pip ? 'curious cheerful energetic kind explorer-like' : 'warm playful adventurous',
  };
  return { ...body, bodyActingPlanSha256: sha256Canonical(body) };
}

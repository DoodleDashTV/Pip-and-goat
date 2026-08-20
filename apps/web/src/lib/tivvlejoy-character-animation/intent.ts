import { sha256Canonical } from './hash';
import { PERFORMANCE_INTENT_SCHEMA } from './types';

export type PerformanceIntent = {
  schemaVersion: typeof PERFORMANCE_INTENT_SCHEMA;
  shotId: string;
  characterId: 'PIP' | 'GOAT';
  emotion: string;
  emotionIntensity: number;
  storyGoal: string;
  attentionTarget: string;
  movementIntent: string;
  dialogueIntent: string;
  gestureIntent: string;
  poseEnergy: number;
  urgency: number;
  confidence: number;
  reactionType: string;
  entranceIntent: string;
  exitIntent: string;
  propIntent: string;
  relationshipIntent: string;
  intentSha256: string;
};

export function buildPerformanceIntent(input: Omit<PerformanceIntent, 'schemaVersion' | 'intentSha256'>): PerformanceIntent {
  const body = { schemaVersion: PERFORMANCE_INTENT_SCHEMA, ...input };
  return { ...body, intentSha256: sha256Canonical(body) };
}

export function intentFromBeat(input: {
  shotId: string;
  characterId: 'PIP' | 'GOAT';
  speaking?: boolean;
  locomotion?: string;
  prop?: string;
  emotion?: string;
  partner?: 'PIP' | 'GOAT';
}): PerformanceIntent {
  const emotion = input.emotion ?? (input.characterId === 'PIP' ? 'curious' : 'warm');
  return buildPerformanceIntent({
    shotId: input.shotId,
    characterId: input.characterId,
    emotion,
    emotionIntensity: input.speaking ? 0.7 : 0.45,
    storyGoal: input.speaking ? 'deliver line' : 'support partner',
    attentionTarget: input.prop ?? input.partner ?? 'CAMERA_NEAR',
    movementIntent: input.locomotion ?? 'stationary',
    dialogueIntent: input.speaking ? 'speak' : 'listen',
    gestureIntent: input.characterId === 'PIP' ? 'wing accent' : 'head bob',
    poseEnergy: input.characterId === 'PIP' ? 0.72 : 0.58,
    urgency: input.locomotion === 'run' ? 0.8 : 0.35,
    confidence: 0.66,
    reactionType: input.speaking ? 'none' : 'listen-react',
    entranceIntent: input.locomotion === 'walk' ? 'enter walking' : 'already in frame',
    exitIntent: input.locomotion === 'depart' ? 'exit walking' : 'hold',
    propIntent: input.prop ?? 'none',
    relationshipIntent: input.partner ? `attend ${input.partner}` : 'solo',
  });
}

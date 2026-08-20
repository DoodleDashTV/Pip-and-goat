import { sha256Canonical } from './hash';
import type { StoryBeat } from './beats';
import type { ConversationMode } from './types';

export type DirectorPerformanceNote = {
  shotId: string;
  characterId: 'PIP' | 'GOAT';
  performanceEmphasis: string;
  reactionTiming: number;
  gazeTargetImportance: 'LOW' | 'MEDIUM' | 'HIGH';
  gestureSize: 'SMALL' | 'MEDIUM' | 'LARGE';
  movementUrgency: 'LOW' | 'MEDIUM' | 'HIGH';
  silenceHold: number;
  comedyHold: number;
  anticipation: number;
  reactionDelay: number;
  propEmphasis: boolean;
  animationPlannerOwnsDetail: true;
  noteSha256: string;
};

export function buildDirectorPerformanceNote(input: {
  shotId: string;
  characterId: 'PIP' | 'GOAT';
  beat: StoryBeat;
  mode: ConversationMode;
  speaking?: boolean;
}): DirectorPerformanceNote {
  const speaking = input.speaking === true;
  const comedy = input.beat.beatType === 'COMEDY';
  const reaction = input.beat.beatType === 'REACTION' || input.beat.beatType === 'PAYOFF';
  const body = {
    shotId: input.shotId,
    characterId: input.characterId,
    performanceEmphasis: speaking ? 'Deliver the line, then wait.' : reaction ? 'Answer with the face before the body.' : 'Stay available to the partner.',
    reactionTiming: reaction ? 10 : speaking ? 4 : 8,
    gazeTargetImportance: input.mode === 'MAP_READING' || input.beat.prop ? 'HIGH' : speaking ? 'MEDIUM' : 'HIGH',
    gestureSize: input.characterId === 'PIP' ? 'MEDIUM' : comedy ? 'LARGE' : 'SMALL',
    movementUrgency: input.beat.beatType === 'MOVEMENT' ? 'HIGH' : input.beat.beatType === 'TENSION' ? 'MEDIUM' : 'LOW',
    silenceHold: input.beat.beatType === 'BUTTON' ? 12 : comedy ? 8 : 4,
    comedyHold: comedy ? 10 : 0,
    anticipation: input.beat.beatType === 'REVEAL' ? 8 : 3,
    reactionDelay: speaking ? 0 : reaction ? 6 : 4,
    propEmphasis: Boolean(input.beat.prop),
    animationPlannerOwnsDetail: true as const,
  };
  return { ...body, noteSha256: sha256Canonical(body) };
}

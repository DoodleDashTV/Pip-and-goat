import { sha256Canonical } from './hash';
import { CHARACTER_STAGING_SCHEMA, CONVERSATION_MODES, type ConversationMode } from './types';

export type StagePoint = { x: number; y: number; z: number };

export type CharacterStagingPlan = {
  schemaVersion: typeof CHARACTER_STAGING_SCHEMA;
  shotId: string;
  pipZone: StagePoint;
  goatZone: StagePoint;
  pipEntry: StagePoint;
  goatEntry: StagePoint;
  pipExit: StagePoint;
  goatExit: StagePoint;
  interactionDistance: number;
  conversationDistance: number;
  propAnchor: StagePoint | null;
  cameraAware: true;
  foregroundCharacter: 'PIP' | 'GOAT' | 'NONE';
  backgroundCharacter: 'PIP' | 'GOAT' | 'NONE';
  crossing: boolean;
  screenDirection: 'LEFT' | 'RIGHT' | 'NEUTRAL';
  walkCorridor: { from: StagePoint; to: StagePoint } | null;
  reactionPosition: StagePoint;
  conversationMode: ConversationMode;
  roboticSymmetry: boolean;
  overlap: boolean;
  stagingSha256: string;
};

export function planCharacterStaging(input: {
  shotId: string;
  mode: ConversationMode;
  travel?: 'LEFT' | 'RIGHT' | 'NONE';
  leading?: 'PIP' | 'GOAT';
  prop?: boolean;
  cameraSide?: 'LEFT' | 'RIGHT';
}): CharacterStagingPlan {
  const travel = input.travel ?? 'NONE';
  const pipX = input.mode === 'ONE_FOLLOWING' && input.leading === 'GOAT' ? 0.38 : 0.38;
  const goatX = input.mode === 'ONE_FOLLOWING' && input.leading === 'PIP' ? 0.7 : 0.62;
  const separated = Math.abs(goatX - pipX) >= 0.16;
  const walking = input.mode === 'WALKING_CONVERSATION' || input.mode === 'SIDE_BY_SIDE_TRAVEL' || input.mode === 'ONE_LEADING' || input.mode === 'ONE_FOLLOWING';
  const pipZone = { x: input.mode === 'MAP_READING' ? 0.46 : pipX, y: 0, z: input.mode === 'ONE_LEADING' && input.leading === 'PIP' ? 0.2 : 0 };
  const goatZone = { x: input.mode === 'MAP_READING' ? 0.54 : goatX, y: 0, z: input.mode === 'ONE_LEADING' && input.leading === 'GOAT' ? 0.2 : 0.05 };
  const overlap = Math.abs(pipZone.x - goatZone.x) < 0.08 && Math.abs(pipZone.z - goatZone.z) < 0.08;
  const roboticSymmetry = pipZone.x + goatZone.x === 1 && pipZone.z === goatZone.z && !walking;
  const body = {
    schemaVersion: CHARACTER_STAGING_SCHEMA,
    shotId: input.shotId,
    pipZone,
    goatZone,
    pipEntry: { x: travel === 'RIGHT' ? 0.1 : 0.2, y: 0, z: 0.4 },
    goatEntry: { x: travel === 'RIGHT' ? 0.18 : 0.28, y: 0, z: 0.45 },
    pipExit: { x: travel === 'LEFT' ? 0.15 : 0.85, y: 0, z: -0.2 },
    goatExit: { x: travel === 'LEFT' ? 0.22 : 0.9, y: 0, z: -0.15 },
    interactionDistance: Math.abs(goatZone.x - pipZone.x),
    conversationDistance: input.mode === 'ARGUMENT_CONFUSION' ? 0.28 : 0.2,
    propAnchor: input.prop ? { x: 0.5, y: 0.1, z: 0.1 } : null,
    cameraAware: true as const,
    foregroundCharacter: (goatZone.z < pipZone.z ? 'GOAT' : pipZone.z < goatZone.z ? 'PIP' : 'NONE') as CharacterStagingPlan['foregroundCharacter'],
    backgroundCharacter: (goatZone.z > pipZone.z ? 'GOAT' : pipZone.z > goatZone.z ? 'PIP' : 'NONE') as CharacterStagingPlan['backgroundCharacter'],
    crossing: false,
    screenDirection: (travel === 'NONE' ? 'NEUTRAL' : travel) as CharacterStagingPlan['screenDirection'],
    walkCorridor: walking ? { from: { x: 0.2, y: 0, z: 0.4 }, to: { x: 0.8, y: 0, z: -0.2 } } : null,
    reactionPosition: { x: input.cameraSide === 'LEFT' ? 0.42 : 0.58, y: 0, z: 0 },
    conversationMode: input.mode,
    roboticSymmetry: roboticSymmetry && separated === false,
    overlap,
  };
  return { ...body, stagingSha256: sha256Canonical(body) };
}

export function conversationModeFor(input: {
  speaker?: 'PIP' | 'GOAT' | null;
  sharedDiscovery?: boolean;
  argument?: boolean;
  jointReaction?: boolean;
  map?: boolean;
  walking?: boolean;
  sideBySide?: boolean;
  leading?: 'PIP' | 'GOAT';
}): ConversationMode {
  if (input.map) return 'MAP_READING';
  if (input.jointReaction) return 'JOINT_REACTION';
  if (input.sharedDiscovery) return 'SHARED_DISCOVERY';
  if (input.argument) return 'ARGUMENT_CONFUSION';
  if (input.leading) return input.leading === 'PIP' ? 'ONE_LEADING' : 'ONE_FOLLOWING';
  if (input.sideBySide) return 'SIDE_BY_SIDE_TRAVEL';
  if (input.walking) return 'WALKING_CONVERSATION';
  if (input.speaker === 'PIP') return 'PIP_SPEAKING';
  if (input.speaker === 'GOAT') return 'GOAT_SPEAKING';
  return 'PIP_LISTENING';
}

export function conversationModes(): readonly ConversationMode[] {
  return CONVERSATION_MODES;
}

export function preventForwardStare(mode: ConversationMode): { pipYaw: number; goatYaw: number } {
  if (mode === 'PIP_SPEAKING' || mode === 'GOAT_LISTENING') return { pipYaw: 18, goatYaw: -22 };
  if (mode === 'GOAT_SPEAKING' || mode === 'PIP_LISTENING') return { pipYaw: 20, goatYaw: -16 };
  if (mode === 'MAP_READING') return { pipYaw: 8, goatYaw: -8 };
  if (mode === 'SIDE_BY_SIDE_TRAVEL' || mode === 'WALKING_CONVERSATION') return { pipYaw: 6, goatYaw: 4 };
  return { pipYaw: 14, goatYaw: -12 };
}

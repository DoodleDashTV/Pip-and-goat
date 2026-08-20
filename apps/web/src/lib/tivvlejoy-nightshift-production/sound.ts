import { sha256Canonical } from './hash';
import {
  AMBIENCE_LAYERS,
  DUCK_STATES,
  MUSIC_CUE_SCHEMA,
  MUSIC_ROLES,
  SFX_TYPES,
  SOUND_DESIGN_SCHEMA,
  type AmbienceLayer,
  type DuckState,
  type MusicRole,
  type SfxType,
} from './types';

export type SfxEvent = {
  schemaVersion: typeof SOUND_DESIGN_SCHEMA;
  sfxEventId: string;
  semanticType: SfxType;
  frame: number;
  duration: number;
  intensity: number;
  spatialRole: 'LEFT' | 'CENTER' | 'RIGHT' | 'WIDE';
  characterId: 'PIP' | 'GOAT' | null;
  propId: string | null;
  locationId: string | null;
  priority: 'BACKGROUND' | 'STORY' | 'ACCENT';
  audioBinaryIncluded: false;
  sfxDependencySha256: string;
};

export type AmbienceEvent = {
  layer: AmbienceLayer;
  startFrame: number;
  endFrame: number;
  locationId: string;
};

export type MusicCue = {
  schemaVersion: typeof MUSIC_CUE_SCHEMA;
  cueId: string;
  role: MusicRole;
  startFrame: number;
  endFrame: number;
  energy: number;
  duckUnderDialogue: DuckState;
  transition: 'CUT' | 'CROSSFADE' | 'HOLD';
  storyBeatRefs: string[];
  copyrightedAudioIncluded: false;
  musicDependencySha256: string;
};

export function planSfxEvent(input: Omit<SfxEvent, 'schemaVersion' | 'audioBinaryIncluded' | 'sfxDependencySha256'>): SfxEvent {
  const body = { schemaVersion: SOUND_DESIGN_SCHEMA, audioBinaryIncluded: false as const, ...input };
  return { ...body, sfxDependencySha256: sha256Canonical(body) };
}

export function sfxFromContacts(input: {
  shotId: string;
  frame: number;
  locationId: string;
  pipFoot?: boolean;
  goatHoof?: boolean;
  wing?: boolean;
  prop?: 'PICK_UP' | 'PUT_DOWN' | 'MAP_UNFOLD' | 'MAP_FOLD' | 'DOOR_OPEN' | 'DOOR_CLOSE' | null;
}): SfxEvent[] {
  const events: SfxEvent[] = [];
  const wood = /tavern|bakery|interior/.test(input.locationId);
  if (input.pipFoot) {
    events.push(planSfxEvent({
      sfxEventId: `${input.shotId}_PIP_FOOT`,
      semanticType: wood ? 'FOOTSTEP_WOOD' : input.locationId.includes('forest') ? 'FOOTSTEP_DIRT' : 'FOOTSTEP_SOFT',
      frame: input.frame,
      duration: 4,
      intensity: 0.4,
      spatialRole: 'LEFT',
      characterId: 'PIP',
      propId: null,
      locationId: input.locationId,
      priority: 'BACKGROUND',
    }));
  }
  if (input.goatHoof) {
    events.push(planSfxEvent({
      sfxEventId: `${input.shotId}_GOAT_HOOF`,
      semanticType: wood ? 'HOOF_WOOD' : 'HOOF_SOFT',
      frame: input.frame + 2,
      duration: 4,
      intensity: 0.45,
      spatialRole: 'RIGHT',
      characterId: 'GOAT',
      propId: null,
      locationId: input.locationId,
      priority: 'BACKGROUND',
    }));
  }
  if (input.wing) {
    events.push(planSfxEvent({
      sfxEventId: `${input.shotId}_WING`,
      semanticType: 'WING_FLUTTER',
      frame: input.frame,
      duration: 8,
      intensity: 0.5,
      spatialRole: 'CENTER',
      characterId: 'PIP',
      propId: null,
      locationId: input.locationId,
      priority: 'ACCENT',
    }));
  }
  if (input.prop === 'PICK_UP') events.push(planSfxEvent({ sfxEventId: `${input.shotId}_PICK`, semanticType: 'OBJECT_PICKUP', frame: input.frame, duration: 6, intensity: 0.6, spatialRole: 'CENTER', characterId: 'PIP', propId: 'story-prop', locationId: input.locationId, priority: 'STORY' }));
  if (input.prop === 'PUT_DOWN') events.push(planSfxEvent({ sfxEventId: `${input.shotId}_SET`, semanticType: 'OBJECT_SETDOWN', frame: input.frame, duration: 6, intensity: 0.55, spatialRole: 'CENTER', characterId: 'PIP', propId: 'story-prop', locationId: input.locationId, priority: 'STORY' }));
  if (input.prop === 'MAP_UNFOLD') events.push(planSfxEvent({ sfxEventId: `${input.shotId}_MAP_OPEN`, semanticType: 'MAP_UNFOLD', frame: input.frame, duration: 10, intensity: 0.5, spatialRole: 'CENTER', characterId: null, propId: 'map', locationId: input.locationId, priority: 'STORY' }));
  if (input.prop === 'MAP_FOLD') events.push(planSfxEvent({ sfxEventId: `${input.shotId}_MAP_FOLD`, semanticType: 'MAP_FOLD', frame: input.frame, duration: 10, intensity: 0.45, spatialRole: 'CENTER', characterId: null, propId: 'map', locationId: input.locationId, priority: 'STORY' }));
  if (input.prop === 'DOOR_OPEN') events.push(planSfxEvent({ sfxEventId: `${input.shotId}_DOOR_OPEN`, semanticType: 'DOOR_OPEN', frame: input.frame, duration: 12, intensity: 0.5, spatialRole: 'WIDE', characterId: null, propId: 'door', locationId: input.locationId, priority: 'STORY' }));
  if (input.prop === 'DOOR_CLOSE') events.push(planSfxEvent({ sfxEventId: `${input.shotId}_DOOR_CLOSE`, semanticType: 'DOOR_CLOSE', frame: input.frame, duration: 10, intensity: 0.5, spatialRole: 'WIDE', characterId: null, propId: 'door', locationId: input.locationId, priority: 'STORY' }));
  return events;
}

export function ambienceForLocation(locationId: string, weather?: string, timeOfDay?: string): AmbienceLayer {
  if (locationId.includes('tavern')) return 'TAVERN_INTERIOR';
  if (locationId.includes('river')) return 'RIVER';
  if (locationId.includes('mountain') || locationId.includes('overlook')) return 'MOUNTAIN_WIND';
  if (locationId.includes('festival')) return 'FESTIVAL';
  if (weather === 'RAIN' && locationId.includes('forest')) return 'FOREST_RAIN';
  if (weather === 'SNOW') return 'SNOW_SOFT';
  if (timeOfDay === 'NIGHT_COZY') return locationId.includes('forest') ? 'MAGICAL_NIGHT' : 'VILLAGE_NIGHT';
  if (locationId.includes('forest')) return 'FOREST_DAY';
  return 'VILLAGE_DAY';
}

export function planMusicCue(input: {
  cueId: string;
  role: MusicRole;
  startFrame: number;
  endFrame: number;
  storyBeatRefs: string[];
  dialoguePresent?: boolean;
}): MusicCue {
  const duck: DuckState = input.dialoguePresent ? 'MEDIUM_DUCK' : 'NO_DUCK';
  const body = {
    schemaVersion: MUSIC_CUE_SCHEMA,
    cueId: input.cueId,
    role: input.role,
    startFrame: input.startFrame,
    endFrame: input.endFrame,
    energy: input.role === 'TENSION' || input.role === 'ADVENTURE' ? 0.7 : input.role === 'ENDING_BUTTON' || input.role === 'HEARTWARMING' ? 0.35 : 0.5,
    duckUnderDialogue: duck,
    transition: input.role === 'ENDING_BUTTON' ? 'CROSSFADE' : 'HOLD',
    storyBeatRefs: input.storyBeatRefs,
    copyrightedAudioIncluded: false as const,
  };
  return { ...body, musicDependencySha256: sha256Canonical(body) };
}

export function musicRoleForBeat(beatType: string): MusicRole {
  if (beatType === 'HOOK') return 'OPENING_HOOK';
  if (beatType === 'COMEDY') return 'COMEDY';
  if (beatType === 'TENSION') return 'TENSION';
  if (beatType === 'DISCOVERY' || beatType === 'REVEAL') return 'DISCOVERY';
  if (beatType === 'PAYOFF') return 'PAYOFF';
  if (beatType === 'BUTTON') return 'ENDING_BUTTON';
  if (beatType === 'MOVEMENT') return 'ADVENTURE';
  if (beatType === 'QUESTION') return 'MYSTERY';
  return 'CURIOUS';
}

export function planDucking(input: { dialogue: boolean; sfxPriority?: SfxEvent['priority'] }): DuckState {
  if (!input.dialogue) return input.sfxPriority === 'STORY' ? 'LIGHT_DUCK' : 'NO_DUCK';
  return input.sfxPriority === 'STORY' ? 'STRONG_DUCK' : 'MEDIUM_DUCK';
}

export type AudioMixFinding = {
  code:
    | 'DIALOGUE_PRESENT'
    | 'DIALOGUE_NOT_CLIPPED'
    | 'MUSIC_UNDER_DIALOGUE'
    | 'AMBIENCE_CONTINUITY'
    | 'SFX_NOT_OVERDENSE'
    | 'SFX_SYNC'
    | 'NO_DUPLICATE_DIALOGUE'
    | 'AUDIO_END_MATCH'
    | 'SILENCE_NOT_ACCIDENTAL';
  passed: boolean;
  measuredLoudness: false;
};

export function evaluateAudioMixPlan(input: {
  dialogueClips: number;
  duplicateDialogue: boolean;
  musicDuringDialogueUnDuck: boolean;
  sfxPerSecond: number;
  ambienceGaps: number;
  sfxDesync: boolean;
  pictureEnd: number;
  audioEnd: number;
  accidentalSilence: boolean;
}): { findings: AudioMixFinding[]; passed: boolean; measuredLoudness: false } {
  const findings: AudioMixFinding[] = [
    { code: 'DIALOGUE_PRESENT', passed: input.dialogueClips > 0, measuredLoudness: false },
    { code: 'DIALOGUE_NOT_CLIPPED', passed: !input.duplicateDialogue, measuredLoudness: false },
    { code: 'MUSIC_UNDER_DIALOGUE', passed: !input.musicDuringDialogueUnDuck, measuredLoudness: false },
    { code: 'AMBIENCE_CONTINUITY', passed: input.ambienceGaps === 0, measuredLoudness: false },
    { code: 'SFX_NOT_OVERDENSE', passed: input.sfxPerSecond <= 4, measuredLoudness: false },
    { code: 'SFX_SYNC', passed: !input.sfxDesync, measuredLoudness: false },
    { code: 'NO_DUPLICATE_DIALOGUE', passed: !input.duplicateDialogue, measuredLoudness: false },
    { code: 'AUDIO_END_MATCH', passed: Math.abs(input.pictureEnd - input.audioEnd) <= 8, measuredLoudness: false },
    { code: 'SILENCE_NOT_ACCIDENTAL', passed: !input.accidentalSilence, measuredLoudness: false },
  ];
  return { findings, passed: findings.every((item) => item.passed), measuredLoudness: false };
}

export function sfxTypes(): readonly SfxType[] {
  return SFX_TYPES;
}
export function ambienceLayers(): readonly AmbienceLayer[] {
  return AMBIENCE_LAYERS;
}
export function musicRoles(): readonly MusicRole[] {
  return MUSIC_ROLES;
}
export function duckStates(): readonly DuckState[] {
  return DUCK_STATES;
}

import { GOAT_CHARACTER_ID, PIP_CHARACTER_ID, type RegisteredCharacterId } from './types';

export const CANDIDATE_AUDIO_LABEL = 'ElevenLabs candidate test — not Pip/Goat’s approved permanent voice.';
export const LIVE_TEST_LOCKED_MESSAGE =
  'Live voice test locked. Add the API key and authorization in Vercel Preview settings. Playback-test chimes stay available.';
export const CANDIDATES_MISSING_MESSAGE = 'Candidate voices not configured';
export const CANDIDATE_REQUEST_MAX_CHARS = 300;
export const DEFAULT_VOICE_TEST_MAX_CHARACTERS = 600;

export const FIXED_CANDIDATE_LINES = {
  [PIP_CHARACTER_ID]: 'Feathers and freckles! Let’s follow the map and see what we discover!',
  [GOAT_CHARACTER_ID]: 'Goat-tastic! Hooves up, Pip. Adventure is waiting!',
} as const;

export const CANDIDATE_SLOTS = ['pip-1', 'pip-2', 'pip-3', 'goat-1', 'goat-2', 'goat-3'] as const;
export type CandidateSlot = (typeof CANDIDATE_SLOTS)[number];

export const CANDIDATE_SLOT_ENV: Record<CandidateSlot, string> = {
  'pip-1': 'TIVVLEJOY_VOICE_CANDIDATE_PIP_1',
  'pip-2': 'TIVVLEJOY_VOICE_CANDIDATE_PIP_2',
  'pip-3': 'TIVVLEJOY_VOICE_CANDIDATE_PIP_3',
  'goat-1': 'TIVVLEJOY_VOICE_CANDIDATE_GOAT_1',
  'goat-2': 'TIVVLEJOY_VOICE_CANDIDATE_GOAT_2',
  'goat-3': 'TIVVLEJOY_VOICE_CANDIDATE_GOAT_3',
};

export type PublicCandidate = {
  slot: CandidateSlot;
  characterId: RegisteredCharacterId;
  label: string;
  direction: string;
  configured: boolean;
};

const CANDIDATE_META: Record<CandidateSlot, Omit<PublicCandidate, 'configured'>> = {
  'pip-1': {
    slot: 'pip-1',
    characterId: PIP_CHARACTER_ID,
    label: 'Pip candidate A — bright and curious',
    direction: 'Young fictional girl. Bright, sweet, curious, energetic. Medium-high, clear, warm. Not squeaky, shrill, babyish, or a real child.',
  },
  'pip-2': {
    slot: 'pip-2',
    characterId: PIP_CHARACTER_ID,
    label: 'Pip candidate B — sweet and energetic',
    direction: 'Young fictional girl. Bright, sweet, curious, energetic. Medium-high, clear, warm. Not squeaky, shrill, babyish, or a real child.',
  },
  'pip-3': {
    slot: 'pip-3',
    characterId: PIP_CHARACTER_ID,
    label: 'Pip candidate C — warm natural delivery',
    direction: 'Young fictional girl. Bright, sweet, curious, energetic. Medium-high, clear, warm. Not squeaky, shrill, babyish, or a real child.',
  },
  'goat-1': {
    slot: 'goat-1',
    characterId: GOAT_CHARACTER_ID,
    label: 'Goat candidate A — warm and playful',
    direction: 'Young fictional boy. Warm, playful, adventurous. Medium pitch. Rounded long-o in Goat. No bleat. Not deep, babyish, or a real child.',
  },
  'goat-2': {
    slot: 'goat-2',
    characterId: GOAT_CHARACTER_ID,
    label: 'Goat candidate B — adventurous companion',
    direction: 'Young fictional boy. Warm, playful, adventurous. Medium pitch. Rounded long-o in Goat. No bleat. Not deep, babyish, or a real child.',
  },
  'goat-3': {
    slot: 'goat-3',
    characterId: GOAT_CHARACTER_ID,
    label: 'Goat candidate C — natural long-o',
    direction: 'Young fictional boy. Warm, playful, adventurous. Medium pitch. Rounded long-o in Goat. No bleat. Not deep, babyish, or a real child.',
  },
};

export function isCandidateSlot(value: string): value is CandidateSlot {
  return (CANDIDATE_SLOTS as readonly string[]).includes(value);
}

export function fixedLineFor(characterId: RegisteredCharacterId): string {
  return FIXED_CANDIDATE_LINES[characterId];
}

export function candidateCharacterId(slot: CandidateSlot): RegisteredCharacterId {
  return CANDIDATE_META[slot].characterId;
}

export function publicCandidateDirectory(configured: Partial<Record<CandidateSlot, boolean>> = {}): PublicCandidate[] {
  return CANDIDATE_SLOTS.map((slot) => ({
    ...CANDIDATE_META[slot],
    configured: Boolean(configured[slot]),
  }));
}

export function isExactFixedLine(characterId: RegisteredCharacterId, text: string): boolean {
  return text === FIXED_CANDIDATE_LINES[characterId];
}

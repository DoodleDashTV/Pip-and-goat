import { GOAT_CHARACTER_ID, PIP_CHARACTER_ID, type RegisteredCharacterId } from './types';

export type VoiceGuide = {
  characterId: RegisteredCharacterId;
  displayName: string;
  personality: readonly string[];
  delivery: readonly string[];
  forbidden: readonly string[];
  catchphrases: readonly string[];
  pronunciationNotes: string;
  defaultEmotion: string;
  defaultDirection: string;
};

export const PIP_VOICE_GUIDE: VoiceGuide = {
  characterId: PIP_CHARACTER_ID,
  displayName: 'Pip',
  personality: ['curious', 'cheerful', 'kind', 'enthusiastic'],
  delivery: ['youthful', 'bright', 'sweet', 'short explorer sentences'],
  forbidden: ['squeaky', 'shrill', 'adult', 'breathy-whisper', 'gravelly'],
  catchphrases: ['Let’s Doodle-Dash!', 'Feathers and freckles!'],
  pronunciationNotes: 'Pip: short i, bright. Doodle-Dash is two clear beats.',
  defaultEmotion: 'curious wonder',
  defaultDirection: 'Bright, kind, and a little breathless from exploring. Stay youthful, never shrill.',
};

export const GOAT_VOICE_GUIDE: VoiceGuide = {
  characterId: GOAT_CHARACTER_ID,
  displayName: 'Goat',
  personality: ['warm', 'playful', 'adventurous', 'loyal'],
  delivery: ['youthful', 'warm', 'playful', 'steady companion'],
  forbidden: ['deep', 'babyish', 'growling', 'adult-authoritative'],
  catchphrases: ['Goat-tastic!', 'Hooves up!', 'Map check!', 'I’m going for it!'],
  pronunciationNotes:
    'Goat: warm, rounded long-o sound. Keep delivery youthful and natural; do not imitate a bleat.',
  defaultEmotion: 'playful loyalty',
  defaultDirection: 'Warm and playful. Check the map, back Pip up, never growl or go adult.',
};

export function voiceGuideFor(characterId: RegisteredCharacterId): VoiceGuide {
  return characterId === PIP_CHARACTER_ID ? PIP_VOICE_GUIDE : GOAT_VOICE_GUIDE;
}

export function allCatchphrases(): string[] {
  return [...PIP_VOICE_GUIDE.catchphrases, ...GOAT_VOICE_GUIDE.catchphrases];
}

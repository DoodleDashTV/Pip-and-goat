import { GOAT_CHARACTER_ID, PIP_CHARACTER_ID, type RegisteredCharacterId } from './types';

export const APPROVED_SAMPLE_AUDIO_LABEL = 'Approved voice sample — Preview test only.';
/** @deprecated Use APPROVED_SAMPLE_AUDIO_LABEL. Kept only so older fixture-vs-sample tests stay explicit. */
export const CANDIDATE_AUDIO_LABEL = APPROVED_SAMPLE_AUDIO_LABEL;
export const LIVE_TEST_LOCKED_MESSAGE =
  'Live voice test locked. Add the API key and authorization in Vercel Preview settings. Playback-test chimes stay available.';
export const DEFAULT_VOICE_TEST_MAX_CHARACTERS = 600;
export const REQUIRED_VOICE_TEST_MAX_CHARACTERS = 600;

export const FIXED_APPROVED_LINES = {
  [PIP_CHARACTER_ID]: 'Feathers and freckles! Let’s follow the map and see what we discover!',
  [GOAT_CHARACTER_ID]: 'Goat-tastic! Hooves up, Pip. Adventure is waiting!',
} as const;

export const FIXED_CANDIDATE_LINES = FIXED_APPROVED_LINES;

export type PublicApprovedSample = {
  characterId: RegisteredCharacterId;
  displayName: 'Pip' | 'Goat';
  actionLabel: string;
  text: string;
};

export function fixedLineFor(characterId: RegisteredCharacterId): string {
  return FIXED_APPROVED_LINES[characterId];
}

export function publicApprovedSamples(): PublicApprovedSample[] {
  return [
    {
      characterId: PIP_CHARACTER_ID,
      displayName: 'Pip',
      actionLabel: 'Generate approved Pip sample',
      text: FIXED_APPROVED_LINES[PIP_CHARACTER_ID],
    },
    {
      characterId: GOAT_CHARACTER_ID,
      displayName: 'Goat',
      actionLabel: 'Generate approved Goat sample',
      text: FIXED_APPROVED_LINES[GOAT_CHARACTER_ID],
    },
  ];
}

export function isExactFixedLine(characterId: RegisteredCharacterId, text: string): boolean {
  return text === FIXED_APPROVED_LINES[characterId];
}

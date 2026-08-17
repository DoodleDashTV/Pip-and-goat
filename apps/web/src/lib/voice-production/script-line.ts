import { GOAT_VOICE_GUIDE, PIP_VOICE_GUIDE } from './guides';
import { estimateUsage } from './safety';
import { GOAT_CHARACTER_ID, PIP_CHARACTER_ID, VoiceProductionError, type RegisteredCharacterId } from './types';

/** Temporary Preview testing allowance. Do not raise these without a new increment. */
export const SCRIPT_TO_VOICE_MAX_CHARS = 250;
export const SCRIPT_TO_VOICE_MAX_PAID_REQUESTS = 3;
export const SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS = 750;
export const SCRIPT_TO_VOICE_AUDIO_LABEL = 'Preview voice generation — one confirmed line.';
export const SCRIPT_TO_VOICE_LOCKED_MESSAGE =
  'Preview voice generation is locked. Add the API key, paid-generation flag, and private test token in Vercel Preview settings.';

export const SCRIPT_TO_VOICE_COPY = {
  pageTitle: 'Preview voice generation',
  voicesTitle: 'Final approved Pip and Goat voices',
  cadence: 'One confirmed line at a time',
  paidWarning: 'Paid ElevenLabs generation — confirmation required',
} as const;

export type PublicScriptCharacter = {
  characterId: RegisteredCharacterId;
  displayName: 'Pip' | 'Goat';
  personality: readonly string[];
  delivery: readonly string[];
};

export function publicScriptCharacters(): PublicScriptCharacter[] {
  return [
    {
      characterId: PIP_CHARACTER_ID,
      displayName: 'Pip',
      personality: PIP_VOICE_GUIDE.personality,
      delivery: PIP_VOICE_GUIDE.delivery,
    },
    {
      characterId: GOAT_CHARACTER_ID,
      displayName: 'Goat',
      personality: GOAT_VOICE_GUIDE.personality,
      delivery: GOAT_VOICE_GUIDE.delivery,
    },
  ];
}

export function isSingleDialogueLine(text: string): boolean {
  if (typeof text !== 'string') return false;
  if (/[\r\n\u2028\u2029]/.test(text)) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  const pipCue = /\bpip\s*:/i.test(trimmed);
  const goatCue = /\bgoat\s*:/i.test(trimmed);
  if (pipCue && goatCue) return false;
  const speakerCues = trimmed.match(/\b(?:pip|goat)\s*:/gi) ?? [];
  if (speakerCues.length > 1) return false;
  return true;
}

export function assertSingleDialogueLine(text: string): string {
  if (!isSingleDialogueLine(text)) {
    throw new VoiceProductionError(
      'Only one confirmed dialogue line is accepted. Whole scripts, batches, and multi-line text are refused.',
      'SINGLE_LINE_REQUIRED',
    );
  }
  return text.trim();
}

export function estimateScriptLineUsage(text: string): { characterCount: number; unit: 'characters' } {
  return estimateUsage(assertSingleDialogueLine(text));
}

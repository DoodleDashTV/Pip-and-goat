import { voiceGuideFor } from './guides';
import { VoiceProductionError, type RegisteredCharacterId } from './types';

export type DialogueDraft = {
  characterId: RegisteredCharacterId;
  text: string;
  emotion: string;
  performanceDirection: string;
  pronunciationNotes: string;
  usedCatchphrase: string | null;
};

const PIP_LINES = [
  'The meadow path is wiggling toward a new clue. I can feel a map-secret hiding in the grass.',
  'If we listen to the wind and follow the sunny patches, the next marker should pop up.',
  'I packed extra kindness in my backpack. Whatever we find, we can share it.',
  'That sparkle by the stones looks like a trail crumb. Want to peek with me?',
  'The flowers are leaning the same way. I think they are pointing us onward.',
];

const GOAT_LINES = [
  'I will keep the map steady while you scout. Two sets of eyes beat one guess.',
  'If the path gets twisty I can hop the roots and call the turns.',
  'I brought my bravest hooves and my silliest joke, just in case the trail gets quiet.',
  'The meadow smells like a puzzle. I am ready to nudge the next clue loose.',
  'Stay close. I will watch the edges while you follow the bright bits.',
];

function hashSeed(parts: string[]): number {
  return parts.join('|').split('').reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);
}

function shouldUseCatchphrase(episodeId: string, sceneId: string, characterId: string): boolean {
  const seed = hashSeed([episodeId, sceneId, characterId]);
  return seed % 3 === 0;
}

function pickLine(pool: readonly string[], seed: number, premise: string): string {
  const base = pool[seed % pool.length] ?? pool[0];
  const crumb = premise.trim().split(/\s+/).slice(0, 4).join(' ');
  if (!crumb) return base;
  return `${base} We can use “${crumb}” as our next look-for.`;
}

export function generateOriginalDialogue(input: {
  characterId: RegisteredCharacterId;
  episodeId: string;
  sceneId: string;
  premise?: string;
}): DialogueDraft {
  const guide = voiceGuideFor(input.characterId);
  const seed = hashSeed([input.episodeId, input.sceneId, input.characterId, input.premise ?? '']);
  const pool = input.characterId === 'CHAR_PIP_001' ? PIP_LINES : GOAT_LINES;
  let text = pickLine(pool, seed, input.premise ?? '');
  let usedCatchphrase: string | null = null;
  if (shouldUseCatchphrase(input.episodeId, input.sceneId, input.characterId)) {
    usedCatchphrase = guide.catchphrases[seed % guide.catchphrases.length] ?? null;
    if (usedCatchphrase) text = `${text} ${usedCatchphrase}`;
  }
  for (const line of guide.catchphrases) {
    if (text === line) {
      throw new VoiceProductionError('Dialogue must be original, not a guide-line repeat.', 'GUIDE_REPEAT');
    }
  }
  return {
    characterId: input.characterId,
    text,
    emotion: guide.defaultEmotion,
    performanceDirection: guide.defaultDirection,
    pronunciationNotes: guide.pronunciationNotes,
    usedCatchphrase,
  };
}

export function catchphraseUsedNaturally(text: string, episodeCount: number): boolean {
  const guideHits = [...voiceGuideFor('CHAR_PIP_001').catchphrases, ...voiceGuideFor('CHAR_GOAT_001').catchphrases];
  const used = guideHits.some((phrase) => text.includes(phrase));
  if (episodeCount <= 1) return true;
  return used === false || episodeCount % 3 === 0;
}

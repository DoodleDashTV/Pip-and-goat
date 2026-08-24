import { sha256Canonical } from './hash';
import { PRODUCTION_VISEMES, type ProductionViseme } from './types';

export const VISEME_TO_LEGACY_BUCKET = {
  REST: 'REST',
  AI: 'WIDE_OPEN',
  E: 'MEDIUM_OPEN',
  O: 'ROUND',
  U: 'ROUND',
  MBP: 'CLOSED',
  FV: 'SMALL_OPEN',
  L: 'SMALL_OPEN',
  TH: 'SMALL_OPEN',
  WQ: 'ROUND',
  CHSH: 'SMALL_OPEN',
  KG: 'MEDIUM_OPEN',
  R: 'MEDIUM_OPEN',
} as const;

export type SyntheticPhonemeCue = {
  atMs: number;
  phoneme: string;
};

export type VisemeKey = {
  atMs: number;
  viseme: ProductionViseme;
  legacyBucket: (typeof VISEME_TO_LEGACY_BUCKET)[ProductionViseme];
};

export type SpeechTimingPlan = {
  characterId: 'CHAR_GOAT_001' | 'CHAR_PIP_001';
  lineId: string;
  cues: readonly VisemeKey[];
  source: 'SYNTHETIC_FIXTURE';
  elevenLabsContacted: false;
  pretendsAccurateLipSync: false;
  planSha256: string;
};

const PHONEME_TO_VISEME: Record<string, ProductionViseme> = {
  A: 'AI',
  AH: 'AI',
  I: 'AI',
  E: 'E',
  EH: 'E',
  O: 'O',
  U: 'U',
  OO: 'U',
  M: 'MBP',
  B: 'MBP',
  P: 'MBP',
  F: 'FV',
  V: 'FV',
  L: 'L',
  TH: 'TH',
  W: 'WQ',
  Q: 'WQ',
  CH: 'CHSH',
  SH: 'CHSH',
  K: 'KG',
  G: 'KG',
  R: 'R',
};

export function visemeForPhoneme(phoneme: string): ProductionViseme {
  return PHONEME_TO_VISEME[phoneme.toUpperCase()] ?? 'REST';
}

export function planSpeechFromSyntheticTiming(
  characterId: SpeechTimingPlan['characterId'],
  lineId: string,
  cues: readonly SyntheticPhonemeCue[],
): SpeechTimingPlan {
  const mapped = cues.map((cue) => {
    const viseme = visemeForPhoneme(cue.phoneme);
    return { atMs: cue.atMs, viseme, legacyBucket: VISEME_TO_LEGACY_BUCKET[viseme] };
  });
  const body = {
    characterId,
    lineId,
    cues: mapped,
    source: 'SYNTHETIC_FIXTURE' as const,
    elevenLabsContacted: false as const,
    pretendsAccurateLipSync: false as const,
  };
  return { ...body, planSha256: sha256Canonical(body) };
}

export function allProductionVisemes(): readonly ProductionViseme[] {
  return PRODUCTION_VISEMES;
}

export const GOAT_SYNTHETIC_TALKING_FIXTURE: readonly SyntheticPhonemeCue[] = [
  { atMs: 0, phoneme: 'REST' },
  { atMs: 80, phoneme: 'AH' },
  { atMs: 160, phoneme: 'E' },
  { atMs: 240, phoneme: 'O' },
  { atMs: 320, phoneme: 'U' },
  { atMs: 400, phoneme: 'M' },
  { atMs: 480, phoneme: 'F' },
  { atMs: 560, phoneme: 'L' },
  { atMs: 640, phoneme: 'TH' },
  { atMs: 720, phoneme: 'W' },
  { atMs: 800, phoneme: 'SH' },
  { atMs: 880, phoneme: 'K' },
  { atMs: 960, phoneme: 'R' },
  { atMs: 1040, phoneme: 'REST' },
];

export function goatSyntheticTalkingPlan() {
  return planSpeechFromSyntheticTiming('CHAR_GOAT_001', 'GOAT.SYNTHETIC.VISEME_SWEEP', GOAT_SYNTHETIC_TALKING_FIXTURE);
}

import { sha256Canonical } from './hash';
import { VISEME_PLAN_SCHEMA, type TimingSource, type VisemeBucket } from './types';
import type { DialogueTimingPlan } from './dialogue';

export type VisemeKey = { atMs: number; bucket: VisemeBucket };

export type VisemePlan = {
  schemaVersion: typeof VISEME_PLAN_SCHEMA;
  characterId: 'PIP' | 'GOAT';
  lineId: string;
  adapter: 'PIP_BEAK' | 'GOAT_JAW';
  keys: VisemeKey[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  timingSource: TimingSource;
  pretendsAccurateLipSync: false;
  visemePlanSha256: string;
};

const PHONEME_MAP: Record<string, VisemeBucket> = {
  M: 'CLOSED',
  B: 'CLOSED',
  P: 'CLOSED',
  A: 'WIDE_OPEN',
  AH: 'WIDE_OPEN',
  E: 'MEDIUM_OPEN',
  I: 'SMALL_OPEN',
  O: 'ROUND',
  U: 'ROUND',
  F: 'SMALL_OPEN',
  S: 'SMALL_OPEN',
};

export function buildVisemePlan(timing: DialogueTimingPlan): VisemePlan {
  const adapter: VisemePlan['adapter'] = timing.characterId === 'PIP' ? 'PIP_BEAK' : 'GOAT_JAW';
  let keys: VisemeKey[] = [{ atMs: 0, bucket: 'REST' }];
  let confidence: VisemePlan['confidence'] = 'LOW';
  if (timing.phonemeTimings?.length) {
    confidence = 'HIGH';
    keys = timing.phonemeTimings.map((item) => ({
      atMs: item.startMs,
      bucket: PHONEME_MAP[item.phoneme.toUpperCase()] ?? 'MEDIUM_OPEN',
    }));
  } else if (timing.wordTimings?.length) {
    confidence = 'MEDIUM';
    keys = timing.wordTimings.flatMap((word, index) => [
      { atMs: word.startMs, bucket: index % 2 === 0 ? 'MEDIUM_OPEN' : 'SMALL_OPEN' },
      { atMs: word.endMs, bucket: 'CLOSED' },
    ]);
  } else if (timing.durationMs && timing.fallbackTimingSource !== 'TIMING_UNAVAILABLE') {
    confidence = 'LOW';
    const step = Math.max(140, Math.floor(timing.durationMs / 6));
    keys = Array.from({ length: 6 }, (_, index) => ({
      atMs: index * step,
      bucket: (['CLOSED', 'SMALL_OPEN', 'MEDIUM_OPEN', 'EMPHASIS', 'SMALL_OPEN', 'REST'] as VisemeBucket[])[index]!,
    }));
  }
  const body = {
    schemaVersion: VISEME_PLAN_SCHEMA,
    characterId: timing.characterId,
    lineId: timing.lineId,
    adapter,
    keys,
    confidence,
    timingSource: timing.fallbackTimingSource,
    pretendsAccurateLipSync: false as const,
  };
  return { ...body, visemePlanSha256: sha256Canonical(body) };
}

import { sha256Canonical } from './hash';
import { DIALOGUE_TIMING_SCHEMA, type TimingSource } from './types';

export type DialogueTimingPlan = {
  schemaVersion: typeof DIALOGUE_TIMING_SCHEMA;
  lineId: string;
  characterId: 'PIP' | 'GOAT';
  audioReceiptRef: string | null;
  audioSha256: string | null;
  durationMs: number | null;
  wordTimings: Array<{ word: string; startMs: number; endMs: number }> | null;
  phonemeTimings: Array<{ phoneme: string; startMs: number; endMs: number }> | null;
  fallbackTimingSource: TimingSource;
  speechStart: number | null;
  speechEnd: number | null;
  preRollMs: number;
  postRollMs: number;
  reactionLeadInMs: number;
  reactionTailMs: number;
  timingSha256: string;
};

export function buildDialogueTiming(input: {
  lineId: string;
  characterId: 'PIP' | 'GOAT';
  audioReceiptRef?: string | null;
  audioSha256?: string | null;
  durationMs?: number | null;
  wordTimings?: DialogueTimingPlan['wordTimings'];
  phonemeTimings?: DialogueTimingPlan['phonemeTimings'];
}): DialogueTimingPlan {
  let source: TimingSource = 'TIMING_UNAVAILABLE';
  if (input.phonemeTimings?.length) source = 'TIMING_EXACT';
  else if (input.wordTimings?.length) source = 'TIMING_WORD_LEVEL';
  else if (input.durationMs && input.audioReceiptRef && input.audioSha256) source = 'TIMING_LINE_LEVEL';
  const duration = input.durationMs ?? null;
  const body = {
    schemaVersion: DIALOGUE_TIMING_SCHEMA,
    lineId: input.lineId,
    characterId: input.characterId,
    audioReceiptRef: input.audioReceiptRef ?? null,
    audioSha256: input.audioSha256 ?? null,
    durationMs: duration,
    wordTimings: input.wordTimings ?? null,
    phonemeTimings: input.phonemeTimings ?? null,
    fallbackTimingSource: source,
    speechStart: duration != null ? 80 : null,
    speechEnd: duration != null ? duration - 60 : null,
    preRollMs: 80,
    postRollMs: 120,
    reactionLeadInMs: 160,
    reactionTailMs: 220,
  };
  return { ...body, timingSha256: sha256Canonical(body) };
}

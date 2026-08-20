import { sha256Canonical } from './hash';

export type BlinkEvent = { atMs: number; kind: 'SINGLE' | 'DOUBLE'; reason: string };

export type BlinkPlan = {
  shotId: string;
  characterId: 'PIP' | 'GOAT';
  events: BlinkEvent[];
  blinkPlanSha256: string;
};

export function buildBlinkPlan(input: {
  shotId: string;
  characterId: 'PIP' | 'GOAT';
  durationMs: number;
  emotion: string;
  speaking: boolean;
  attentionShifts: number[];
  seed: number;
}): BlinkPlan {
  const events: BlinkEvent[] = [];
  const surprise = /surpris/i.test(input.emotion);
  const thinking = /think|curious|confus/i.test(input.emotion);
  const energy = /happy|excit|run/i.test(input.emotion);
  const base = 900 + (input.seed % 400);
  let cursor = surprise ? 700 : 420;
  while (cursor < input.durationMs - 180) {
    const nearSpeechCritical = input.speaking && cursor % 1000 < 80;
    if (nearSpeechCritical && !thinking) {
      cursor += 160;
      continue;
    }
    const kind = thinking && cursor % (base * 2) < 80 ? 'DOUBLE' : 'SINGLE';
    events.push({ atMs: cursor, kind, reason: thinking ? 'gaze-shift blink' : energy ? 'short energetic blink' : 'natural blink' });
    cursor += energy ? base + 220 : base;
  }
  for (const shift of input.attentionShifts) {
    if (shift > 80 && shift < input.durationMs - 80 && !events.some((event) => Math.abs(event.atMs - shift) < 90)) {
      events.push({ atMs: shift + 40, kind: 'SINGLE', reason: 'attention change' });
    }
  }
  events.sort((left, right) => left.atMs - right.atMs);
  const body = { shotId: input.shotId, characterId: input.characterId, events };
  return { ...body, blinkPlanSha256: sha256Canonical(body) };
}

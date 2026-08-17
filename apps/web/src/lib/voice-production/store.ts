import { createHash } from 'node:crypto';
import type { VoiceLineRecord, VoiceUsageLedger } from './types';
import { currentUsageMonth, emptyLedger } from './safety';

export type VoiceProductionStore = {
  lines: Map<string, VoiceLineRecord>;
  byIdempotency: Map<string, string>;
  ledger: VoiceUsageLedger;
};

export function createMemoryVoiceStore(month = currentUsageMonth()): VoiceProductionStore {
  return {
    lines: new Map(),
    byIdempotency: new Map(),
    ledger: emptyLedger(month),
  };
}

export function makeLineId(): string {
  return `prv_voice_${Math.random().toString(36).slice(2, 10)}`;
}

export function makeIdempotencyKey(parts: Array<string | number>): string {
  return createHash('sha256').update(parts.map(String).join('|')).digest('hex').slice(0, 32);
}

export function episodeCharacterCount(store: VoiceProductionStore, episodeId: string): number {
  return [...store.lines.values()]
    .filter((line) => line.episodeId === episodeId && line.generationStatus !== 'REJECTED')
    .reduce((sum, line) => sum + line.characterCount, 0);
}

export function linesForEpisode(store: VoiceProductionStore, episodeId: string): VoiceLineRecord[] {
  return [...store.lines.values()].filter((line) => line.episodeId === episodeId);
}

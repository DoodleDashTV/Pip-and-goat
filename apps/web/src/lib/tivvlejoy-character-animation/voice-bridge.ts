import type { VoiceReceipt } from '@/lib/tivvlejoy-production-studio/types';
import { buildDialogueTiming, type DialogueTimingPlan } from './dialogue';
import { buildVisemePlan, type VisemePlan } from './viseme';

export type VoiceTimingMetadata = {
  durationMs?: number | null;
  wordTimings?: DialogueTimingPlan['wordTimings'];
  phonemeTimings?: DialogueTimingPlan['phonemeTimings'];
};

export function dialogueTimingFromVoiceReceipt(
  receipt: VoiceReceipt | null | undefined,
  characterId: 'PIP' | 'GOAT',
  lineId: string,
  meta?: VoiceTimingMetadata,
): DialogueTimingPlan {
  if (!receipt) {
    return buildDialogueTiming({ lineId, characterId });
  }
  return buildDialogueTiming({
    lineId,
    characterId,
    audioReceiptRef: receipt.receiptRef,
    audioSha256: receipt.receiptSha256,
    durationMs: meta?.durationMs ?? null,
    wordTimings: meta?.wordTimings ?? null,
    phonemeTimings: meta?.phonemeTimings ?? null,
  });
}

export function visemeFromVoiceReceipt(
  receipt: VoiceReceipt | null | undefined,
  characterId: 'PIP' | 'GOAT',
  lineId: string,
  meta?: VoiceTimingMetadata,
): VisemePlan {
  return buildVisemePlan(dialogueTimingFromVoiceReceipt(receipt, characterId, lineId, meta));
}

export function missingVoiceBlocksExactMouthTiming(timing: DialogueTimingPlan): boolean {
  return timing.fallbackTimingSource === 'TIMING_UNAVAILABLE' || timing.fallbackTimingSource === 'TIMING_LINE_LEVEL';
}

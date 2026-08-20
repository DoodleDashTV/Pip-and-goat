import { sampleEpisodeWithKnownHashes } from '@/lib/tivvlejoy-episode-scene-planner';
import { ep012VoiceReceipts } from '@/lib/tivvlejoy-production-studio/fixtures';
import { EP012_DIALOGUE_REFS, VOICE_CONVERGENCE_SCHEMA, type TimingReality, type VoiceConvergence, type VoiceLineBinding } from './types';

export type PersistedVoiceReceiptLike = {
  dialogueRef: string;
  characterId?: string | null;
  receiptRef?: string | null;
  receiptSha256?: string | null;
  realAudioPresent?: boolean;
  lineTimingPresent?: boolean;
  wordTimingPresent?: boolean;
  exactTimingPresent?: boolean;
  stale?: boolean;
  synthetic?: boolean;
};

function timingReality(receipt: PersistedVoiceReceiptLike | undefined): TimingReality {
  if (!receipt) return 'MISSING_REAL_AUDIO';
  if (receipt.synthetic || receipt.realAudioPresent === false) {
    return receipt.synthetic ? 'SYNTHETIC_ONLY' : 'MISSING_REAL_AUDIO';
  }
  if (!receipt.realAudioPresent) return 'MISSING_REAL_AUDIO';
  if (receipt.exactTimingPresent) return 'REAL_EXACT_TIMING';
  if (receipt.wordTimingPresent) return 'REAL_WORD_TIMING';
  if (receipt.lineTimingPresent) return 'REAL_LINE_TIMING';
  return 'REAL_AUDIO_NO_TIMING';
}

function characterFor(dialogueRef: string, fallback?: string | null): string | null {
  if (fallback) return fallback;
  if (dialogueRef === 'DL_DECISION_01') return 'GOAT';
  if (EP012_DIALOGUE_REFS.includes(dialogueRef as (typeof EP012_DIALOGUE_REFS)[number])) return 'PIP';
  return null;
}

export function convergeVoiceReceipts(input?: {
  episodeLines?: readonly string[];
  persisted?: readonly PersistedVoiceReceiptLike[];
  includeSyntheticFixtures?: boolean;
}): VoiceConvergence {
  const plan = sampleEpisodeWithKnownHashes();
  const episodeLines = input?.episodeLines ?? [
    ...new Set(plan.shots.flatMap((shot) => shot.dialogueRefs)),
    ...EP012_DIALOGUE_REFS,
  ];
  const uniqueLines = [...new Set(episodeLines)];
  const persisted = [...(input?.persisted ?? [])];
  if (input?.includeSyntheticFixtures) {
    for (const fixture of ep012VoiceReceipts()) {
      persisted.push({
        dialogueRef: fixture.dialogueRef,
        characterId: fixture.characterId,
        receiptRef: fixture.receiptRef,
        receiptSha256: fixture.receiptSha256,
        realAudioPresent: false,
        synthetic: true,
      });
    }
  }
  const byRef = new Map(persisted.map((item) => [item.dialogueRef, item]));
  const bindings: VoiceLineBinding[] = uniqueLines.map((dialogueRef) => {
    const receipt = byRef.get(dialogueRef);
    const reality = timingReality(receipt);
    const real = reality !== 'MISSING_REAL_AUDIO' && reality !== 'SYNTHETIC_ONLY';
    return {
      dialogueRef,
      characterId: characterFor(dialogueRef, receipt?.characterId),
      receiptRef: real ? receipt?.receiptRef ?? null : null,
      receiptSha256: real ? receipt?.receiptSha256 ?? null : null,
      timingReality: reality,
      realReceipt: real,
      syntheticOnly: reality === 'SYNTHETIC_ONLY',
      blocker:
        reality === 'MISSING_REAL_AUDIO'
          ? `MISSING_REAL_AUDIO:${dialogueRef}`
          : reality === 'SYNTHETIC_ONLY'
            ? `SYNTHETIC_ONLY_CANNOT_BIND_AS_REAL:${dialogueRef}`
            : null,
    };
  });

  const realBindings = bindings.filter((item) => item.realReceipt);
  return {
    schemaVersion: VOICE_CONVERGENCE_SCHEMA,
    episodeId: 'EP012',
    pipConfirmedRealReceipts: realBindings.filter((item) => item.characterId === 'PIP').length,
    goatConfirmedRealReceipts: realBindings.filter((item) => item.characterId === 'GOAT').length,
    lineTimingReceipts: bindings.filter((item) => item.timingReality === 'REAL_LINE_TIMING').length,
    wordTimingReceipts: bindings.filter((item) => item.timingReality === 'REAL_WORD_TIMING').length,
    exactTimingReceipts: bindings.filter((item) => item.timingReality === 'REAL_EXACT_TIMING').length,
    missingAudioReceipts: bindings.filter((item) => item.timingReality === 'MISSING_REAL_AUDIO').length,
    staleReceipts: persisted.filter((item) => item.stale).length,
    bindings,
    externalVoiceVendorCalled: false,
    voiceIdentityMutated: false,
  };
}

export function bindEp012VoiceReceipts(persisted: readonly PersistedVoiceReceiptLike[] = []): VoiceConvergence {
  return convergeVoiceReceipts({ persisted, includeSyntheticFixtures: true });
}

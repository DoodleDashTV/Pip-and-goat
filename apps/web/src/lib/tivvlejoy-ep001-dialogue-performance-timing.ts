import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001AudioCueSheet } from '@/lib/tivvlejoy-ep001-audio-cue-sheet';
import { compileCharacterArtistDeliveryCheckpoint } from '@/lib/tivvlejoy-character-artist-delivery-checkpoint';

export const EP001_DIALOGUE_PERFORMANCE_TIMING_SCHEMA =
  'TIVVLEJOY_EP001_DIALOGUE_PERFORMANCE_TIMING_V1' as const;

export function compileEp001DialoguePerformanceTiming() {
  const audio = compileEp001AudioCueSheet();
  const artistCheckpoint = compileCharacterArtistDeliveryCheckpoint();

  const lines = audio.dialogueCues.map((cue) => ({
    lineId: cue.lineId,
    shotId: cue.shotId,
    speaker: cue.speaker,
    characterId: cue.characterId,
    voiceProfileVersion: cue.voiceProfileVersion,
    text: cue.text,
    delivery: cue.delivery,
    pictureWindow: {
      startFrame: cue.startFrame,
      endFrame: cue.endFrame,
      durationFrames: cue.durationFrames,
      preRollFrames: cue.pictureHandles.preRollFrames,
      postRollFrames: cue.pictureHandles.postRollFrames,
    },
    approvedAudioBinding: {
      voiceReceiptRef: null,
      audioSourceSha256: null,
      lineTimingReceiptRef: null,
      wordTimingReceiptRef: null,
      bound: false as const,
    },
    performanceEvidence: {
      wordTimingSegments: [] as Array<{ word: string; startFrame: number; endFrame: number }>,
      phonemeOrVisemeSegments: [] as Array<{ label: string; startFrame: number; endFrame: number }>,
      blinkMarkers: [] as number[],
      eyeAimMarkers: [] as Array<{ frame: number; target: string }>,
      expressionMarkers: [] as Array<{ frame: number; expression: string }>,
      gestureMarkers: [] as Array<{ frame: number; gesture: string }>,
    },
    reviewState: 'AWAITING_APPROVED_AUDIO_AND_ADMITTED_RIG' as const,
    finalFacialAnimationAuthorized: false as const,
  }));

  const characters = artistCheckpoint.deliveries.map((delivery) => ({
    characterId: delivery.characterId,
    displayName: delivery.displayName,
    admittedRigSha256: null,
    rigProductionReady: false as const,
    dialogueLineCount: lines.filter((line) => line.speaker === delivery.characterId).length,
    facialTimingReady: false as const,
  }));

  const qualityGates = [
    ['DIALOGUE_GATE_01', 'Every line is bound to the exact approved real voice/audio SHA-256 and receipt.'],
    ['DIALOGUE_GATE_02', 'Every word-timing segment remains inside the approved line picture window.'],
    ['DIALOGUE_GATE_03', 'Phoneme/viseme timing derives from the approved audio and is not fabricated from text alone.'],
    ['DIALOGUE_GATE_04', 'The exact admitted character rig supports the required beak/jaw, eye, blink, and expression controls.'],
    ['DIALOGUE_GATE_05', 'Blink and eye-aim timing supports performance without obscuring important dialogue beats.'],
    ['DIALOGUE_GATE_06', 'Expressions and gestures remain consistent with the approved line delivery and shot intention.'],
    ['DIALOGUE_GATE_07', 'Final lip-sync avoids chatter, over-keying, intersections, and visibly mechanical motion.'],
    ['DIALOGUE_GATE_08', 'A human reviewer approves the final facial/dialogue performance on the exact audio and rig identities.'],
  ] as const;

  const body = {
    schemaVersion: EP001_DIALOGUE_PERFORMANCE_TIMING_SCHEMA,
    episodeId: audio.episodeId,
    workingTitle: audio.workingTitle,
    audioCueSheetSha256: audio.cueSheetSha256,
    artistCheckpointSha256: artistCheckpoint.checkpointSha256,
    state: 'TIMING_WINDOWS_READY_REAL_AUDIO_AND_RIGS_UNBOUND' as const,
    format: { fps: audio.format.fps, totalFrames: audio.format.totalFrames, durationSeconds: audio.format.durationSeconds },
    lines,
    characters,
    qualityGates: qualityGates.map(([gateId, label]) => ({ gateId, label, state: 'BLOCKED' as const, complete: false as const, autoApproval: false as const })),
    timingRules: [
      'Use the authored line picture windows as limits, not as fabricated speech timing.',
      'Do not infer final word, phoneme, or viseme timing from written text when real approved audio is absent.',
      'Bind all final facial keys to both the exact approved audio SHA-256 and exact admitted character rig SHA-256.',
      'A replacement voice render or character rig invalidates affected final facial-animation evidence until re-reviewed.',
      'Use pre-roll and post-roll for anticipation, breath, reaction, and settle only after the real performance is known.',
      'Preserve natural holds and readable shapes rather than keying every frame or every phoneme mechanically.',
      'Human performance review is required after dialogue, eyes, blinks, expressions, and gestures are combined.',
    ],
    metrics: {
      dialogueLineCount: lines.length,
      pipLineCount: lines.filter((line) => line.speaker === 'PIP').length,
      goatLineCount: lines.filter((line) => line.speaker === 'GOAT').length,
      qualityGateCount: qualityGates.length,
      realAudioBindingsPresent: 0 as const,
      admittedRigBindingsPresent: 0 as const,
    },
    authority: {
      realAudioBound: false as const,
      admittedRigsBound: false as const,
      wordTimingApproved: false as const,
      visemeTimingApproved: false as const,
      facialAnimationExecutionAllowed: false as const,
      finalLipSyncAllowed: false as const,
      paidComputeAllowed: false as const,
      productionWritesAllowed: false as const,
      humanPerformanceApprovalIssued: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      audioBytesIncluded: false as const,
      rigBytesIncluded: false as const,
      voiceProviderCalls: 0 as const,
      blenderLaunched: false as const,
      keyframesAuthored: false as const,
      paidRequests: 0 as const,
      networkCalls: 0 as const,
      storageMutations: 0 as const,
      productionMutations: 0 as const,
    },
  };

  return { ...body, timingManifestSha256: sha256Canonical(body) };
}

export type Ep001DialoguePerformanceTiming = ReturnType<typeof compileEp001DialoguePerformanceTiming>;

import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001AudioCueSheet } from '@/lib/tivvlejoy-ep001-audio-cue-sheet';

export const EP001_VOICE_EXECUTION_READINESS_SCHEMA =
  'TIVVLEJOY_EP001_VOICE_EXECUTION_READINESS_V1' as const;

export function compileEp001VoiceExecutionReadiness() {
  const audio = compileEp001AudioCueSheet();

  const lines = audio.dialogueCues.map((cue, index) => ({
    order: index + 1,
    lineId: cue.lineId,
    shotId: cue.shotId,
    speaker: cue.speaker,
    characterId: cue.characterId,
    voiceProfileVersion: cue.voiceProfileVersion,
    voiceIdentityCheckpoint: cue.voiceIdentityCheckpoint,
    text: cue.text,
    delivery: cue.delivery,
    pictureWindow: {
      startFrame: cue.startFrame,
      endFrame: cue.endFrame,
      durationFrames: cue.durationFrames,
      startSeconds: cue.startSeconds,
      endSeconds: cue.endSeconds,
      preRollFrames: cue.pictureHandles.preRollFrames,
      postRollFrames: cue.pictureHandles.postRollFrames,
    },
    generationState: 'NOT_GENERATED' as const,
    providerReceiptRef: null,
    audioSha256: null,
    exactByteSize: null,
    timingSha256: null,
    wordTimingReceiptRef: null,
    humanApprovalReceiptSha256: null,
  }));

  const body = {
    schemaVersion: EP001_VOICE_EXECUTION_READINESS_SCHEMA,
    episodeId: audio.episodeId,
    workingTitle: audio.workingTitle,
    audioCueSheetSha256: audio.cueSheetSha256,
    state: 'EXECUTION_PACKET_READY_REAL_AUDIO_NOT_GENERATED' as const,
    format: {
      targetSampleRateHz: audio.format.sampleRateHz,
      targetChannels: audio.format.channels,
      pictureFps: audio.format.fps,
      pictureTotalFrames: audio.format.totalFrames,
      pictureDurationSeconds: audio.format.durationSeconds,
    },
    lines,
    executionOrder: [
      'Confirm the exact approved voice identity/profile for each speaker is unchanged.',
      'Generate exactly one candidate for each locked dialogue line using the approved profile and exact text.',
      'Persist provider receipt, exact audio byte size, and SHA-256 for every line.',
      'Derive line/word timing from the exact generated audio bytes and persist immutable timing receipts.',
      'Check every line fits its locked picture window without rewriting or time-stretching the approved performance.',
      'Human-review identity, pronunciation, emotion, pacing, intelligibility, and child-audience suitability for every line.',
      'Reject and regenerate only failed lines; never overwrite a previously hashed candidate.',
      'Admit the complete eight-line receipt set only after all eight exact line versions are human-approved.',
    ],
    failureRules: [
      'A provider success response without persisted audio SHA-256 and receipt is not a successful production line.',
      'A line that exceeds its picture window is rejected; picture timing is not silently changed to hide the problem.',
      'A changed line text, voice identity, provider model/profile, or audio re-encode creates a new candidate identity and requires review.',
      'No line may be marked approved from a synthetic placeholder, dry-run output, filename, or provider request ID alone.',
      'Human approval is per exact audio SHA-256; approval cannot transfer to a different re-generation.',
      'Final facial animation remains blocked until the exact admitted audio hashes and timing receipts are available.',
    ],
    metrics: {
      lineCount: lines.length,
      pipLineCount: lines.filter((line) => line.speaker === 'PIP').length,
      goatLineCount: lines.filter((line) => line.speaker === 'GOAT').length,
      generatedLineCount: 0 as const,
      approvedLineCount: 0 as const,
    },
    authority: {
      providerExecutionPerformed: false as const,
      realAudioPresent: false as const,
      voiceReceiptAdmissionGranted: false as const,
      finalLipSyncAllowed: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      audioBytesIncluded: false as const,
      voiceProviderCalls: 0 as const,
      paidRequests: 0 as const,
      storageMutations: 0 as const,
      productionMutations: 0 as const,
    },
  };

  return { ...body, voiceExecutionReadinessSha256: sha256Canonical(body) };
}

export type Ep001VoiceExecutionReadiness = ReturnType<typeof compileEp001VoiceExecutionReadiness>;

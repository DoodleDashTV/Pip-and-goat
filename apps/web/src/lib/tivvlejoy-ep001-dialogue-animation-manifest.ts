import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001AudioCueSheet } from '@/lib/tivvlejoy-ep001-audio-cue-sheet';

export const EP001_DIALOGUE_ANIMATION_MANIFEST_SCHEMA = 'TIVVLEJOY_EP001_DIALOGUE_ANIMATION_MANIFEST_V1' as const;

const CHARACTER_PLAN = {
  PIP: {
    characterId: 'CHAR_PIP_001' as const,
    faceControls: ['BEAK_UPPER','BEAK_LOWER','EYE_AIM','BLINK_L','BLINK_R','HEAD'] as const,
    gestureControls: ['HEAD','NECK','CHEST','BODY','WING_L','WING_R'] as const,
    dialogueMechanism: 'BEAK_ARTICULATION_PLUS_EYE_AND_HEAD_ACTING' as const,
  },
  GOAT: {
    characterId: 'CHAR_GOAT_001' as const,
    faceControls: ['JAW','MOUTH','EYE_AIM','BLINK','HEAD'] as const,
    gestureControls: ['HEAD','NECK','CHEST','BODY'] as const,
    dialogueMechanism: 'JAW_MOUTH_ARTICULATION_PLUS_EYE_AND_HEAD_ACTING' as const,
  },
} as const;

export function compileEp001DialogueAnimationManifest() {
  const audio = compileEp001AudioCueSheet();
  const lines = audio.dialogueCues.map((cue) => {
    const plan = CHARACTER_PLAN[cue.speaker];
    const body = {
      lineId: cue.lineId,
      shotId: cue.shotId,
      speaker: cue.speaker,
      characterId: plan.characterId,
      text: cue.text,
      delivery: cue.delivery,
      startFrame: cue.startFrame,
      endFrame: cue.endFrame,
      durationFrames: cue.durationFrames,
      preRollFramesAvailable: cue.pictureHandles.preRollFrames,
      postRollFramesAvailable: cue.pictureHandles.postRollFrames,
      minimumActingLeadFrames: Math.min(6, Math.max(0, cue.pictureHandles.preRollFrames)),
      minimumActingSettleFrames: Math.min(8, Math.max(0, cue.pictureHandles.postRollFrames)),
      faceControls: plan.faceControls,
      gestureControls: plan.gestureControls,
      dialogueMechanism: plan.dialogueMechanism,
      applicationLanes: {
        phonemeOrSyllableLane: 'AWAITING_REAL_WORD_OR_PHONEME_TIMING' as const,
        mouthOrBeakLane: 'AWAITING_REAL_AUDIO' as const,
        eyeLane: 'PLAN_READY_REAL_PERFORMANCE_REVIEW_REQUIRED' as const,
        blinkLane: 'PLAN_READY_REAL_PERFORMANCE_REVIEW_REQUIRED' as const,
        headLane: 'PLAN_READY_REAL_PERFORMANCE_REVIEW_REQUIRED' as const,
        bodyGestureLane: 'PLAN_READY_REAL_PERFORMANCE_REVIEW_REQUIRED' as const,
        wingGestureLane: cue.speaker === 'PIP' ? 'PLAN_READY_REAL_PERFORMANCE_REVIEW_REQUIRED' as const : 'NOT_APPLICABLE' as const,
      },
      timingRequirements: {
        exactApprovedVoiceReceiptRequired: true as const,
        exactAudioSourceSha256Required: true as const,
        lineTimingReceiptRequired: true as const,
        wordTimingReceiptRequired: true as const,
        timeStretchAllowed: false as const,
        rewriteAllowed: false as const,
        duplicateLineAllowed: false as const,
      },
      performanceRules: [
        'Start eye/head intention before the first audible syllable when picture handles allow.',
        'Do not key every syllable with equal amplitude; preserve readable stylized phrasing.',
        'Keep blinks motivated and out of the strongest emphasis unless intentionally acting through a blink.',
        'Body/wing gestures support the line objective; they do not mechanically mirror every word.',
        'Settle the primary gesture after the line before the shot cut when picture handles allow.',
        'Human performance review is required after real audio is applied.',
      ],
      currentState: 'LOGICAL_APPLICATION_READY_REAL_AUDIO_UNBOUND' as const,
      animationWritten: false as const,
      humanApproved: false as const,
    };
    return { ...body, dialogueAnimationLineSha256: sha256Canonical(body) };
  });

  const body = {
    schemaVersion: EP001_DIALOGUE_ANIMATION_MANIFEST_SCHEMA,
    episodeId: 'EP001' as const,
    fps: audio.format.fps,
    audioCueSheetSha256: audio.cueSheetSha256,
    voiceIdentityCheckpoint: audio.voiceIdentity.checkpoint,
    lines,
    metrics: {
      lineCount: lines.length,
      pipLineCount: lines.filter((line) => line.speaker === 'PIP').length,
      goatLineCount: lines.filter((line) => line.speaker === 'GOAT').length,
      realAudioBoundCount: 0 as const,
      animatedCount: 0 as const,
      approvedCount: 0 as const,
    },
    globalRules: [
      'Every line remains bound to its exact canonical text and approved character voice identity.',
      'Real audio receipt and timing identities must be bound before final dialogue animation.',
      'No time stretching, rewriting, duplication, or silent replacement is allowed.',
      'Facial articulation and body acting are separate animation lanes with one human-reviewed performance result.',
      'Animation must target canonical adapter control roles, never raw artist naming directly.',
    ],
    authority: {
      realAudioBound: false as const,
      dialogueAnimationExecutionAllowed: false as const,
      animationWritten: false as const,
      performanceApprovalIssued: false as const,
      paidComputeAllowed: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
  };
  return { ...body, dialogueAnimationManifestSha256: sha256Canonical(body) };
}

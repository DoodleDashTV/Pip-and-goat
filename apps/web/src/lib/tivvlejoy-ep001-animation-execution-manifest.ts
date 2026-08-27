import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001AnimationBlockingBoard } from '@/lib/tivvlejoy-ep001-animation-blocking-board';
import { compileEp001AnimationReleaseGate } from '@/lib/tivvlejoy-ep001-animation-release-gate';
import { compileCharacterExpressionPoseLibrary } from '@/lib/tivvlejoy-character-expression-pose-library';

export const EP001_ANIMATION_EXECUTION_MANIFEST_SCHEMA =
  'TIVVLEJOY_EP001_ANIMATION_EXECUTION_MANIFEST_V1' as const;

export function compileEp001AnimationExecutionManifest() {
  const blocking = compileEp001AnimationBlockingBoard();
  const release = compileEp001AnimationReleaseGate();
  const expressions = compileCharacterExpressionPoseLibrary();

  const shotTasks = blocking.shots.map((shot, index) => ({
    order: index + 1,
    shotId: shot.shotId,
    frameRange: { inFrame: shot.inFrame, outFrame: shot.outFrame, durationFrames: shot.durationFrames },
    beat: shot.beat,
    storyPurpose: shot.storyPurpose,
    action: shot.action,
    cameraTemplateId: shot.cameraTemplateId,
    cameraMotion: shot.cameraMotion,
    focalTarget: shot.focalTarget,
    visibleCharacters: shot.characterTracks.map((track) => track.characterId),
    dialogueLineIds: shot.dialogueCues.map((cue) => cue.lineId),
    sfxEventIds: shot.sfxSyncCues.map((cue) => cue.sfxEventId),
    continuityRequirements: [...shot.continuity],
    interactionRule: shot.interactionRule,
    cameraReadabilityRule: shot.cameraReadabilityRule,
    rigBindings: shot.characterTracks.map((track) => ({
      characterId: track.characterId,
      exactRigSha256: null,
      rigAdmissionReceiptRef: null,
      state: 'BLOCKED_AWAITING_ADMITTED_EXACT_RIG' as const,
    })),
    executionPasses: [
      { passId: 'SHOT_PASS_01', label: 'Stepped blocking and silhouette', state: 'BLOCKED' as const },
      { passId: 'SHOT_PASS_02', label: 'Contact, weight, and prop interaction', state: 'BLOCKED' as const },
      { passId: 'SHOT_PASS_03', label: 'Dialogue, gaze, facial, and reaction performance', state: 'BLOCKED' as const },
      { passId: 'SHOT_PASS_04', label: 'Spline timing, arcs, anticipation, and settle', state: 'BLOCKED' as const },
      { passId: 'SHOT_PASS_05', label: 'Secondary motion and accessory stability', state: 'BLOCKED' as const },
      { passId: 'SHOT_PASS_06', label: 'Continuity and 9:16 camera-readability QA', state: 'BLOCKED' as const },
      { passId: 'SHOT_PASS_07', label: 'Real-rig playblast and human visual approval', state: 'BLOCKED' as const },
    ],
    requiredEvidence: [
      'exact admitted rig SHA-256 for each visible character',
      'stepped-blocking playblast or frame sequence',
      'contact/deformation review evidence',
      ...(shot.dialogueCues.length > 0 ? ['exact approved voice audio SHA-256 plus timing receipt'] : []),
      'spline/polish playblast',
      'continuity review receipt',
      'human shot approval receipt bound to the exact animation source/version',
    ],
    sourceAnimationSha256: null,
    playblastSha256: null,
    humanApproved: false as const,
    retryCount: 0 as const,
    state: 'NOT_EXECUTED_BLOCKED_BY_ANIMATION_RELEASE' as const,
  }));

  const body = {
    schemaVersion: EP001_ANIMATION_EXECUTION_MANIFEST_SCHEMA,
    episodeId: blocking.episodeId,
    workingTitle: blocking.workingTitle,
    animationBlockingBoardSha256: blocking.blockingBoardSha256,
    animationReleaseGateSha256: release.releaseGateSha256,
    expressionPoseLibrarySha256: expressions.expressionPoseLibrarySha256,
    format: { ...blocking.format },
    state: 'SHOT_EXECUTION_MANIFEST_READY_EXECUTION_BLOCKED' as const,
    shotTasks,
    globalExecutionRules: [
      'Animation execution starts only after ANIM_RELEASE_01 through ANIM_RELEASE_08 are satisfied and a human issues the animation-release decision.',
      'Every visible character in a shot binds to the exact admitted rig SHA-256; filename or seller-delivery name is not identity.',
      'Stepped blocking is reviewed before spline polish, facial polish, secondary motion, or final playblast work.',
      'Final dialogue performance requires exact approved voice audio and timing receipts; never fabricate or estimate final lip-sync timing.',
      'A failed blocking, contact, deformation, continuity, or human review stops that exact shot version and creates a corrected source version.',
      'Do not overwrite approved animation sources or playblasts; corrected versions receive new immutable SHA-256 identities.',
      'Paid compute may be used only when the exact shot execution is eligible and the requested paid action has an explicit cost ceiling.',
      'Technical completion does not issue human shot approval or final animation approval.',
    ],
    completionCriteria: [
      '10 of 10 shot tasks have exact source-animation SHA-256 identities.',
      '10 of 10 shot tasks have real-rig playblast SHA-256 identities.',
      'Every applicable execution pass is complete for every shot.',
      'All dialogue shots are bound to exact approved audio timing.',
      'All shot continuity checks pass across the full 1,800-frame sequence.',
      'Every shot has explicit human visual approval.',
      'A separate human final-animation approval is issued for the complete sequence.',
    ],
    metrics: {
      shotTaskCount: shotTasks.length,
      executionPassCountPerShot: 7 as const,
      totalPlannedShotPasses: shotTasks.length * 7,
      dialogueShotCount: shotTasks.filter((shot) => shot.dialogueLineIds.length > 0).length,
      executedShotCount: 0 as const,
      approvedShotCount: 0 as const,
    },
    authority: {
      animationReleaseIssued: false as const,
      shotExecutionAllowed: false as const,
      blenderExecutionAllowed: false as const,
      playblastExecutionAllowed: false as const,
      paidComputeAllowed: false as const,
      finalAnimationApprovalIssued: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      rigBytesIncluded: false as const,
      audioBytesIncluded: false as const,
      animationBytesIncluded: false as const,
      blenderLaunched: false as const,
      keyframesAuthored: false as const,
      paidRequests: 0 as const,
      storageMutations: 0 as const,
      productionMutations: 0 as const,
    },
  };

  return { ...body, executionManifestSha256: sha256Canonical(body) };
}

export type Ep001AnimationExecutionManifest = ReturnType<typeof compileEp001AnimationExecutionManifest>;

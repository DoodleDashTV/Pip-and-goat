import { sha256Canonical } from '@/lib/tivvlejoy-character-animation/hash';
import { compileEp001AudioCueSheet } from '@/lib/tivvlejoy-ep001-audio-cue-sheet';
import { compileEp001ProductionPackage } from '@/lib/tivvlejoy-ep001-production-package';
import type { Ep001CharacterId } from '@/lib/tivvlejoy-ep001-production-package/types';

export const EP001_ANIMATION_BLOCKING_BOARD_SCHEMA =
  'TIVVLEJOY_EP001_ANIMATION_BLOCKING_BOARD_V1' as const;

type Ep001Package = ReturnType<typeof compileEp001ProductionPackage>;
type Ep001AudioCueSheet = ReturnType<typeof compileEp001AudioCueSheet>;

type BlockingPoseKind =
  | 'ENTRY_OR_HOLD'
  | 'PRIMARY_ACTION'
  | 'DIALOGUE_ACCENT'
  | 'PARTNER_REACTION'
  | 'STORY_REACTION'
  | 'SETTLE_OR_EXIT';

type ShotBlockingDirection = {
  primaryActionFrame: number;
  silentReactionFrame: number;
  interactionRule: string;
  cameraReadabilityRule: string;
};

const SHOT_BLOCKING_DIRECTIONS: Record<string, ShotBlockingDirection> = {
  EP001_SH01: {
    primaryActionFrame: 72,
    silentReactionFrame: 112,
    interactionRule:
      'Keep Pip’s toe and Goat’s hoof contacts planted; scarf and backpack overlap cannot hide either face.',
    cameraReadabilityRule:
      'Hold both silhouettes under the bakery sign while the loose fragment remains visible below it.',
  },
  EP001_SH02: {
    primaryActionFrame: 190,
    silentReactionFrame: 250,
    interactionRule:
      'Use approved Pip prop attachments for the two-wing map hold; the torn upper-right corner must stay readable.',
    cameraReadabilityRule:
      'Favor the map insert without cropping Pip’s beak or Goat’s listening reaction.',
  },
  EP001_SH03: {
    primaryActionFrame: 370,
    silentReactionFrame: 420,
    interactionRule:
      'Goat’s eyes and ears lead the screen-right turn; Pip’s existing story-map hold cannot drift.',
    cameraReadabilityRule:
      'Let Goat own the reaction while Pip remains a readable foreground partner and the axis stays intact.',
  },
  EP001_SH04: {
    primaryActionFrame: 535,
    silentReactionFrame: 600,
    interactionRule:
      'Pip points screen right while retaining the map; Goat’s eager bounce must land on both hooves.',
    cameraReadabilityRule:
      'Preserve both faces, Pip’s point, and the destination direction in one uncluttered two-shot.',
  },
  EP001_SH05: {
    primaryActionFrame: 720,
    silentReactionFrame: 790,
    interactionRule:
      'Both characters travel screen right and finish planted; Pip’s backpack and map stay stable through the run.',
    cameraReadabilityRule:
      'Maintain the pair’s 1.5-to-1 scale relationship and readable silhouettes through the location transition.',
  },
  EP001_SH06: {
    primaryActionFrame: 890,
    silentReactionFrame: 960,
    interactionRule:
      'Goat searches below the flowers without ground penetration while Pip keeps the story map open and secure.',
    cameraReadabilityRule:
      'Keep Goat’s low search and Pip’s middle-distance scan visible together without burying faces in dressing.',
  },
  EP001_SH07: {
    primaryActionFrame: 1_080,
    silentReactionFrame: 1_160,
    interactionRule:
      'Pip’s gaze reaches the fragment before her point; Goat follows the same upward eyeline without neck collapse.',
    cameraReadabilityRule:
      'The tilt must preserve Pip’s face, the fragment above Goat, and the screen-right story direction.',
  },
  EP001_SH08: {
    primaryActionFrame: 1_295,
    silentReactionFrame: 1_370,
    interactionRule:
      'Branch contact and fragment pickup stay blocked until approved contact controls are bound; no wing, face, or horn clipping.',
    cameraReadabilityRule:
      'Show Goat lowering the branch, Pip reaching, and their shared look without entering the caption-safe band.',
  },
  EP001_SH09: {
    primaryActionFrame: 1_490,
    silentReactionFrame: 1_570,
    interactionRule:
      'Keep map and fragment alignment centered and stable; neither reaction may obscure the drawn-path reveal.',
    cameraReadabilityRule:
      'The map owns the reveal while both faces remain readable at the edge of the composition.',
  },
  EP001_SH10: {
    primaryActionFrame: 1_670,
    silentReactionFrame: 1_740,
    interactionRule:
      'Complete the map fold before Pip’s invitation; Goat’s happy bounce lands before both walk screen right.',
    cameraReadabilityRule:
      'Hold the friendship button, clear destination, and screen-right exit while keeping captions unobstructed.',
  },
};

const QUALITY_GATES = [
  ['ANIMATION_GATE_01', 'Pip’s exact artist-authored rig is hash-verified and admitted.'],
  ['ANIMATION_GATE_02', 'Goat’s exact artist-authored rig is hash-verified and admitted.'],
  ['ANIMATION_GATE_03', 'Required deformation test poses pass human visual review.'],
  ['ANIMATION_GATE_04', 'Every moving track has clean foot, toe, hallux, or hoof plants.'],
  ['ANIMATION_GATE_05', 'Story-map and fragment attachment controls hold without drift.'],
  [
    'ANIMATION_GATE_06',
    'The flexible-branch interaction is solved without clipping or unsafe deformation.',
  ],
  [
    'ANIMATION_GATE_07',
    'Pip’s scarf, backpack, straps, and copper spiral remain present and stable.',
  ],
  ['ANIMATION_GATE_08', 'Goat’s collar and round tag remain present and stable.'],
  ['ANIMATION_GATE_09', 'Every key pose reads clearly in the 9:16 camera silhouette.'],
  ['ANIMATION_GATE_10', 'Gaze and head follow land on the locked story target.'],
  ['ANIMATION_GATE_11', 'Exact approved voice receipts provide real dialogue timing.'],
  ['ANIMATION_GATE_12', 'Mouth or beak animation passes dialogue and facial-deformation review.'],
  ['ANIMATION_GATE_13', 'Shot-to-shot position, prop, facing, and motion continuity pass.'],
  ['ANIMATION_GATE_14', 'A real-rig playblast receives explicit human visual approval.'],
] as const;

function assertShotDirection(
  shot: Ep001Package['shots'][number],
  direction: ShotBlockingDirection | undefined,
): asserts direction is ShotBlockingDirection {
  if (!direction) throw new Error(`EP001_BLOCKING_DIRECTION_MISSING:${shot.shotId}`);
  if (
    direction.primaryActionFrame <= shot.inFrame ||
    direction.primaryActionFrame >= shot.outFrame ||
    direction.silentReactionFrame <= direction.primaryActionFrame ||
    direction.silentReactionFrame >= shot.outFrame
  ) {
    throw new Error(`EP001_BLOCKING_DIRECTION_OUTSIDE_SHOT:${shot.shotId}`);
  }
}

function contactTarget(
  shotId: string,
  characterId: Ep001CharacterId,
  propAction: string | undefined,
) {
  if (shotId === 'EP001_SH08' && characterId === 'GOAT') return 'FLEXIBLE_BRANCH';
  if (propAction && shotId === 'EP001_SH08') return 'MAP_FRAGMENT';
  if (propAction) return 'STORY_MAP';
  return null;
}

function compileCharacterTrack(input: {
  episode: Ep001Package;
  shot: Ep001Package['shots'][number];
  characterId: Ep001CharacterId;
  direction: ShotBlockingDirection;
}) {
  const cue = input.shot.performance[input.characterId];
  if (!cue)
    throw new Error(`EP001_BLOCKING_PERFORMANCE_MISSING:${input.shot.shotId}:${input.characterId}`);

  const dialogue = input.episode.dialogue.filter(
    (line) => line.shotId === input.shot.shotId && line.speaker === input.characterId,
  );
  const shotDialogue = input.episode.dialogue.find((line) => line.shotId === input.shot.shotId);
  const speaking = dialogue.length > 0;
  const reactionFrame = shotDialogue
    ? Math.round((shotDialogue.startFrame + shotDialogue.endFrame) / 2)
    : input.direction.silentReactionFrame;
  const partner = input.characterId === 'PIP' ? 'GOAT' : 'PIP';
  const startFrame = input.shot.inFrame + 6;
  const settleFrame = input.shot.outFrame - 12;
  const poseCues: Array<{
    poseId: string;
    kind: BlockingPoseKind;
    frame: number;
    holdFrames: number;
    label: string;
    attentionTarget: string;
    mustRemainStepped: true;
    source: 'LOCKED_PERFORMANCE_INTENT' | 'LOCKED_DIALOGUE_WINDOW' | 'SHOT_CONTINUITY';
  }> = [
    {
      poseId: `${input.shot.shotId}_${input.characterId}_POSE_01`,
      kind: 'ENTRY_OR_HOLD',
      frame: startFrame,
      holdFrames: 6,
      label: `${cue.emotion} ${cue.locomotion} setup with attention on ${cue.attentionTarget}`,
      attentionTarget: cue.attentionTarget,
      mustRemainStepped: true,
      source: 'LOCKED_PERFORMANCE_INTENT',
    },
    {
      poseId: `${input.shot.shotId}_${input.characterId}_POSE_02`,
      kind: 'PRIMARY_ACTION',
      frame: input.direction.primaryActionFrame,
      holdFrames: 8,
      label: `${cue.gesture}; ${cue.storyGoal}`,
      attentionTarget: cue.attentionTarget,
      mustRemainStepped: true,
      source: 'LOCKED_PERFORMANCE_INTENT',
    },
    {
      poseId: `${input.shot.shotId}_${input.characterId}_POSE_03`,
      kind: speaking ? 'DIALOGUE_ACCENT' : shotDialogue ? 'PARTNER_REACTION' : 'STORY_REACTION',
      frame: reactionFrame,
      holdFrames: 8,
      label: speaking
        ? `Land the ${dialogue.map((line) => line.lineId).join(', ')} thought without losing ${cue.gesture}`
        : shotDialogue
          ? `Listen and react to ${partner} without stealing the story focus`
          : `Clarify the ${input.shot.beat.toLowerCase()} beat through silhouette and eyeline`,
      attentionTarget: speaking
        ? cue.attentionTarget
        : shotDialogue
          ? partner
          : cue.attentionTarget,
      mustRemainStepped: true,
      source: shotDialogue ? 'LOCKED_DIALOGUE_WINDOW' : 'LOCKED_PERFORMANCE_INTENT',
    },
    {
      poseId: `${input.shot.shotId}_${input.characterId}_POSE_04`,
      kind: 'SETTLE_OR_EXIT',
      frame: settleFrame,
      holdFrames: 12,
      label:
        input.shot.shotId === 'EP001_SH10'
          ? 'Finish planted, then preserve the screen-right exit direction for the cut'
          : 'Settle into a clean, readable pose that preserves the next-shot continuity',
      attentionTarget: input.shot.shotId === 'EP001_SH10' ? 'DESTINATION' : cue.attentionTarget,
      mustRemainStepped: true,
      source: 'SHOT_CONTINUITY',
    },
  ];

  for (let index = 0; index < poseCues.length; index += 1) {
    const pose = poseCues[index]!;
    if (pose.frame < input.shot.inFrame || pose.frame >= input.shot.outFrame) {
      throw new Error(`EP001_BLOCKING_POSE_OUTSIDE_SHOT:${pose.poseId}`);
    }
    if (index > 0 && pose.frame <= poseCues[index - 1]!.frame) {
      throw new Error(`EP001_BLOCKING_POSE_ORDER_INVALID:${pose.poseId}`);
    }
  }

  const animationPlan = input.episode.animation.plans.find(
    (plan) => plan.manifest.shotId === input.shot.shotId && plan.characterId === input.characterId,
  );
  if (!animationPlan)
    throw new Error(
      `EP001_BLOCKING_ANIMATION_PLAN_MISSING:${input.shot.shotId}:${input.characterId}`,
    );

  const target = contactTarget(input.shot.shotId, input.characterId, cue.propAction);
  return {
    characterId: input.characterId,
    emotion: cue.emotion,
    storyGoal: cue.storyGoal,
    attentionTarget: cue.attentionTarget,
    locomotion: cue.locomotion,
    gesture: cue.gesture,
    intendedActions: [...cue.intendedActions],
    speaking,
    dialogueLineIds: dialogue.map((line) => line.lineId),
    poseCues,
    groundContactRequired:
      cue.locomotion !== 'stationary' || cue.intendedActions.includes('HAPPY_BOUNCE'),
    propOrEnvironmentContactTarget: target,
    exactContactSolveState: target
      ? ('BLOCKED_AWAITING_APPROVED_RIG_AND_CONTACT_CONTROLS' as const)
      : ('NOT_REQUIRED' as const),
    rigBindingState: 'BLOCKED_AWAITING_APPROVED_ARTIST_RIG' as const,
    mouthTimingState: speaking
      ? ('BLOCKED_AWAITING_EXACT_APPROVED_VOICE_TIMING' as const)
      : ('NOT_APPLICABLE' as const),
    identityAccessories: animationPlan.accessories.map((item) => item.itemId),
    semanticAnimationDependencySha256: animationPlan.manifest.shotAnimationDependencySha256,
  };
}

export function compileEp001AnimationBlockingBoard(
  episode: Ep001Package = compileEp001ProductionPackage(),
  audio: Ep001AudioCueSheet = compileEp001AudioCueSheet(episode),
) {
  if (episode.episodeId !== 'EP001') throw new Error('EP001_BLOCKING_WRONG_EPISODE');
  if (episode.format.totalFrames !== 1_800 || episode.format.fps !== 30) {
    throw new Error('EP001_BLOCKING_FORMAT_MISMATCH');
  }
  if (audio.productionPackageSha256 !== episode.packageSha256) {
    throw new Error('EP001_BLOCKING_AUDIO_PACKAGE_MISMATCH');
  }

  const shots = episode.shots.map((shot) => {
    const direction = SHOT_BLOCKING_DIRECTIONS[shot.shotId];
    assertShotDirection(shot, direction);
    const characterTracks = shot.charactersVisible.map((characterId) =>
      compileCharacterTrack({ episode, shot, characterId, direction }),
    );
    const dialogueCues = audio.dialogueCues
      .filter((cue) => cue.shotId === shot.shotId)
      .map((cue) => ({ lineId: cue.lineId, startFrame: cue.startFrame, endFrame: cue.endFrame }));
    const sfxSyncCues = audio.sfxCues
      .filter((cue) => cue.shotId === shot.shotId)
      .map((cue) => ({
        sfxEventId: cue.sfxEventId,
        semanticType: cue.semanticType,
        frame: cue.frame,
        syncTarget: cue.syncTarget,
      }));

    return {
      shotId: shot.shotId,
      inFrame: shot.inFrame,
      outFrame: shot.outFrame,
      durationFrames: shot.durationFrames,
      beat: shot.beat,
      storyPurpose: shot.storyPurpose,
      action: shot.action,
      cameraTemplateId: shot.cameraTemplateId,
      cameraMotion: shot.cameraMotion,
      focalTarget: shot.focalTarget,
      interactionRule: direction.interactionRule,
      cameraReadabilityRule: direction.cameraReadabilityRule,
      captionSafeBand: episode.format.captionSafeBand,
      characterTracks,
      dialogueCues,
      sfxSyncCues,
      continuity: [...shot.continuity],
    };
  });

  const characterTracks = shots.flatMap((shot) => shot.characterTracks);
  const poseCues = characterTracks.flatMap((track) => track.poseCues);
  const body = {
    schemaVersion: EP001_ANIMATION_BLOCKING_BOARD_SCHEMA,
    episodeId: episode.episodeId,
    workingTitle: episode.workingTitle,
    productionPackageSha256: episode.packageSha256,
    audioCueSheetSha256: audio.cueSheetSha256,
    state: 'BLOCKING_PLAN_READY_EXECUTION_BLOCKED' as const,
    format: { ...episode.format },
    shots,
    metrics: {
      shotCount: shots.length,
      characterTrackCount: characterTracks.length,
      pipTrackCount: characterTracks.filter((track) => track.characterId === 'PIP').length,
      goatTrackCount: characterTracks.filter((track) => track.characterId === 'GOAT').length,
      poseCueCount: poseCues.length,
      speakingTrackCount: characterTracks.filter((track) => track.speaking).length,
      locomotionTrackCount: characterTracks.filter((track) => track.locomotion !== 'stationary')
        .length,
      groundContactTrackCount: characterTracks.filter((track) => track.groundContactRequired)
        .length,
      propOrEnvironmentContactTrackCount: characterTracks.filter(
        (track) => track.propOrEnvironmentContactTarget !== null,
      ).length,
      dialogueSyncCueCount: shots.flatMap((shot) => shot.dialogueCues).length,
      sfxSyncCueCount: shots.flatMap((shot) => shot.sfxSyncCues).length,
    },
    executionPasses: [
      {
        passId: 'BLOCKING_PASS_01',
        label: 'Stepped story poses and camera readability',
        state: 'PLAN_READY_EXECUTION_BLOCKED',
      },
      {
        passId: 'BLOCKING_PASS_02',
        label: 'Locomotion, contacts, props, and accessory overlap',
        state: 'BLOCKED_AWAITING_APPROVED_RIGS',
      },
      {
        passId: 'BLOCKING_PASS_03',
        label: 'Dialogue face, gaze, blink, and mouth timing',
        state: 'BLOCKED_AWAITING_APPROVED_RIGS_AND_VOICE_TIMING',
      },
      {
        passId: 'BLOCKING_PASS_04',
        label: 'Spline polish and secondary motion',
        state: 'BLOCKED_AWAITING_APPROVED_BLOCKING',
      },
      {
        passId: 'BLOCKING_PASS_05',
        label: 'Playblast, deformation QA, and human visual review',
        state: 'BLOCKED_AWAITING_REAL_RIG_MEDIA',
      },
    ],
    qualityGates: QUALITY_GATES.map(([gateId, label]) => ({
      gateId,
      label,
      complete: false as const,
      autoApproval: false as const,
    })),
    handoffInstructions: [
      'Work only from hash-verified, admitted artist rigs in worker-local derivative files.',
      'Set stepped keys at the locked pose frames before adding interpolation or secondary motion.',
      'Preserve every identity accessory and the established Pip-to-Goat scale relationship.',
      'Bind exact approved voice receipts before authoring final beak, mouth, blink, or dialogue timing.',
      'Keep story props, faces, silhouettes, and the bottom 18 percent caption-safe band readable.',
      'Run contact, deformation, continuity, playblast, and human visual gates before any final render.',
    ],
    authority: {
      rigAdmissionGranted: false as const,
      blockingExecutionAllowed: false as const,
      animationBakeAllowed: false as const,
      exactVoiceTimingBound: false as const,
      paidComputeAllowed: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      semanticBlockingOnly: true as const,
      transformCurvesAuthored: false as const,
      boneKeyframesAuthored: false as const,
      rigBytesIncluded: false as const,
      audioBytesIncluded: false as const,
      networkCalls: 0 as const,
      paidRequests: 0 as const,
      storageMutations: 0 as const,
      productionMutations: 0 as const,
    },
  };

  return { ...body, blockingBoardSha256: sha256Canonical(body) };
}

export type Ep001AnimationBlockingBoard = ReturnType<typeof compileEp001AnimationBlockingBoard>;

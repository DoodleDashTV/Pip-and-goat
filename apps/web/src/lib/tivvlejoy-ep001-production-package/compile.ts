import {
  animationSafetyReport,
  buildAnimationClipPlan,
  buildPerformanceIntent,
  buildShotAnimationManifest,
  planCharacterShot,
  resolveCharacterAction,
} from '@/lib/tivvlejoy-character-animation';
import { compileEpisodeProductionPacket } from '@/lib/tivvlejoy-production-studio/packet';
import {
  buildEditorialTimeline,
  evaluateCaptionQc,
  planCaptionCue,
  sha256Canonical,
} from '@/lib/tivvlejoy-nightshift-production';
import {
  EP001_DIALOGUE_LINES,
  EP001_SCENERY_INTENTS,
  EP001_SHOT_BLUEPRINTS,
  EP001_STORY,
} from './fixture';
import { evaluateEp001Readiness } from './readiness';
import {
  EP001_EPISODE_ID,
  EP001_FPS,
  EP001_PRODUCTION_PACKAGE_SCHEMA,
  EP001_TOTAL_FRAMES,
  EP001_WORKING_TITLE,
  type Ep001CharacterId,
  type Ep001PerformanceCue,
  type Ep001ReadinessInput,
  type Ep001ShotBlueprint,
} from './types';

function assertBlueprintContract(shots: readonly Ep001ShotBlueprint[]): void {
  if (!shots.length) throw new Error('EP001_SHOTS_REQUIRED');
  const ids = new Set<string>();
  let expectedIn = 0;
  for (const shot of shots) {
    if (ids.has(shot.shotId)) throw new Error(`EP001_DUPLICATE_SHOT:${shot.shotId}`);
    ids.add(shot.shotId);
    if (shot.inFrame !== expectedIn)
      throw new Error(`EP001_TIMELINE_GAP_OR_OVERLAP:${shot.shotId}`);
    if (shot.durationFrames !== shot.outFrame - shot.inFrame || shot.durationFrames <= 0) {
      throw new Error(`EP001_INVALID_SHOT_DURATION:${shot.shotId}`);
    }
    expectedIn = shot.outFrame;
  }
  if (expectedIn !== EP001_TOTAL_FRAMES)
    throw new Error(`EP001_DURATION_MUST_EQUAL_${EP001_TOTAL_FRAMES}_FRAMES`);

  const dialogueIds = new Set(EP001_DIALOGUE_LINES.map((line) => line.lineId));
  for (const shot of shots) {
    for (const lineId of shot.dialogueLineIds) {
      if (!dialogueIds.has(lineId)) throw new Error(`EP001_UNKNOWN_DIALOGUE_LINE:${lineId}`);
    }
  }
  for (const line of EP001_DIALOGUE_LINES) {
    const shot = shots.find((candidate) => candidate.shotId === line.shotId);
    if (!shot) throw new Error(`EP001_DIALOGUE_SHOT_MISSING:${line.lineId}`);
    if (
      line.startFrame < shot.inFrame ||
      line.endFrame > shot.outFrame ||
      line.endFrame <= line.startFrame
    ) {
      throw new Error(`EP001_DIALOGUE_OUTSIDE_SHOT:${line.lineId}`);
    }
    if (!shot.dialogueLineIds.includes(line.lineId))
      throw new Error(`EP001_DIALOGUE_NOT_BOUND:${line.lineId}`);
  }
}

function compileCharacterPlan(input: {
  shot: Ep001ShotBlueprint;
  characterId: Ep001CharacterId;
  cue: Ep001PerformanceCue;
}) {
  const lines = EP001_DIALOGUE_LINES.filter(
    (line) => line.shotId === input.shot.shotId && line.speaker === input.characterId,
  );
  const speaking = lines.length > 0;
  const durationMs = Math.round((input.shot.durationFrames / EP001_FPS) * 1_000);
  const base = planCharacterShot({
    shotId: input.shot.shotId,
    characterId: input.characterId,
    speaking,
    locomotion: input.cue.locomotion,
    prop: input.cue.propAction,
    partner: input.characterId === 'PIP' ? 'GOAT' : 'PIP',
    durationMs,
    storyCriticalProp:
      input.cue.attentionTarget === 'STORY_MAP' || input.cue.attentionTarget === 'MAP_FRAGMENT',
  });
  const intent = buildPerformanceIntent({
    shotId: input.shot.shotId,
    characterId: input.characterId,
    emotion: input.cue.emotion,
    emotionIntensity: speaking ? 0.72 : 0.5,
    storyGoal: input.cue.storyGoal,
    attentionTarget: input.cue.attentionTarget,
    movementIntent: input.cue.locomotion,
    dialogueIntent: speaking
      ? `speak:${lines.map((line) => line.lineId).join(',')}`
      : 'listen_or_act_silently',
    gestureIntent: input.cue.gesture,
    poseEnergy: input.cue.emotion === 'happy' || input.cue.emotion === 'playful' ? 0.75 : 0.58,
    urgency:
      input.cue.locomotion === 'run' ? 0.82 : input.cue.emotion === 'determined' ? 0.62 : 0.35,
    confidence: input.cue.emotion === 'surprised' ? 0.58 : 0.74,
    reactionType: speaking ? 'line_delivery' : 'partner_or_prop_reaction',
    entranceIntent:
      input.cue.locomotion === 'walk' || input.cue.locomotion === 'run'
        ? 'enter_in_continuity'
        : 'already_in_frame',
    exitIntent: input.shot.shotId === 'EP001_SH10' ? 'exit_screen_right' : 'hold_for_cut',
    propIntent: input.cue.propAction ?? 'none',
    relationshipIntent: `support_${input.characterId === 'PIP' ? 'GOAT' : 'PIP'}`,
  });
  const clip = buildAnimationClipPlan({
    shotId: input.shot.shotId,
    characterId: input.characterId,
    actions: input.cue.intendedActions.map((actionId) =>
      resolveCharacterAction({ characterId: input.characterId, actionId, admitted: false }),
    ),
  });
  const manifest = buildShotAnimationManifest({
    shotId: base.manifest.shotId,
    characterId: base.manifest.characterId,
    rig: base.manifest.rig,
    performanceIntentSha256: intent.intentSha256,
    dialogueTimingSha256: base.timing.timingSha256,
    visemePlanSha256: base.viseme.visemePlanSha256,
    blinkPlanSha256: base.blink.blinkPlanSha256,
    gazePlanSha256: base.gaze.gazePlanSha256,
    bodyActingPlanSha256: base.body.bodyActingPlanSha256,
    locomotionPlanSha256: base.locomotion.locomotionPlanSha256,
    contactPlanSha256: base.contact.contactPlanSha256,
    propInteractionSha256: base.props.propInteractionSha256,
    continuityDependencySha256: base.manifest.continuityDependencySha256,
  });

  return {
    characterId: input.characterId,
    semanticPlanOnly: true as const,
    executable: false as const,
    admitted: base.admitted,
    rigId: base.manifest.rig.rigId,
    rigVersion: base.manifest.rig.rigVersion,
    intendedActions: input.cue.intendedActions,
    intent,
    timing: base.timing,
    viseme: base.viseme,
    gaze: base.gaze,
    locomotion: base.locomotion,
    contact: base.contact,
    accessories: base.accessories,
    clip,
    manifest,
  };
}

export function compileEp001ProductionPackage(readinessInput: Ep001ReadinessInput = {}) {
  const shots = EP001_SHOT_BLUEPRINTS.map((shot) => ({
    ...shot,
    charactersVisible: [...shot.charactersVisible],
    dialogueLineIds: [...shot.dialogueLineIds],
    sfx: [...shot.sfx],
    continuity: [...shot.continuity],
  }));
  assertBlueprintContract(shots);

  const captions = EP001_DIALOGUE_LINES.map((line) =>
    planCaptionCue({
      captionId: `CAP_${line.lineId}`,
      speaker: line.speaker,
      text: line.text,
      startFrame: line.startFrame,
      endFrame: line.endFrame,
    }),
  );
  const captionQc = evaluateCaptionQc({
    captions,
    shotRanges: shots.map((shot) => ({
      shotId: shot.shotId,
      inFrame: shot.inFrame,
      outFrame: shot.outFrame,
    })),
  });
  if (!captionQc.passed)
    throw new Error(
      `EP001_CAPTION_QC_FAILED:${captionQc.findings.map((item) => item.code).join(',')}`,
    );

  const editorial = buildEditorialTimeline({
    episodeId: EP001_EPISODE_ID,
    fps: EP001_FPS,
    shots: shots.map((shot) => ({
      shotId: shot.shotId,
      durationFrames: shot.durationFrames,
      intent: shot.shotIntent,
      locationId: shot.locationId,
      dialogueRef: shot.dialogueLineIds[0] ?? null,
      sfxCount: shot.sfx.length,
    })),
  });
  if (editorial.totalFrames !== EP001_TOTAL_FRAMES)
    throw new Error('EP001_EDITORIAL_DURATION_MISMATCH');

  const animationPlans = shots.flatMap((shot) =>
    shot.charactersVisible.map((characterId) => {
      const cue = shot.performance[characterId];
      if (!cue) throw new Error(`EP001_MISSING_PERFORMANCE_CUE:${shot.shotId}:${characterId}`);
      return compileCharacterPlan({ shot, characterId, cue });
    }),
  );
  const sceneryBindings = EP001_SCENERY_INTENTS.map((intent) => ({
    ...intent,
    requiredRoles: [...intent.requiredRoles],
    sceneryIntentSha256: sha256Canonical(intent),
  }));
  const scriptSha256 = sha256Canonical({ story: EP001_STORY, dialogue: EP001_DIALOGUE_LINES });
  const continuitySha256 = sha256Canonical({
    episodeId: EP001_EPISODE_ID,
    facts: shots.map((shot) => ({ shotId: shot.shotId, continuity: shot.continuity })),
  });
  const productionPacket = compileEpisodeProductionPacket({
    episodeId: EP001_EPISODE_ID,
    episodeVersion: 'draft-v1',
    scriptSha256,
    voiceReceipts: [],
    shots: shots.map((shot) => ({
      shotId: shot.shotId,
      locationId: shot.locationId,
      cameraTemplateId: shot.cameraTemplateId,
      lightingPresetId: shot.lightingPresetId,
      assemblyDependencySha256: sha256Canonical(shot),
      environmentDependencySha256: sceneryBindings.find(
        (item) => item.locationId === shot.locationId,
      )?.sceneryIntentSha256,
      dialogueRefs: shot.dialogueLineIds,
      charactersVisible: shot.charactersVisible,
    })),
    continuityDependencySha256: continuitySha256,
    characterRigsResolved: false,
    pipRigVersion: 'UNRESOLVED_APPROVED_ARTIST_RIG',
    goatRigVersion: 'UNRESOLVED_APPROVED_ARTIST_RIG',
  });
  const readiness = evaluateEp001Readiness(readinessInput);
  const safety = {
    ...animationSafetyReport(),
    planningCostUsd: 0 as const,
    externalNetworkCalls: 0 as const,
    voiceProviderContacted: false as const,
    finalRenderStarted: false as const,
    sourceStorageMutations: 0 as const,
    productionStorageMutations: 0 as const,
    theatricalGateOpened: false as const,
  };
  const body = {
    schemaVersion: EP001_PRODUCTION_PACKAGE_SCHEMA,
    episodeId: EP001_EPISODE_ID,
    episodeNumber: 1 as const,
    workingTitle: EP001_WORKING_TITLE,
    classification: 'DRAFT_NONCANONICAL' as const,
    pipelineClass: 'ZERO_COST_PREPRODUCTION_ONLY' as const,
    story: EP001_STORY,
    format: {
      width: 1_080 as const,
      height: 1_920 as const,
      aspectRatio: '9:16' as const,
      fps: EP001_FPS,
      durationSeconds: 60 as const,
      totalFrames: EP001_TOTAL_FRAMES,
      captionSafeBand: 'BOTTOM_18_PERCENT' as const,
    },
    scriptSha256,
    continuitySha256,
    sceneryBindings,
    shots,
    dialogue: EP001_DIALOGUE_LINES.map((line) => ({ ...line })),
    captions,
    captionQc,
    editorial,
    animation: {
      bindingState: 'SEMANTIC_INTENT_ONLY_WAITING_APPROVED_RIGS' as const,
      transformsAuthored: false as const,
      boneCurvesAuthored: false as const,
      plans: animationPlans,
    },
    audio: {
      dialogueTextLockedForReview: true as const,
      exactVoiceReceiptsBound: false as const,
      voiceAudioIncluded: false as const,
      sfxAudioIncluded: false as const,
      musicAudioIncluded: false as const,
      semanticSfx: shots.flatMap((shot) => shot.sfx.map((type) => ({ shotId: shot.shotId, type }))),
      ambience: shots.map((shot) => ({ shotId: shot.shotId, layer: shot.ambience })),
      music: shots.map((shot) => ({ shotId: shot.shotId, role: shot.musicRole })),
    },
    productionPacket,
    readiness,
    safety,
  };
  return { ...body, packageSha256: sha256Canonical(body) };
}

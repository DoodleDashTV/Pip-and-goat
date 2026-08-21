import { sha256Canonical } from './hash';
import {
  AGE_BANDS,
  AUDIENCE_ENGAGEMENT_REPORT_SCHEMA,
  CANONICAL_GOAT_TRAITS,
  CANONICAL_PIP_TRAITS,
  CAUSAL_CHAIN_STEPS,
  KIDS_ENGAGEMENT_SCHEMA,
  NEGATIVE_HOOK_EMOTIONS,
  POSITIVE_HOOK_EMOTIONS,
  STUDIO_ENGAGEMENT_PIPELINE,
  ZERO_SIDE_EFFECTS,
  type AgeBandLayer,
  type AudienceEngagementBlueprint,
  type AudienceEngagementCheck,
  type AudienceEngagementCheckState,
  type AudienceEngagementReport,
  type EngagementReadinessState,
  type HumanApprovalRecord,
} from './types';

function present(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function check(
  code: AudienceEngagementCheck['code'],
  label: string,
  state: AudienceEngagementCheckState,
  detail: string,
  missingProcessingBeats?: readonly string[],
): AudienceEngagementCheck {
  return missingProcessingBeats ? { code, label, state, detail, missingProcessingBeats } : { code, label, state, detail };
}

function rollup(checks: readonly AudienceEngagementCheck[]): EngagementReadinessState {
  if (checks.some((item) => item.state === 'BLOCKED')) return 'BLOCKED';
  if (checks.some((item) => item.state === 'NEEDS_REVISION')) return 'NEEDS_REVISION';
  if (checks.some((item) => item.state === 'NOT_EVALUATED')) return 'NOT_EVALUATED';
  if (checks.every((item) => item.state === 'PASS')) return 'READY_FOR_HUMAN_REVIEW';
  return 'NOT_EVALUATED';
}

function evaluateHook(blueprint: AudienceEngagementBlueprint): AudienceEngagementCheck {
  const hook = blueprint.positiveArousalHook;
  const emotion = hook.intendedPositiveEmotion.toLowerCase();
  const negative =
    hook.usesNegativeEmotionManipulation ||
    (NEGATIVE_HOOK_EMOTIONS as readonly string[]).includes(emotion);
  if (negative) {
    return check(
      'POSITIVE_AROUSAL_HOOK',
      'Positive arousal hook',
      'BLOCKED',
      'Negative-emotion manipulation is blocked. Hooks must use delight, awe, laughter, curiosity, or excitement.',
    );
  }
  if (!present(hook.firstMeaningfulVisualEvent) || !(POSITIVE_HOOK_EMOTIONS as readonly string[]).includes(emotion)) {
    return check(
      'POSITIVE_AROUSAL_HOOK',
      'Positive arousal hook',
      'BLOCKED',
      'The first meaningful visual event must be concrete and use a positive intended emotion.',
    );
  }
  return check('POSITIVE_AROUSAL_HOOK', 'Positive arousal hook', 'PASS', 'Hook is concrete and positive.');
}

function evaluateGoal(blueprint: AudienceEngagementBlueprint): AudienceEngagementCheck {
  const goal = blueprint.visibleGoal;
  const unclear =
    !present(goal.statement) ||
    !goal.immediatelyUnderstandable ||
    !present(goal.goalObjectOrObjective) ||
    !goal.visuallyTrackable ||
    /have fun|hang out|just play/i.test(goal.statement);
  if (unclear) {
    return check(
      'VISIBLE_GOAL',
      'Visible goal',
      'BLOCKED',
      'An unclear or missing goal blocks Engagement Readiness. One visually trackable objective is required.',
    );
  }
  return check('VISIBLE_GOAL', 'Visible goal', 'PASS', 'The central goal is immediately understandable and trackable.');
}

function evaluateCausalChain(blueprint: AudienceEngagementBlueprint): AudienceEngagementCheck {
  const missing = CAUSAL_CHAIN_STEPS.filter((step) => !present(blueprint.causalStoryChain[step]));
  if (missing.length > 0) {
    return check(
      'CAUSAL_STORY_CHAIN',
      'Causal story chain',
      'BLOCKED',
      `Incomplete causal chain blocks Engagement Readiness. Missing: ${missing.join(', ')}.`,
    );
  }
  return check('CAUSAL_STORY_CHAIN', 'Causal story chain', 'PASS', 'Discovery through meaningful payoff is complete.');
}

function evaluateCharacters(blueprint: AudienceEngagementBlueprint): AudienceEngagementCheck {
  const identity = blueprint.characterConsistency;
  const pipMissing = CANONICAL_PIP_TRAITS.filter(
    (trait) => !identity.pipTraits.map((item) => item.toLowerCase()).includes(trait),
  );
  const goatMissing = CANONICAL_GOAT_TRAITS.filter(
    (trait) => !identity.goatTraits.map((item) => item.toLowerCase()).includes(trait),
  );
  const forbiddenPip = identity.pipTraits.some((trait) => /mean|cruel|cowardly|unkind/i.test(trait));
  const sameSoloRole =
    identity.problemRoles.discovers === identity.problemRoles.complicates &&
    identity.problemRoles.complicates === identity.problemRoles.solves &&
    identity.problemRoles.discovers !== 'PIP_AND_GOAT';
  if (
    pipMissing.length > 0 ||
    goatMissing.length > 0 ||
    forbiddenPip ||
    identity.goatConsistentlyStupid ||
    identity.goatOnlyVictim ||
    !identity.equalEmotionalImportance ||
    sameSoloRole
  ) {
    return check(
      'CHARACTER_CONSISTENCY',
      'Character consistency',
      'BLOCKED',
      'Pip and Goat must stay canonical, share emotional importance, and alternate discover / complicate / solve roles.',
    );
  }
  return check('CHARACTER_CONSISTENCY', 'Character consistency', 'PASS', 'Pip and Goat remain canonical and equally important.');
}

function evaluateParticipation(blueprint: AudienceEngagementBlueprint): AudienceEngagementCheck {
  const cue = blueprint.participationCue;
  if (cue.requiresComments || cue.collectsChildInformation) {
    return check(
      'PARTICIPATION_CUE',
      'Participation cue',
      'BLOCKED',
      'Participation may never require comments or collect information from children.',
    );
  }
  if (cue.present && !cue.processingPauseBeforeReveal) {
    return check(
      'PARTICIPATION_CUE',
      'Participation cue',
      'NEEDS_REVISION',
      'A participation cue needs a reasonable processing pause before the reveal.',
    );
  }
  return check('PARTICIPATION_CUE', 'Participation cue', 'PASS', 'Participation is optional and does not collect child information.');
}

function evaluateHumor(blueprint: AudienceEngagementBlueprint): AudienceEngagementCheck {
  const humor = blueprint.safeHumor;
  if (
    humor.visibleInjury ||
    humor.humiliation ||
    humor.cruelty ||
    humor.painBased ||
    humor.frighteningPerilDisguisedAsHumor
  ) {
    return check(
      'SAFE_HUMOR',
      'Safe humor',
      'BLOCKED',
      'Injury, humiliation, cruelty, pain-based comedy, or frightening peril disguised as humor is blocked.',
    );
  }
  if (humor.kind !== 'none' && !humor.charactersCommunicateSafety) {
    return check(
      'SAFE_HUMOR',
      'Safe humor',
      'NEEDS_REVISION',
      'Characters must communicate safety through expression and body language.',
    );
  }
  return check('SAFE_HUMOR', 'Safe humor', 'PASS', 'Humor stays visual, wordplay-based, or harmless and parent-safe.');
}

function evaluateFocalMotion(blueprint: AudienceEngagementBlueprint): AudienceEngagementCheck {
  const beats = blueprint.focalMotionPlan.beats;
  if (beats.length === 0 || beats.some((beat) => !present(beat.primaryFocalElement))) {
    return check(
      'FOCAL_MOTION',
      'Focal motion plan',
      'NEEDS_REVISION',
      'Every major beat needs a primary focal element so motion can guide attention.',
    );
  }
  if (beats.some((beat) => beat.unrelatedMovingDecorationsCompete || !beat.motionGuidesAttention)) {
    return check(
      'FOCAL_MOTION',
      'Focal motion plan',
      'NEEDS_REVISION',
      'Unrelated moving decorations compete with the story. Guide motion toward the active character, clue, or goal.',
    );
  }
  return check('FOCAL_MOTION', 'Focal motion plan', 'PASS', 'Motion guides attention toward the active story element.');
}

function evaluateAudio(blueprint: AudienceEngagementBlueprint): AudienceEngagementCheck {
  const audio = blueprint.relevantAudioPlan;
  if (audio.randomNoise || audio.excessiveSoundEffects || audio.unsupportedSoundCues || !audio.dialogueIntelligible) {
    return check(
      'RELEVANT_AUDIO',
      'Relevant audio plan',
      'NEEDS_REVISION',
      'Random noise, excessive sound effects, or unsupported cues reduce dialogue intelligibility and story support.',
    );
  }
  if (!audio.dialogueSupportsActiveBeat || !audio.musicSupportsActiveBeat || !audio.sfxSupportActiveBeat) {
    return check(
      'RELEVANT_AUDIO',
      'Relevant audio plan',
      'NEEDS_REVISION',
      'Dialogue, music, and sound effects must support the active story beat.',
    );
  }
  return check('RELEVANT_AUDIO', 'Relevant audio plan', 'PASS', 'Audio supports the beat and keeps dialogue intelligible.');
}

function evaluatePacing(blueprint: AudienceEngagementBlueprint): AudienceEngagementCheck {
  const pacing = blueprint.pacingAndProcessing;
  const missing: string[] = [];
  if (!pacing.processingBeatsAfterDiscoveries) missing.push('discoveries');
  if (!pacing.processingBeatsAfterChoices) missing.push('choices');
  if (!pacing.processingBeatsAfterReactions) missing.push('reactions');
  if (pacing.treatsMaximumCutFrequencyAsQuality || !pacing.energeticWithoutNonstopCutting || missing.length > 0) {
    return check(
      'PACING_AND_PROCESSING',
      'Pacing and processing',
      'NEEDS_REVISION',
      missing.length > 0
        ? `Missing processing beats after ${missing.join(', ')}. Average shot duration ${pacing.averageShotDurationSec}s.`
        : `Pacing needs comprehension time. Average shot duration ${pacing.averageShotDurationSec}s.`,
      missing,
    );
  }
  return check(
    'PACING_AND_PROCESSING',
    'Pacing and processing',
    'PASS',
    `Energetic pacing still includes comprehension time. Average shot duration ${pacing.averageShotDurationSec}s.`,
    missing,
  );
}

function evaluatePayoff(blueprint: AudienceEngagementBlueprint): AudienceEngagementCheck {
  const payoff = blueprint.prosocialPayoff;
  if (!payoff.shownThroughAction || payoff.themes.length === 0 || payoff.lectureOrForcedMoral) {
    return check(
      'PROSOCIAL_PAYOFF',
      'Prosocial payoff',
      'BLOCKED',
      'The payoff must show cooperation, courage, kindness, repair, friendship, or problem-solving through action, not a lecture.',
    );
  }
  return check('PROSOCIAL_PAYOFF', 'Prosocial payoff', 'PASS', 'Meaning is shown through character action.');
}

function evaluateReplay(blueprint: AudienceEngagementBlueprint): AudienceEngagementCheck {
  const replay = blueprint.replayDesign;
  if (replay.deceptiveEndlessLoop || !replay.satisfyingEnding) {
    return check(
      'REPLAY_DESIGN',
      'Replay design',
      'BLOCKED',
      'Deceptive or endless loops are rejected. The story must still have a satisfying ending.',
    );
  }
  return check(
    'REPLAY_DESIGN',
    'Replay design',
    'PASS',
    replay.naturalReplayCue
      ? 'A natural replay cue is accepted and the ending remains satisfying.'
      : 'Replay is optional. The ending remains satisfying and non-deceptive.',
  );
}

function evaluateReuse(blueprint: AudienceEngagementBlueprint): AudienceEngagementCheck {
  const reuse = blueprint.productionReusePlan;
  const fields = [
    reuse.sceneryReuse,
    reuse.lightingReuse,
    reuse.cameraReuse,
    reuse.animationReuse,
    reuse.propReuse,
    reuse.audioReuse,
  ];
  if (
    fields.some((field) => !present(field)) ||
    reuse.estimatedNewWorkShare < 0 ||
    reuse.estimatedReusedWorkShare < 0 ||
    !reuse.preservesMovieQualityStandard ||
    !reuse.costControlsPresent
  ) {
    return check(
      'PRODUCTION_REUSE',
      'Production reuse plan',
      'NEEDS_REVISION',
      'Cost and reuse information must be present while preserving TivvleJoy’s movie-quality visual standard.',
    );
  }
  return check('PRODUCTION_REUSE', 'Production reuse plan', 'PASS', 'Reuse and new-work estimates are present.');
}

function layerFor(layers: readonly AgeBandLayer[], ageBand: AgeBandLayer['ageBand']): AgeBandLayer | undefined {
  return layers.find((layer) => layer.ageBand === ageBand);
}

function evaluateAgeBands(blueprint: AudienceEngagementBlueprint): AudienceEngagementCheck {
  const younger = layerFor(blueprint.ageBandLayers, 'AGES_5_7');
  const older = layerFor(blueprint.ageBandLayers, 'AGES_8_10');
  if (!younger || !older || AGE_BANDS.some((band) => !layerFor(blueprint.ageBandLayers, band))) {
    return check(
      'AGE_BAND_LAYERING',
      'Age-band layering',
      'BLOCKED',
      'Both age 5–7 and age 8–10 layers are required.',
    );
  }
  if (younger.storyCriticalWordplay || older.olderWordplayCarriesYoungerPlotFact || older.olderLayerConfusesYoungerViewers) {
    return check(
      'AGE_BAND_LAYERING',
      'Age-band layering',
      'BLOCKED',
      'Older-audience wordplay cannot carry a required younger-audience plot fact, and the older layer must not confuse ages 5–7.',
    );
  }
  if (
    !younger.clearVisualObjective ||
    !younger.literalCauseAndEffect ||
    !younger.strongReadableExpressions ||
    !younger.shortSentences
  ) {
    return check(
      'AGE_BAND_LAYERING',
      'Age-band layering',
      'NEEDS_REVISION',
      'Ages 5–7 need a clear visual objective, literal cause and effect, short sentences, and readable expressions.',
    );
  }
  return check(
    'AGE_BAND_LAYERING',
    'Age-band layering',
    'PASS',
    'The age 8–10 layer enriches the story without hiding the plot from ages 5–7.',
  );
}

function evaluateNineSixteen(blueprint: AudienceEngagementBlueprint): AudienceEngagementCheck {
  const frame = blueprint.nineSixteenReadability;
  if (frame.aspectRatio !== '9:16' || !frame.characterReadable || !frame.focalReadable) {
    return check(
      'NINE_SIXTEEN_READABILITY',
      '9:16 readability',
      'NEEDS_REVISION',
      '9:16 character and focal readability checks must pass before human review.',
    );
  }
  return check('NINE_SIXTEEN_READABILITY', '9:16 readability', 'PASS', 'Character and focal elements stay readable in 9:16.');
}

function hashReport(body: Omit<AudienceEngagementReport, 'reportSha256'>): string {
  return sha256Canonical(body);
}

export function evaluateAudienceEngagement(blueprint: AudienceEngagementBlueprint): AudienceEngagementReport {
  const checks = [
    evaluateHook(blueprint),
    evaluateGoal(blueprint),
    evaluateCausalChain(blueprint),
    evaluateCharacters(blueprint),
    evaluateParticipation(blueprint),
    evaluateHumor(blueprint),
    evaluateFocalMotion(blueprint),
    evaluateAudio(blueprint),
    evaluatePacing(blueprint),
    evaluatePayoff(blueprint),
    evaluateReplay(blueprint),
    evaluateReuse(blueprint),
    evaluateAgeBands(blueprint),
    evaluateNineSixteen(blueprint),
  ];
  const missingProcessingBeats = checks.flatMap((item) => item.missingProcessingBeats ?? []);
  const body: Omit<AudienceEngagementReport, 'reportSha256'> = {
    schemaVersion: AUDIENCE_ENGAGEMENT_REPORT_SCHEMA,
    framework: KIDS_ENGAGEMENT_SCHEMA,
    episodeId: blueprint.episodeId,
    title: blueprint.title,
    readiness: rollup(checks),
    checks,
    missingProcessingBeats,
    viralityGuaranteed: false,
    viralProbabilityCalculated: false,
    numericalEngagementScore: null,
    humanApproval: null,
    humanApprovalSetAutomatically: false,
    pipeline: STUDIO_ENGAGEMENT_PIPELINE,
    synthetic: true,
    ...ZERO_SIDE_EFFECTS,
  };
  return { ...body, reportSha256: hashReport(body) };
}

export function recordHumanEngagementApproval(
  report: AudienceEngagementReport,
  input: { actor: string; decision: 'APPROVE' | 'REJECT'; notes?: string | null },
): AudienceEngagementReport {
  if (input.actor !== 'HUMAN') {
    return report;
  }
  if (input.decision === 'APPROVE' && report.readiness !== 'READY_FOR_HUMAN_REVIEW') {
    return report;
  }
  const approval: HumanApprovalRecord = {
    actor: 'HUMAN',
    decision: input.decision,
    notes: input.notes ?? null,
    automatic: false,
  };
  const nextReadiness: EngagementReadinessState =
    input.decision === 'APPROVE' ? 'HUMAN_APPROVED' : report.readiness === 'HUMAN_APPROVED' ? 'READY_FOR_HUMAN_REVIEW' : report.readiness;
  const { reportSha256: _ignored, ...rest } = report;
  const body: Omit<AudienceEngagementReport, 'reportSha256'> = {
    ...rest,
    readiness: nextReadiness,
    humanApproval: approval,
    humanApprovalSetAutomatically: false,
  };
  return { ...body, reportSha256: hashReport(body) };
}

export function createKidsEngagementSideEffectTracker(): {
  providerContacted: number;
  sceneryAccessed: number;
  gpuLaunched: number;
  paidCompute: number;
  voiceGenerated: number;
  commercialBytesDownloaded: number;
  externalAnalyticsContacted: number;
  productionMutated: number;
  storageWritten: number;
} {
  return {
    providerContacted: 0,
    sceneryAccessed: 0,
    gpuLaunched: 0,
    paidCompute: 0,
    voiceGenerated: 0,
    commercialBytesDownloaded: 0,
    externalAnalyticsContacted: 0,
    productionMutated: 0,
    storageWritten: 0,
  };
}

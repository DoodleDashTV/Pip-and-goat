export const KIDS_ENGAGEMENT_SCHEMA = 'TIVVLEJOY_RESEARCH_INFORMED_KIDS_ENGAGEMENT_V1' as const;
export const AUDIENCE_ENGAGEMENT_BLUEPRINT_SCHEMA = 'TIVVLEJOY_AUDIENCE_ENGAGEMENT_BLUEPRINT_V1' as const;
export const AUDIENCE_ENGAGEMENT_REPORT_SCHEMA = 'TIVVLEJOY_AUDIENCE_ENGAGEMENT_REPORT_V1' as const;
export const PILOT_EXPERIMENT_SCHEMA = 'TIVVLEJOY_PILOT_EXPERIMENT_V1' as const;
export const PILOT_ANALYTICS_SNAPSHOT_SCHEMA = 'TIVVLEJOY_PILOT_ANALYTICS_SNAPSHOT_V1' as const;
export const PILOT_COMPARISON_REPORT_SCHEMA = 'TIVVLEJOY_PILOT_COMPARISON_REPORT_V1' as const;

export const ENGAGEMENT_READINESS_STATES = [
  'NOT_EVALUATED',
  'BLOCKED',
  'NEEDS_REVISION',
  'READY_FOR_HUMAN_REVIEW',
  'HUMAN_APPROVED',
] as const;
export type EngagementReadinessState = (typeof ENGAGEMENT_READINESS_STATES)[number];

export const CHECK_STATES = ['PASS', 'BLOCKED', 'NEEDS_REVISION', 'NOT_EVALUATED'] as const;
export type AudienceEngagementCheckState = (typeof CHECK_STATES)[number];

export const POSITIVE_HOOK_EMOTIONS = ['delight', 'awe', 'laughter', 'curiosity', 'excitement'] as const;
export type PositiveHookEmotion = (typeof POSITIVE_HOOK_EMOTIONS)[number];

export const NEGATIVE_HOOK_EMOTIONS = ['fear', 'anger', 'anxiety'] as const;
export type NegativeHookEmotion = (typeof NEGATIVE_HOOK_EMOTIONS)[number];

export const AGE_BANDS = ['AGES_5_7', 'AGES_8_10'] as const;
export type AgeBandId = (typeof AGE_BANDS)[number];

export const CAUSAL_CHAIN_STEPS = [
  'discovery',
  'triggerOrMistake',
  'consequence',
  'firstAttempt',
  'secondAttemptOrEscalation',
  'cooperativeSolution',
  'meaningfulPayoff',
] as const;
export type CausalChainStep = (typeof CAUSAL_CHAIN_STEPS)[number];

export const PROBLEM_ROLES = ['discovers', 'complicates', 'solves'] as const;
export type ProblemRole = (typeof PROBLEM_ROLES)[number];

export const CHARACTER_IDS = ['PIP', 'GOAT', 'PIP_AND_GOAT'] as const;
export type EngagementCharacterId = (typeof CHARACTER_IDS)[number];

export const CANONICAL_PIP_TRAITS = ['curious', 'cheerful', 'kind', 'courageous', 'energetic'] as const;
export const CANONICAL_GOAT_TRAITS = ['warm', 'playful', 'loyal', 'adventurous'] as const;
export const OPTIONAL_GOAT_TRAITS = ['occasionally mischievous'] as const;

export const CHECK_CODES = [
  'POSITIVE_AROUSAL_HOOK',
  'VISIBLE_GOAL',
  'CAUSAL_STORY_CHAIN',
  'CHARACTER_CONSISTENCY',
  'PARTICIPATION_CUE',
  'SAFE_HUMOR',
  'FOCAL_MOTION',
  'RELEVANT_AUDIO',
  'PACING_AND_PROCESSING',
  'PROSOCIAL_PAYOFF',
  'REPLAY_DESIGN',
  'PRODUCTION_REUSE',
  'AGE_BAND_LAYERING',
  'NINE_SIXTEEN_READABILITY',
] as const;
export type AudienceEngagementCheckCode = (typeof CHECK_CODES)[number];

export const OBSERVATION_WINDOWS = ['24h', '7d', '28d'] as const;
export type ObservationWindow = (typeof OBSERVATION_WINDOWS)[number];

export const COMPARISON_DIMENSIONS = [
  'appeal',
  'engagement',
  'completion',
  'replaySignals',
  'satisfaction',
  'cost',
  'productionTime',
  'characterFit',
  'parentSafeQuality',
] as const;
export type ComparisonDimension = (typeof COMPARISON_DIMENSIONS)[number];

export const STUDIO_ENGAGEMENT_PIPELINE = [
  'EPISODE_CONCEPT',
  'AUDIENCE_ENGAGEMENT_BLUEPRINT',
  'SCRIPT_STORY_PLANNING',
  'SHOT_CAMERA_PLANNING',
  'ANIMATION_AUDIO_SCENERY_PLANNING',
  'ENGAGEMENT_READINESS_REPORT',
  'HUMAN_APPROVAL',
  'EXISTING_RENDER_READINESS',
  'EXISTING_QC_RELEASE',
  'OPTIONAL_MANUAL_AGGREGATE_ANALYTICS',
  'HUMAN_PILOT_COMPARISON',
  'AUTHORIZED_FUTURE_BATCH',
] as const;
export type StudioEngagementPipelineStage = (typeof STUDIO_ENGAGEMENT_PIPELINE)[number];

export const FORBIDDEN_VIRALITY_LANGUAGE = [
  'Guaranteed Viral',
  'Viral Score',
  'Guaranteed Views',
  'Algorithm Hack',
  'Scientifically Proven to Go Viral',
  'Addictive Design',
  'Manipulation Score',
] as const;

export const FORBIDDEN_CHILD_OR_VIEWER_KEYS = [
  'comments',
  'commentText',
  'commentBodies',
  'username',
  'usernames',
  'displayName',
  'childName',
  'childId',
  'childIds',
  'viewerId',
  'viewerIds',
  'email',
  'emails',
  'ip',
  'ipAddress',
  'deviceId',
  'userId',
  'userIds',
  'children',
  'commenters',
  'scrapedViewers',
] as const;
export type ForbiddenChildOrViewerKey = (typeof FORBIDDEN_CHILD_OR_VIEWER_KEYS)[number];

export const ZERO_SIDE_EFFECTS = Object.freeze({
  providerContacted: false,
  sceneryAccessed: false,
  gpuLaunched: false,
  paidCompute: false,
  voiceGenerated: false,
  commercialBytesDownloaded: 0,
  externalAnalyticsContacted: false,
  productionMutated: false,
  storageWritten: false,
});
export type KidsEngagementSideEffects = typeof ZERO_SIDE_EFFECTS;

export type CausalStoryChain = {
  discovery: string;
  triggerOrMistake: string;
  consequence: string;
  firstAttempt: string;
  secondAttemptOrEscalation: string;
  cooperativeSolution: string;
  meaningfulPayoff: string;
};

export type PositiveArousalHook = {
  firstMeaningfulVisualEvent: string;
  intendedPositiveEmotion: PositiveHookEmotion | NegativeHookEmotion | string;
  usesNegativeEmotionManipulation: boolean;
};

export type VisibleGoal = {
  statement: string;
  immediatelyUnderstandable: boolean;
  goalObjectOrObjective: string;
  visuallyTrackable: boolean;
};

export type CharacterConsistency = {
  pipTraits: readonly string[];
  goatTraits: readonly string[];
  goatConsistentlyStupid: boolean;
  goatOnlyVictim: boolean;
  equalEmotionalImportance: boolean;
  problemRoles: {
    discovers: EngagementCharacterId;
    complicates: EngagementCharacterId;
    solves: EngagementCharacterId;
  };
};

export type ParticipationCue = {
  present: boolean;
  kind: 'prediction' | 'hidden_clue' | 'path_choice' | 'visual_question' | 'none';
  processingPauseBeforeReveal: boolean;
  requiresComments: boolean;
  collectsChildInformation: boolean;
};

export type SafeHumor = {
  kind: 'visual_incongruity' | 'wordplay' | 'harmless_physical' | 'none';
  charactersCommunicateSafety: boolean;
  visibleInjury: boolean;
  humiliation: boolean;
  cruelty: boolean;
  painBased: boolean;
  frighteningPerilDisguisedAsHumor: boolean;
};

export type FocalMotionBeat = {
  beatId: string;
  primaryFocalElement: string;
  motionGuidesAttention: boolean;
  unrelatedMovingDecorationsCompete: boolean;
};

export type FocalMotionPlan = {
  beats: readonly FocalMotionBeat[];
};

export type RelevantAudioPlan = {
  dialogueSupportsActiveBeat: boolean;
  musicSupportsActiveBeat: boolean;
  sfxSupportActiveBeat: boolean;
  recurringMotifs: readonly ('pip' | 'goat' | 'map' | 'portal' | 'discovery')[];
  randomNoise: boolean;
  excessiveSoundEffects: boolean;
  unsupportedSoundCues: boolean;
  dialogueIntelligible: boolean;
};

export type PacingAndProcessing = {
  energeticWithoutNonstopCutting: boolean;
  processingBeatsAfterDiscoveries: boolean;
  processingBeatsAfterChoices: boolean;
  processingBeatsAfterReactions: boolean;
  averageShotDurationSec: number;
  unusuallyRapidShotClusters: readonly string[];
  treatsMaximumCutFrequencyAsQuality: boolean;
};

export type ProsocialPayoff = {
  shownThroughAction: boolean;
  themes: readonly ('cooperation' | 'courage' | 'kindness' | 'repair' | 'friendship' | 'problem-solving')[];
  lectureOrForcedMoral: boolean;
};

export type ReplayDesign = {
  cueKind: 'hidden_clue' | 'visual_callback' | 'recurring_reaction' | 'sound_motif' | 'natural_loop' | 'none';
  naturalReplayCue: boolean;
  satisfyingEnding: boolean;
  deceptiveEndlessLoop: boolean;
};

export type ProductionReusePlan = {
  sceneryReuse: string;
  lightingReuse: string;
  cameraReuse: string;
  animationReuse: string;
  propReuse: string;
  audioReuse: string;
  estimatedNewWorkShare: number;
  estimatedReusedWorkShare: number;
  preservesMovieQualityStandard: boolean;
  costControlsPresent: boolean;
};

export type NineSixteenReadability = {
  aspectRatio: '9:16';
  characterReadable: boolean;
  focalReadable: boolean;
};

export type AgeBandLayer = {
  ageBand: AgeBandId;
  clearVisualObjective: boolean;
  literalCauseAndEffect: boolean;
  safePhysicalHumor: boolean;
  shortSentences: boolean;
  strongReadableExpressions: boolean;
  storyCriticalWordplay: boolean;
  additionalInference: boolean;
  cleverCallbacks: boolean;
  lightWordplay: boolean;
  layeredCharacterMotivation: boolean;
  optionalBackgroundClues: boolean;
  olderLayerConfusesYoungerViewers: boolean;
  olderWordplayCarriesYoungerPlotFact: boolean;
};

export type AudienceEngagementBlueprint = {
  schemaVersion: typeof AUDIENCE_ENGAGEMENT_BLUEPRINT_SCHEMA;
  framework: typeof KIDS_ENGAGEMENT_SCHEMA;
  episodeId: string;
  title: string;
  world: 'PIP_AND_GOAT_AND_THE_LOST_DOODLE_MAP';
  planningOnly: true;
  finalScriptApproved: false;
  productionAssetsApproved: false;
  dialogueRefs: readonly string[];
  positiveArousalHook: PositiveArousalHook;
  visibleGoal: VisibleGoal;
  causalStoryChain: CausalStoryChain;
  characterConsistency: CharacterConsistency;
  participationCue: ParticipationCue;
  safeHumor: SafeHumor;
  focalMotionPlan: FocalMotionPlan;
  relevantAudioPlan: RelevantAudioPlan;
  pacingAndProcessing: PacingAndProcessing;
  prosocialPayoff: ProsocialPayoff;
  replayDesign: ReplayDesign;
  productionReusePlan: ProductionReusePlan;
  ageBandLayers: readonly AgeBandLayer[];
  nineSixteenReadability: NineSixteenReadability;
};

export type AudienceEngagementCheck = {
  code: AudienceEngagementCheckCode;
  label: string;
  state: AudienceEngagementCheckState;
  detail: string;
  missingProcessingBeats?: readonly string[];
};

export type HumanApprovalRecord = {
  actor: 'HUMAN';
  decision: 'APPROVE' | 'REJECT';
  notes: string | null;
  automatic: false;
};

export type AudienceEngagementReport = {
  schemaVersion: typeof AUDIENCE_ENGAGEMENT_REPORT_SCHEMA;
  framework: typeof KIDS_ENGAGEMENT_SCHEMA;
  episodeId: string;
  title: string;
  readiness: EngagementReadinessState;
  checks: readonly AudienceEngagementCheck[];
  missingProcessingBeats: readonly string[];
  viralityGuaranteed: false;
  viralProbabilityCalculated: false;
  numericalEngagementScore: null;
  humanApproval: HumanApprovalRecord | null;
  humanApprovalSetAutomatically: false;
  pipeline: readonly StudioEngagementPipelineStage[];
  reportSha256: string;
  synthetic: true;
} & KidsEngagementSideEffects;

export type PilotExperiment = {
  schemaVersion: typeof PILOT_EXPERIMENT_SCHEMA;
  pilotId: 'PILOT_1' | 'PILOT_2' | 'PILOT_3';
  title: string;
  primaryVariable: string;
  homeBaseOpportunity: string | null;
  world: 'PIP_AND_GOAT_AND_THE_LOST_DOODLE_MAP';
  approvedConceptOnly: true;
  finalScriptApproved: false;
  productionAssetsApproved: false;
  blueprint: AudienceEngagementBlueprint;
};

export type RetentionMarker = {
  atPercent: number;
  remainingPercent: number;
};

export type PilotAnalyticsSnapshot = {
  schemaVersion: typeof PILOT_ANALYTICS_SNAPSHOT_SCHEMA;
  pilotId: 'PILOT_1' | 'PILOT_2' | 'PILOT_3';
  observationWindow: ObservationWindow;
  views: number | null;
  engagedViews: number | null;
  viewedVersusSwipedAway: number | null;
  averageViewDurationSec: number | null;
  averagePercentageViewed: number | null;
  retentionMarkers: readonly RetentionMarker[] | null;
  replayOrRepeatedViewIndicators: number | null;
  likes: number | null;
  shares: number | null;
  uniqueViewers: number | null;
  productionTimeMinutes: number | null;
  renderCostUsd: number | null;
  humanComprehensionNotes: string | null;
  humanEnjoymentNotes: string | null;
  humanReplayInterestNotes: string | null;
  source: 'MANUAL_AGGREGATE' | 'SYNTHETIC_PREVIEW';
  childLevelDataPresent: false;
  viewerIdentifyingDataPresent: false;
  commentsIngested: false;
  usernamesCollected: false;
  externalAnalyticsContacted: false;
  snapshotSha256: string;
};

export type ComparisonDimensionFinding = {
  dimension: ComparisonDimension;
  availability: 'OBSERVED' | 'NOT_AVAILABLE';
  note: string;
};

export type PilotComparisonReport = {
  schemaVersion: typeof PILOT_COMPARISON_REPORT_SCHEMA;
  snapshots: readonly PilotAnalyticsSnapshot[];
  findings: readonly ComparisonDimensionFinding[];
  selectedWinnerPilotId: 'PILOT_1' | 'PILOT_2' | 'PILOT_3' | null;
  winnerSelectedBy: 'HUMAN' | null;
  viewsAloneSelectedWinner: false;
  humanMustSelectWinner: true;
  automaticBatchAuthorized: false;
  automaticSpendAuthorized: false;
  nextBatchAuthorizedByHuman: boolean;
  viralityGuaranteed: false;
  comparisonSha256: string;
  synthetic: true;
} & KidsEngagementSideEffects;

export type ResearchCitation = {
  id: string;
  authors: string;
  year: number;
  title: string;
  container: string;
  doi: string | null;
  url: string | null;
};

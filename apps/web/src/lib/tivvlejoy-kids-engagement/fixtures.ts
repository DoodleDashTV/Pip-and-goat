import type {
  AgeBandLayer,
  AudienceEngagementBlueprint,
  CausalStoryChain,
  CharacterConsistency,
  FocalMotionPlan,
  NineSixteenReadability,
  PacingAndProcessing,
  ParticipationCue,
  PositiveArousalHook,
  ProductionReusePlan,
  ProsocialPayoff,
  RelevantAudioPlan,
  ReplayDesign,
  SafeHumor,
  VisibleGoal,
} from './types';
import { AUDIENCE_ENGAGEMENT_BLUEPRINT_SCHEMA, CANONICAL_GOAT_TRAITS, CANONICAL_PIP_TRAITS, KIDS_ENGAGEMENT_SCHEMA } from './types';

function youngerLayer(overrides: Partial<AgeBandLayer> = {}): AgeBandLayer {
  return {
    ageBand: 'AGES_5_7',
    clearVisualObjective: true,
    literalCauseAndEffect: true,
    safePhysicalHumor: true,
    shortSentences: true,
    strongReadableExpressions: true,
    storyCriticalWordplay: false,
    additionalInference: false,
    cleverCallbacks: false,
    lightWordplay: false,
    layeredCharacterMotivation: false,
    optionalBackgroundClues: false,
    olderLayerConfusesYoungerViewers: false,
    olderWordplayCarriesYoungerPlotFact: false,
    ...overrides,
  };
}

function olderLayer(overrides: Partial<AgeBandLayer> = {}): AgeBandLayer {
  return {
    ageBand: 'AGES_8_10',
    clearVisualObjective: true,
    literalCauseAndEffect: true,
    safePhysicalHumor: true,
    shortSentences: false,
    strongReadableExpressions: true,
    storyCriticalWordplay: false,
    additionalInference: true,
    cleverCallbacks: true,
    lightWordplay: true,
    layeredCharacterMotivation: true,
    optionalBackgroundClues: true,
    olderLayerConfusesYoungerViewers: false,
    olderWordplayCarriesYoungerPlotFact: false,
    ...overrides,
  };
}

const defaultHook: PositiveArousalHook = {
  firstMeaningfulVisualEvent: 'A glowing bakery flour trail curls into the shape of the lost map.',
  intendedPositiveEmotion: 'curiosity',
  usesNegativeEmotionManipulation: false,
};

const defaultGoal: VisibleGoal = {
  statement: 'Follow the bakery map to the marked tree.',
  immediatelyUnderstandable: true,
  goalObjectOrObjective: 'PROP_STORY_MAP',
  visuallyTrackable: true,
};

const defaultChain: CausalStoryChain = {
  discovery: 'Pip notices the flour trail matches the map.',
  triggerOrMistake: 'Goat almost dusts the trail away before they copy it.',
  consequence: 'The pair must leave the bakery before the trail fades.',
  firstAttempt: 'They walk the street holding the map between them.',
  secondAttemptOrEscalation: 'The forest exit looks farther than the map suggested.',
  cooperativeSolution: 'Pip reads the mark while Goat steadies the map.',
  meaningfulPayoff: 'They find the marked tree together and share a grin.',
};

const defaultCharacters: CharacterConsistency = {
  pipTraits: [...CANONICAL_PIP_TRAITS],
  goatTraits: [...CANONICAL_GOAT_TRAITS, 'occasionally mischievous'],
  goatConsistentlyStupid: false,
  goatOnlyVictim: false,
  equalEmotionalImportance: true,
  problemRoles: {
    discovers: 'PIP',
    complicates: 'GOAT',
    solves: 'PIP_AND_GOAT',
  },
};

const defaultParticipation: ParticipationCue = {
  present: true,
  kind: 'visual_question',
  processingPauseBeforeReveal: true,
  requiresComments: false,
  collectsChildInformation: false,
};

const defaultHumor: SafeHumor = {
  kind: 'visual_incongruity',
  charactersCommunicateSafety: true,
  visibleInjury: false,
  humiliation: false,
  cruelty: false,
  painBased: false,
  frighteningPerilDisguisedAsHumor: false,
};

const defaultFocal: FocalMotionPlan = {
  beats: [
    { beatId: 'HOOK', primaryFocalElement: 'flour trail', motionGuidesAttention: true, unrelatedMovingDecorationsCompete: false },
    { beatId: 'DISCOVERY', primaryFocalElement: 'PROP_STORY_MAP', motionGuidesAttention: true, unrelatedMovingDecorationsCompete: false },
    { beatId: 'PAYOFF', primaryFocalElement: 'marked tree', motionGuidesAttention: true, unrelatedMovingDecorationsCompete: false },
  ],
};

const defaultAudio: RelevantAudioPlan = {
  dialogueSupportsActiveBeat: true,
  musicSupportsActiveBeat: true,
  sfxSupportActiveBeat: true,
  recurringMotifs: ['pip', 'goat', 'map', 'discovery'],
  randomNoise: false,
  excessiveSoundEffects: false,
  unsupportedSoundCues: false,
  dialogueIntelligible: true,
};

const defaultPacing: PacingAndProcessing = {
  energeticWithoutNonstopCutting: true,
  processingBeatsAfterDiscoveries: true,
  processingBeatsAfterChoices: true,
  processingBeatsAfterReactions: true,
  averageShotDurationSec: 5.4,
  unusuallyRapidShotClusters: [],
  treatsMaximumCutFrequencyAsQuality: false,
};

const defaultPayoff: ProsocialPayoff = {
  shownThroughAction: true,
  themes: ['cooperation', 'problem-solving', 'friendship'],
  lectureOrForcedMoral: false,
};

const defaultReplay: ReplayDesign = {
  cueKind: 'hidden_clue',
  naturalReplayCue: true,
  satisfyingEnding: true,
  deceptiveEndlessLoop: false,
};

const defaultReuse: ProductionReusePlan = {
  sceneryReuse: 'Bakery street and forest-exit storybook presets.',
  lightingReuse: 'TJ_MORNING_WARM and TJ_DAY_ADVENTURE.',
  cameraReuse: 'Existing 9:16 establishing, insert, and reaction templates.',
  animationReuse: 'Walk-and-talk and shared-reaction cycles.',
  propReuse: 'Story map hero prop.',
  audioReuse: 'Pip, Goat, map, and discovery motifs.',
  estimatedNewWorkShare: 0.28,
  estimatedReusedWorkShare: 0.72,
  preservesMovieQualityStandard: true,
  costControlsPresent: true,
};

const defaultFrame: NineSixteenReadability = {
  aspectRatio: '9:16',
  characterReadable: true,
  focalReadable: true,
};

export function buildAudienceEngagementBlueprint(
  overrides: Partial<AudienceEngagementBlueprint> & {
    positiveArousalHook?: Partial<PositiveArousalHook>;
    visibleGoal?: Partial<VisibleGoal>;
    causalStoryChain?: Partial<CausalStoryChain>;
    characterConsistency?: Partial<CharacterConsistency> & {
      problemRoles?: Partial<CharacterConsistency['problemRoles']>;
    };
    participationCue?: Partial<ParticipationCue>;
    safeHumor?: Partial<SafeHumor>;
    focalMotionPlan?: Partial<FocalMotionPlan>;
    relevantAudioPlan?: Partial<RelevantAudioPlan>;
    pacingAndProcessing?: Partial<PacingAndProcessing>;
    prosocialPayoff?: Partial<ProsocialPayoff>;
    replayDesign?: Partial<ReplayDesign>;
    productionReusePlan?: Partial<ProductionReusePlan>;
    nineSixteenReadability?: Partial<NineSixteenReadability>;
    ageBandLayers?: readonly AgeBandLayer[];
  } = {},
): AudienceEngagementBlueprint {
  return {
    schemaVersion: AUDIENCE_ENGAGEMENT_BLUEPRINT_SCHEMA,
    framework: KIDS_ENGAGEMENT_SCHEMA,
    episodeId: overrides.episodeId ?? 'EP012',
    title: overrides.title ?? 'The Bakery Map',
    world: 'PIP_AND_GOAT_AND_THE_LOST_DOODLE_MAP',
    planningOnly: true,
    finalScriptApproved: false,
    productionAssetsApproved: false,
    dialogueRefs: overrides.dialogueRefs ?? [
      'DL_HOOK_01',
      'DL_DISCOVERY_01',
      'DL_DECISION_01',
      'DL_ACTION_01',
      'DL_COMPLICATION_01',
      'DL_PAYOFF_01',
      'DL_BUTTON_01',
    ],
    positiveArousalHook: { ...defaultHook, ...overrides.positiveArousalHook },
    visibleGoal: { ...defaultGoal, ...overrides.visibleGoal },
    causalStoryChain: { ...defaultChain, ...overrides.causalStoryChain },
    characterConsistency: {
      ...defaultCharacters,
      ...overrides.characterConsistency,
      problemRoles: {
        ...defaultCharacters.problemRoles,
        ...overrides.characterConsistency?.problemRoles,
      },
    },
    participationCue: { ...defaultParticipation, ...overrides.participationCue },
    safeHumor: { ...defaultHumor, ...overrides.safeHumor },
    focalMotionPlan: {
      beats: overrides.focalMotionPlan?.beats ?? defaultFocal.beats,
    },
    relevantAudioPlan: { ...defaultAudio, ...overrides.relevantAudioPlan },
    pacingAndProcessing: { ...defaultPacing, ...overrides.pacingAndProcessing },
    prosocialPayoff: { ...defaultPayoff, ...overrides.prosocialPayoff },
    replayDesign: { ...defaultReplay, ...overrides.replayDesign },
    productionReusePlan: { ...defaultReuse, ...overrides.productionReusePlan },
    ageBandLayers: overrides.ageBandLayers ?? [youngerLayer(), olderLayer()],
    nineSixteenReadability: { ...defaultFrame, ...overrides.nineSixteenReadability },
  };
}

export const passingEp012Blueprint = buildAudienceEngagementBlueprint();

export function unclearGoalBlueprint(): AudienceEngagementBlueprint {
  return buildAudienceEngagementBlueprint({
    visibleGoal: {
      statement: 'Have fun',
      immediatelyUnderstandable: false,
      goalObjectOrObjective: '',
      visuallyTrackable: false,
    },
  });
}

export function incompleteCausalChainBlueprint(): AudienceEngagementBlueprint {
  return buildAudienceEngagementBlueprint({
    causalStoryChain: {
      firstAttempt: '',
      cooperativeSolution: '',
    },
  });
}

export function negativeEmotionHookBlueprint(): AudienceEngagementBlueprint {
  return buildAudienceEngagementBlueprint({
    positiveArousalHook: {
      firstMeaningfulVisualEvent: 'A sudden crash startles the street.',
      intendedPositiveEmotion: 'fear',
      usesNegativeEmotionManipulation: true,
    },
  });
}

export function injuryHumorBlueprint(): AudienceEngagementBlueprint {
  return buildAudienceEngagementBlueprint({
    safeHumor: {
      kind: 'harmless_physical',
      charactersCommunicateSafety: false,
      visibleInjury: true,
      humiliation: true,
      cruelty: false,
      painBased: true,
      frighteningPerilDisguisedAsHumor: false,
    },
  });
}

export function unrelatedFocalMotionBlueprint(): AudienceEngagementBlueprint {
  return buildAudienceEngagementBlueprint({
    focalMotionPlan: {
      beats: [
        {
          beatId: 'HOOK',
          primaryFocalElement: 'background bunting',
          motionGuidesAttention: false,
          unrelatedMovingDecorationsCompete: true,
        },
      ],
    },
  });
}

export function excessiveAudioBlueprint(): AudienceEngagementBlueprint {
  return buildAudienceEngagementBlueprint({
    relevantAudioPlan: {
      randomNoise: true,
      excessiveSoundEffects: true,
      unsupportedSoundCues: true,
      dialogueIntelligible: false,
    },
  });
}

export function missingProcessingBeatsBlueprint(): AudienceEngagementBlueprint {
  return buildAudienceEngagementBlueprint({
    pacingAndProcessing: {
      processingBeatsAfterDiscoveries: false,
      processingBeatsAfterChoices: false,
      processingBeatsAfterReactions: false,
      treatsMaximumCutFrequencyAsQuality: true,
      averageShotDurationSec: 0.6,
      unusuallyRapidShotClusters: ['SH003-SH006'],
    },
  });
}

export function personalityViolationBlueprint(): AudienceEngagementBlueprint {
  return buildAudienceEngagementBlueprint({
    characterConsistency: {
      pipTraits: ['mean', 'impatient'],
      goatTraits: ['stupid', 'clumsy'],
      goatConsistentlyStupid: true,
      goatOnlyVictim: true,
      equalEmotionalImportance: false,
      problemRoles: {
        discovers: 'PIP',
        complicates: 'PIP',
        solves: 'PIP',
      },
    },
  });
}

export function olderWordplayCarriesPlotBlueprint(): AudienceEngagementBlueprint {
  return buildAudienceEngagementBlueprint({
    ageBandLayers: [
      youngerLayer({ storyCriticalWordplay: true }),
      olderLayer({ olderWordplayCarriesYoungerPlotFact: true, olderLayerConfusesYoungerViewers: true }),
    ],
  });
}

export function naturalReplayBlueprint(): AudienceEngagementBlueprint {
  return buildAudienceEngagementBlueprint({
    replayDesign: {
      cueKind: 'sound_motif',
      naturalReplayCue: true,
      satisfyingEnding: true,
      deceptiveEndlessLoop: false,
    },
  });
}

export function deceptiveLoopBlueprint(): AudienceEngagementBlueprint {
  return buildAudienceEngagementBlueprint({
    replayDesign: {
      cueKind: 'natural_loop',
      naturalReplayCue: false,
      satisfyingEnding: false,
      deceptiveEndlessLoop: true,
    },
  });
}

export { youngerLayer, olderLayer };

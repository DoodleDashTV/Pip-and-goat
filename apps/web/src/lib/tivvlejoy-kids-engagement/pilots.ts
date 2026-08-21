import { buildAudienceEngagementBlueprint } from './fixtures';
import { PILOT_EXPERIMENT_SCHEMA, type PilotExperiment } from './types';

export const APPROVED_PILOT_EXPERIMENTS: readonly PilotExperiment[] = [
  {
    schemaVersion: PILOT_EXPERIMENT_SCHEMA,
    pilotId: 'PILOT_1',
    title: 'Goat, Don’t Press That Button!',
    primaryVariable: 'visual comedy and positive spectacle',
    homeBaseOpportunity: 'Neighborhood Shops',
    world: 'PIP_AND_GOAT_AND_THE_LOST_DOODLE_MAP',
    approvedConceptOnly: true,
    finalScriptApproved: false,
    productionAssetsApproved: false,
    blueprint: buildAudienceEngagementBlueprint({
      episodeId: 'PILOT_1',
      title: 'Goat, Don’t Press That Button!',
      dialogueRefs: [],
      positiveArousalHook: {
        firstMeaningfulVisualEvent: 'A shop-window button lights up in a delighted swirl of pastry steam.',
        intendedPositiveEmotion: 'laughter',
      },
      visibleGoal: {
        statement: 'Keep the shop-window button from starting a pastry parade until they understand it.',
        goalObjectOrObjective: 'shop-window button',
      },
      causalStoryChain: {
        discovery: 'Goat finds a glowing button beside the Neighborhood Shops window.',
        triggerOrMistake: 'Goat presses it with a mischievous grin after Pip asks him to wait.',
        consequence: 'A harmless pastry parade pops into the street.',
        firstAttempt: 'Pip tries to hide the button behind a bakery tray.',
        secondAttemptOrEscalation: 'The parade grows brighter and funnier, still clearly safe.',
        cooperativeSolution: 'Goat holds the window steady while Pip finds the off swirl.',
        meaningfulPayoff: 'They share the extra pastries with the shopkeeper and laugh together.',
      },
      characterConsistency: {
        problemRoles: {
          discovers: 'GOAT',
          complicates: 'GOAT',
          solves: 'PIP_AND_GOAT',
        },
      },
      safeHumor: {
        kind: 'visual_incongruity',
      },
      focalMotionPlan: {
        beats: [
          { beatId: 'HOOK', primaryFocalElement: 'shop-window button', motionGuidesAttention: true, unrelatedMovingDecorationsCompete: false },
          { beatId: 'SPECTACLE', primaryFocalElement: 'pastry parade', motionGuidesAttention: true, unrelatedMovingDecorationsCompete: false },
          { beatId: 'PAYOFF', primaryFocalElement: 'Pip and Goat sharing pastries', motionGuidesAttention: true, unrelatedMovingDecorationsCompete: false },
        ],
      },
      productionReusePlan: {
        sceneryReuse: 'Neighborhood Shops / bakery street home-base presets.',
        lightingReuse: 'TJ_MORNING_WARM.',
        cameraReuse: 'Insert, two-shot, and spectacle-safe vertical templates.',
        animationReuse: 'Reaction and harmless physical-comedy cycles.',
        propReuse: 'Shop-window button dressing on an immutable shop base.',
        audioReuse: 'Goat motif plus a short delight sting.',
        estimatedNewWorkShare: 0.35,
        estimatedReusedWorkShare: 0.65,
      },
    }),
  },
  {
    schemaVersion: PILOT_EXPERIMENT_SCHEMA,
    pilotId: 'PILOT_2',
    title: 'Can You Find the Missing Map Piece?',
    primaryVariable: 'participation, hidden clues and replay',
    homeBaseOpportunity: null,
    world: 'PIP_AND_GOAT_AND_THE_LOST_DOODLE_MAP',
    approvedConceptOnly: true,
    finalScriptApproved: false,
    productionAssetsApproved: false,
    blueprint: buildAudienceEngagementBlueprint({
      episodeId: 'PILOT_2',
      title: 'Can You Find the Missing Map Piece?',
      dialogueRefs: [],
      positiveArousalHook: {
        firstMeaningfulVisualEvent: 'A map corner peeks from under a flower box, then slips out of sight.',
        intendedPositiveEmotion: 'curiosity',
      },
      visibleGoal: {
        statement: 'Find the missing map piece before the pair leave the street.',
        goalObjectOrObjective: 'missing map piece',
      },
      causalStoryChain: {
        discovery: 'Pip notices one corner of the map is blank.',
        triggerOrMistake: 'Goat folds the map the wrong way and the missing piece stays hidden.',
        consequence: 'They cannot read the next path.',
        firstAttempt: 'Pip checks the bakery stoop.',
        secondAttemptOrEscalation: 'Goat checks the flower box while a background clue waits for a second look.',
        cooperativeSolution: 'They pause, look together, and match the hidden piece to the blank corner.',
        meaningfulPayoff: 'The completed map points to a friendly next stop.',
      },
      participationCue: {
        present: true,
        kind: 'hidden_clue',
        processingPauseBeforeReveal: true,
        requiresComments: false,
        collectsChildInformation: false,
      },
      replayDesign: {
        cueKind: 'hidden_clue',
        naturalReplayCue: true,
        satisfyingEnding: true,
        deceptiveEndlessLoop: false,
      },
      characterConsistency: {
        problemRoles: {
          discovers: 'PIP',
          complicates: 'GOAT',
          solves: 'PIP_AND_GOAT',
        },
      },
    }),
  },
  {
    schemaVersion: PILOT_EXPERIMENT_SCHEMA,
    pilotId: 'PILOT_3',
    title: 'The Cloud That Was Afraid to Thunder',
    primaryVariable: 'emotion, kindness and cooperative rescue',
    homeBaseOpportunity: null,
    world: 'PIP_AND_GOAT_AND_THE_LOST_DOODLE_MAP',
    approvedConceptOnly: true,
    finalScriptApproved: false,
    productionAssetsApproved: false,
    blueprint: buildAudienceEngagementBlueprint({
      episodeId: 'PILOT_3',
      title: 'The Cloud That Was Afraid to Thunder',
      dialogueRefs: [],
      positiveArousalHook: {
        firstMeaningfulVisualEvent: 'A shy cloud hides behind a hill, hugging a tiny rumble it is afraid to share.',
        intendedPositiveEmotion: 'awe',
      },
      visibleGoal: {
        statement: 'Help the shy cloud feel safe enough to share a gentle rumble.',
        goalObjectOrObjective: 'shy cloud',
      },
      causalStoryChain: {
        discovery: 'Pip sees the cloud trembling behind the hill.',
        triggerOrMistake: 'Goat calls for a big thunder before noticing the cloud is scared.',
        consequence: 'The cloud hides farther away, still clearly safe and unharmed.',
        firstAttempt: 'Pip offers a kind wave from a readable distance.',
        secondAttemptOrEscalation: 'A soft wind makes the cloud wobble, never a frightening storm.',
        cooperativeSolution: 'Goat lowers his voice and they walk the cloud toward open sky together.',
        meaningfulPayoff: 'The cloud shares a tiny, friendly rumble and the friends cheer.',
      },
      characterConsistency: {
        problemRoles: {
          discovers: 'PIP',
          complicates: 'GOAT',
          solves: 'PIP_AND_GOAT',
        },
      },
      safeHumor: {
        kind: 'wordplay',
      },
      prosocialPayoff: {
        themes: ['kindness', 'cooperation', 'courage', 'friendship'],
        shownThroughAction: true,
        lectureOrForcedMoral: false,
      },
      focalMotionPlan: {
        beats: [
          { beatId: 'HOOK', primaryFocalElement: 'shy cloud', motionGuidesAttention: true, unrelatedMovingDecorationsCompete: false },
          { beatId: 'HELP', primaryFocalElement: 'Pip and Goat approaching together', motionGuidesAttention: true, unrelatedMovingDecorationsCompete: false },
          { beatId: 'PAYOFF', primaryFocalElement: 'tiny friendly rumble', motionGuidesAttention: true, unrelatedMovingDecorationsCompete: false },
        ],
      },
    }),
  },
];

export function getApprovedPilot(pilotId: PilotExperiment['pilotId']): PilotExperiment {
  const found = APPROVED_PILOT_EXPERIMENTS.find((pilot) => pilot.pilotId === pilotId);
  if (!found) {
    throw new Error(`Unknown approved pilot: ${pilotId}`);
  }
  return found;
}

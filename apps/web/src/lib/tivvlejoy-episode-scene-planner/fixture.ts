import { planBatchEpisodes, planEpisode, type LocationDeltaInput, type ShotDraft, type StoryBeatRecord } from './planner';
import type { CameraTemplateId } from './types';

const beats: StoryBeatRecord[] = [
  {
    beatId: 'BEAT_HOOK',
    kind: 'HOOK',
    order: 1,
    durationFrames: 180,
    storyPurpose: 'Arrive at the bakery street',
    primaryCharacter: 'PIP_AND_GOAT',
    secondaryCharacters: [],
    dialogueRefs: ['DL_HOOK_01'],
    requiredStoryProps: [],
    preferredLocation: 'bakery',
    focalTarget: 'HERO_SCENERY',
    energyLevel: 'medium',
    continuityNotes: 'Keep bakery sign readable.',
  },
  {
    beatId: 'BEAT_DISCOVERY',
    kind: 'DISCOVERY',
    order: 2,
    durationFrames: 270,
    storyPurpose: 'Pip finds the story map',
    primaryCharacter: 'PIP',
    secondaryCharacters: ['GOAT'],
    dialogueRefs: ['DL_DISCOVERY_01'],
    requiredStoryProps: ['PROP_STORY_MAP'],
    preferredLocation: 'bakery',
    focalTarget: 'STORY_PROP',
    energyLevel: 'high',
    continuityNotes: 'Map insert must stay story-safe.',
  },
  {
    beatId: 'BEAT_DECISION',
    kind: 'DECISION',
    order: 3,
    durationFrames: 180,
    storyPurpose: 'Goat agrees to follow the map',
    primaryCharacter: 'GOAT',
    secondaryCharacters: ['PIP'],
    dialogueRefs: ['DL_DECISION_01'],
    requiredStoryProps: ['PROP_STORY_MAP'],
    preferredLocation: 'bakery',
    focalTarget: 'PIP_AND_GOAT',
    energyLevel: 'medium',
    continuityNotes: 'No voice is generated from these refs.',
  },
  {
    beatId: 'BEAT_ACTION',
    kind: 'ACTION',
    order: 4,
    durationFrames: 210,
    storyPurpose: 'Walk toward the forest path',
    primaryCharacter: 'PIP_AND_GOAT',
    secondaryCharacters: [],
    dialogueRefs: ['DL_ACTION_01'],
    requiredStoryProps: ['PROP_STORY_MAP'],
    preferredLocation: 'bakery',
    focalTarget: 'PIP_AND_GOAT',
    energyLevel: 'medium',
    continuityNotes: 'Keep walkable width clear.',
  },
  {
    beatId: 'BEAT_COMPLICATION',
    kind: 'COMPLICATION',
    order: 5,
    durationFrames: 390,
    storyPurpose: 'The forest exit looks farther than expected',
    primaryCharacter: 'PIP_AND_GOAT',
    secondaryCharacters: [],
    dialogueRefs: ['DL_COMPLICATION_01'],
    requiredStoryProps: ['PROP_STORY_MAP'],
    preferredLocation: 'forest_exit',
    focalTarget: 'HERO_SCENERY',
    energyLevel: 'high',
    continuityNotes: 'Adjacent world hop HOME_NEIGHBORHOOD to ENCHANTED_OUTSKIRTS.',
  },
  {
    beatId: 'BEAT_PAYOFF',
    kind: 'PAYOFF',
    order: 6,
    durationFrames: 210,
    storyPurpose: 'The marked tree is found',
    primaryCharacter: 'PIP',
    secondaryCharacters: ['GOAT'],
    dialogueRefs: ['DL_PAYOFF_01'],
    requiredStoryProps: ['PROP_STORY_MAP'],
    preferredLocation: 'forest_exit',
    focalTarget: 'HERO_SCENERY',
    energyLevel: 'high',
    continuityNotes: 'Reveal only after the map insert.',
  },
  {
    beatId: 'BEAT_BUTTON',
    kind: 'BUTTON',
    order: 7,
    durationFrames: 150,
    storyPurpose: 'Shared grin before the next adventure',
    primaryCharacter: 'PIP_AND_GOAT',
    secondaryCharacters: [],
    dialogueRefs: ['DL_BUTTON_01'],
    requiredStoryProps: [],
    preferredLocation: 'forest_exit',
    focalTarget: 'PIP_AND_GOAT',
    energyLevel: 'low',
    continuityNotes: 'End on faces, not a new location.',
  },
];

function shot(
  shotId: string,
  sequenceNumber: number,
  storyBeatId: string,
  durationFrames: number,
  locationPresetId: ShotDraft['locationPresetId'],
  lightingPresetId: ShotDraft['lightingPresetId'],
  cameraTemplateId: CameraTemplateId,
  focalTarget: ShotDraft['focalTarget'],
  charactersVisible: ShotDraft['charactersVisible'],
  extras: Partial<ShotDraft> = {},
): ShotDraft {
  return {
    shotId,
    sequenceNumber,
    storyBeatId,
    durationFrames,
    locationPresetId,
    lightingPresetId,
    cameraTemplateId,
    focalTarget,
    charactersVisible,
    dialogueRefs: extras.dialogueRefs ?? [],
    storyPropRefs: extras.storyPropRefs ?? [],
    visibleGeometry: extras.visibleGeometry ?? [`${locationPresetId}-facade`],
    visibleMaterials: extras.visibleMaterials ?? ['wood', 'wall'],
    visibleDressing: extras.visibleDressing ?? ['flower_boxes'],
    characterAnimation: extras.characterAnimation ?? 'hold',
    environmentVersion: extras.environmentVersion ?? `${locationPresetId}-env-v1`,
    renderProfile: extras.renderProfile ?? 'PLANNING',
    notes: extras.notes,
    displayLabel: extras.displayLabel,
    explicitTransition: extras.explicitTransition,
    transitionKind: extras.transitionKind,
  };
}

const shots: ShotDraft[] = [
  shot('SH001', 1, 'BEAT_HOOK', 180, 'bakery', 'TJ_MORNING_WARM', 'TJ_CAM_ESTABLISHING_VERTICAL', 'HERO_SCENERY', []),
  shot('SH002', 2, 'BEAT_HOOK', 150, 'bakery', 'TJ_MORNING_WARM', 'TJ_CAM_TWO_SHOT_MEDIUM', 'PIP_AND_GOAT', ['PIP', 'GOAT'], {
    dialogueRefs: ['DL_HOOK_01'],
  }),
  shot('SH003', 3, 'BEAT_DISCOVERY', 150, 'bakery', 'TJ_MORNING_WARM', 'TJ_CAM_PIP_MEDIUM', 'PIP', ['PIP'], {
    dialogueRefs: ['DL_DISCOVERY_01'],
    storyPropRefs: ['PROP_STORY_MAP'],
    visibleDressing: ['flower_boxes', 'market_cart'],
  }),
  shot('SH004', 4, 'BEAT_DISCOVERY', 120, 'bakery', 'TJ_MORNING_WARM', 'TJ_CAM_STORY_PROP_INSERT', 'STORY_PROP', [], {
    storyPropRefs: ['PROP_STORY_MAP'],
  }),
  shot('SH005', 5, 'BEAT_DECISION', 150, 'bakery', 'TJ_MORNING_WARM', 'TJ_CAM_GOAT_CLOSE', 'GOAT', ['GOAT'], {
    dialogueRefs: ['DL_DECISION_01'],
  }),
  shot('SH006', 6, 'BEAT_DECISION', 150, 'bakery', 'TJ_MORNING_WARM', 'TJ_CAM_REACTION_TWO_SHOT', 'PIP_AND_GOAT', ['PIP', 'GOAT']),
  shot('SH007', 7, 'BEAT_ACTION', 210, 'bakery', 'TJ_MORNING_WARM', 'TJ_CAM_WALK_AND_TALK', 'PIP_AND_GOAT', ['PIP', 'GOAT'], {
    dialogueRefs: ['DL_ACTION_01'],
    storyPropRefs: ['PROP_STORY_MAP'],
  }),
  shot('SH008', 8, 'BEAT_COMPLICATION', 180, 'forest_exit', 'TJ_DAY_ADVENTURE', 'TJ_CAM_ESTABLISHING_VERTICAL', 'HERO_SCENERY', []),
  shot('SH009', 9, 'BEAT_COMPLICATION', 210, 'forest_exit', 'TJ_DAY_ADVENTURE', 'TJ_CAM_FOLLOW_ADVENTURE', 'PIP_AND_GOAT', ['PIP', 'GOAT']),
  shot('SH010', 10, 'BEAT_PAYOFF', 210, 'forest_exit', 'TJ_DAY_ADVENTURE', 'TJ_CAM_REVEAL', 'HERO_SCENERY', ['PIP', 'GOAT'], {
    storyPropRefs: ['PROP_STORY_MAP'],
  }),
  shot('SH011', 11, 'BEAT_BUTTON', 150, 'forest_exit', 'TJ_DAY_ADVENTURE', 'TJ_CAM_REACTION_TWO_SHOT', 'PIP_AND_GOAT', ['PIP', 'GOAT']),
];

export const SAMPLE_LOCATION_DELTA: LocationDeltaInput = {
  baseLocationVersion: 'bakery-env-v1',
  episodeId: 'EP012',
  shotIds: ['SH003', 'SH004', 'SH007'],
  seed: 4170179,
  addedProps: ['PROP_STORY_MAP', 'flowers'],
  removedProps: [],
  movedProps: ['market_cart'],
  signageChanges: [],
  dressingChanges: ['festival-bunting-off', 'flowers-added'],
  lightingOverrides: [],
  temporaryStoryProps: ['PROP_STORY_MAP'],
  notes: 'Episode-only dressing. Base bakery remains immutable.',
};

export function sampleShotDrafts(): ShotDraft[] {
  return shots.map((item) => ({ ...item, visibleGeometry: [...item.visibleGeometry], visibleMaterials: [...item.visibleMaterials], visibleDressing: [...item.visibleDressing], storyPropRefs: [...item.storyPropRefs] }));
}

export function sampleEpisodePlan(overrides: Partial<Parameters<typeof planEpisode>[0]> = {}) {
  return planEpisode({
    episodeId: 'EP012',
    episodeVersion: 'ep012-plan-v1',
    seasonId: 'S01',
    episodeNumber: 12,
    title: 'The Bakery Map',
    notes: 'Planning fixture only.',
    beats,
    shots: sampleShotDrafts(),
    delta: { ...SAMPLE_LOCATION_DELTA, addedProps: [...SAMPLE_LOCATION_DELTA.addedProps] },
    ...overrides,
  });
}

export function sampleEpisodeWithKnownHashes() {
  const first = sampleEpisodePlan({ previousHashes: {} });
  const hashes = Object.fromEntries(first.shots.map((shot) => [shot.shotId, shot.shotDependencySha256]));
  return sampleEpisodePlan({ previousHashes: hashes });
}

export function sampleBatchPlan() {
  const first = sampleEpisodeWithKnownHashes();
  const secondShots = sampleShotDrafts()
    .filter((shot) => shot.locationPresetId === 'bakery')
    .slice(0, 3)
    .map((shot, index) => ({
      ...shot,
      shotId: `EP013_${shot.shotId}`,
      sequenceNumber: index + 1,
    }));
  const second = planEpisode({
    episodeId: 'EP013',
    episodeVersion: 'ep013-plan-v1',
    seasonId: 'S01',
    episodeNumber: 13,
    title: 'Bakery Morning Reuse',
    beats: beats.slice(0, 2),
    shots: secondShots,
    delta: { ...SAMPLE_LOCATION_DELTA, episodeId: 'EP013', shotIds: [] },
    previousHashes: {},
  });
  return planBatchEpisodes([first, second]);
}

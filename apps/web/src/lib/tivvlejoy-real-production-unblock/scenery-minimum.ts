import { sampleEpisodeWithKnownHashes } from '@/lib/tivvlejoy-episode-scene-planner/fixture';
import type { Ep012SceneryRole, FirstEpisodeSceneryMinimum, SceneryNeed } from './types';

type EpisodePlanLike = {
  episodeId: string;
  shots: Array<{ locationPresetId: string; storyPropRefs: string[] }>;
};

function need(role: Ep012SceneryRole, kind: SceneryNeed['kind'], why: string): SceneryNeed {
  return { role, kind, why };
}

export function compileFirstEpisodeSceneryMinimum(
  plan: EpisodePlanLike = sampleEpisodeWithKnownHashes(),
): FirstEpisodeSceneryMinimum {
  if (plan.episodeId !== 'EP012') {
    throw new Error('FIRST_EPISODE_SCENERY_MINIMUM_REQUIRES_EP012');
  }
  const locationIds = [...new Set(plan.shots.map((shot) => shot.locationPresetId))];
  const storyPropIds = [...new Set(plan.shots.flatMap((shot) => shot.storyPropRefs))];
  const hasForest = locationIds.includes('forest_exit');
  const needs: SceneryNeed[] = [
    need('BUILDING_HERO', 'required', 'Bakery street hero building must read as the bakery in SH001–SH007.'),
    need('SIGNAGE', 'required', 'Hook continuity requires a readable bakery sign.'),
    need('STREET_PROP', 'required', 'Bakery dressing and the market cart appear in discovery and action shots.'),
    need('STORY_PROP', 'required', 'PROP_STORY_MAP is the episode object and cannot be invented procedurally.'),
    need('PATH', 'required', 'Walk-and-talk and forest-exit travel need a continuous ground path.'),
    need('BACKGROUND_FILL', 'required', 'Establishing shots need far-street or ridge fill so the set does not collapse to a card.'),
    need('SKY', 'required', 'Morning bakery and day-adventure lighting both need a sky or world.'),
    need('SKY', 'native-procedural-capable', 'A native procedural world is acceptable if review prefers it over a purchased HDRI.'),
    need('INTERIOR_SHELL', 'optional', 'EP012 is a street bakery episode. An interior tavern shell is not required.'),
    need('INTERIOR_PROP', 'optional', 'Interior chairs/tables are not in the current shot list.'),
    need('TREE_HERO', 'optional', 'A single hero tree is nice for the payoff, but support trees plus the marked-tree staging can carry SH010.'),
  ];
  if (hasForest) {
    needs.push(
      need('TREE_SUPPORT', 'required', 'Forest-exit closer (SH008–SH011) needs supporting trees, not a whole Botaniq forest.'),
      need('FOREGROUND_FRAME', 'required', 'Follow and reveal shots need a foreground frame so the exit reads as woods.'),
      need('TERRAIN_SURFACE', 'required', 'Forest-exit ground cannot stay a bakery cobble.'),
    );
  }
  for (const role of needs.filter((item) => item.kind === 'required' && item.role !== 'SKY').map((item) => item.role)) {
    needs.push(need(role, 'must-come-from-approved-library', 'Hero buildings, trees, paths, props, and the story map must come from the approved purchased library.'));
  }
  const required = [...new Set(needs.filter((item) => item.kind === 'required').map((item) => item.role))];
  return {
    episodeId: 'EP012',
    locationIds,
    needs,
    required,
    optional: [...new Set(needs.filter((item) => item.kind === 'optional').map((item) => item.role))],
    nativeProceduralCapable: ['SKY'],
    mustComeFromApprovedLibrary: required.filter((role) => role !== 'SKY'),
    interiorRequired: false,
    storyPropIds,
  };
}

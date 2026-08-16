/**
 * Bundled briefs for Milestone 4.
 *
 * The proxy brief is the pipeline-test fixture. The canonical brief is a story
 * draft that may emit a ScenePlan after approval. Neither is an acceptance
 * render. Neither writes production-library.
 */
import { FOUNDING_CODES } from '@doodle-dash/domain';
import type { StoryBrief } from './story';

export const PROXY_PIPELINE_BRIEF: StoryBrief = {
  episodeId: 'M4_PROXY_PIPELINE_TEST',
  title: 'Proxy Meadow Notice',
  logline: 'Two labeled stand-ins notice a small map glow and try a kind first step.',
  theme: 'noticing together',
  seed: 'tivvlejoy-milestone-4-proxy-seed-v1',
  characterMode: 'PROXY',
  targetDurationSeconds: 30,
  storyApproved: false,
  requestedOccupants: ['PROXY_NONCANONICAL_BIRD_A', 'PROXY_NONCANONICAL_QUADRUPED_A'],
};

export const CANONICAL_STORY_BRIEF: StoryBrief = {
  episodeId: 'M4_CANONICAL_STORY_DRAFT',
  title: 'Map Glow Kindness',
  logline: 'Pip and Goat notice a small map glow and try a kind first step.',
  theme: 'noticing together',
  seed: 'tivvlejoy-milestone-4-canonical-seed-v1',
  characterMode: 'CANONICAL',
  targetDurationSeconds: 30,
  storyApproved: true,
  requestedOccupants: [FOUNDING_CODES.PIP, FOUNDING_CODES.GOAT],
};

export const FORBIDDEN_FINAL_INTENT = {
  outputClass: 'FINAL_PRODUCTION' as const,
  renderTier: 'FINAL' as const,
  assetQuality: 'THEATRICAL' as const,
  occupants: ['PROXY_NONCANONICAL_BIRD_A', 'PROXY_NONCANONICAL_QUADRUPED_A'],
  voiceBindings: {
    PROXY_NONCANONICAL_BIRD_A: 'pip_default_v1',
  },
  writeProductionLibrary: true,
  claimMaster: true,
  launchPaidGpu: true,
  emitScenePlan: true,
  storyApproved: true,
};

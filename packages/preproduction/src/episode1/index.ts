/**
 * Draft Episode 1 workflow package.
 *
 * Clearly DRAFT and noncanonical. Uses labeled proxy occupants only.
 * Cannot auto-promote to a canonical / production episode.
 */
import { PROXY_PIPELINE_BRIEF } from '../fixtures';
import { advanceWorkflow, summarizeWorkflow, type WorkflowRun } from '../workflow';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';

export const EPISODE_1_DRAFT_LABEL = 'DRAFT_NONCANONICAL' as const;

export const EPISODE_1_DRAFT_BRIEF = {
  ...PROXY_PIPELINE_BRIEF,
  episodeId: 'E1_DRAFT_NONCANONICAL',
  title: 'Draft Episode 1 — Meadow Notice (noncanonical)',
  logline: 'Two labeled stand-ins notice a small map glow and try a kind first step.',
  seed: 'tivvlejoy-episode-1-draft-noncanonical-v1',
  storyApproved: false,
  characterMode: 'PROXY' as const,
};

export function buildEpisode1DraftPackage(): {
  label: typeof EPISODE_1_DRAFT_LABEL;
  productionEligible: false;
  canonical: false;
  storyApproved: false;
  theatricalEligible: false;
  workflow: WorkflowRun;
  summary: ReturnType<typeof summarizeWorkflow>;
  version: typeof PREPRODUCTION_SUBSYSTEM_VERSIONS.episode1;
} {
  const workflow = advanceWorkflow(EPISODE_1_DRAFT_BRIEF);
  return {
    label: EPISODE_1_DRAFT_LABEL,
    productionEligible: false,
    canonical: false,
    storyApproved: false,
    theatricalEligible: false,
    workflow,
    summary: summarizeWorkflow(workflow),
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.episode1,
  };
}

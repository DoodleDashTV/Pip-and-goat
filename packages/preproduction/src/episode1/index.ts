/**
 * Draft Episode 1 workflow package.
 *
 * Clearly DRAFT and noncanonical. Uses labeled proxy occupants only.
 * Cannot auto-promote to a canonical / production episode. Does not
 * synthesise voices or animate founding characters.
 */
import { PROXY_WATERMARK } from '../proxy';
import { advanceWorkflow, summarizeWorkflow, type WorkflowRun } from '../workflow';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { validateContinuityAgainstCanon, evaluateCanonPromotion } from '../canon';
import { trackShotDependencies, invalidateShots } from '../dependencies';
import { recordArtifactVersion } from '../versioning';
import { compileDraftMux } from '../assembly';
import { specifyReusableLibrary } from '../library';
import type { StoryBrief } from '../story';

export const EPISODE_1_DRAFT_LABEL = 'DRAFT_NONCANONICAL' as const;

export const EPISODE_1_DRAFT_BRIEF: StoryBrief = {
  episodeId: 'E1_DRAFT_NONCANONICAL',
  title: 'Draft Episode 1 — The Meadow Glow (noncanonical)',
  logline:
    'Two labeled stand-ins notice a tiny map glow at the meadow edge, pause when the first try is incomplete, and choose a kinder step together.',
  theme: 'notice first, then try a kind step',
  seed: 'tivvlejoy-episode-1-draft-noncanonical-v2',
  characterMode: 'PROXY',
  targetDurationSeconds: 30,
  storyApproved: false,
  requestedOccupants: ['PROXY_NONCANONICAL_BIRD_A', 'PROXY_NONCANONICAL_QUADRUPED_A'],
};

export const EPISODE_1_STORY_NOTES = {
  label: EPISODE_1_DRAFT_LABEL,
  canonical: false as const,
  productionEligible: false as const,
  synthesisedVoices: false as const,
  foundingCharactersAnimated: false as const,
  beats: [
    {
      purpose: 'HOOK',
      note: 'Proxy Bird A spots a tiny gold shimmer on a map stone at the meadow edge.',
    },
    {
      purpose: 'SETUP',
      note: 'Proxy Quadruped A names a careful first look so the glow is treated as a clue, not a prize.',
    },
    {
      purpose: 'DISCOVERY',
      note: 'Both stand-ins see the map glow reframe the problem as a kindness to try together.',
    },
    {
      purpose: 'COMPLICATION',
      note: 'The first try is playful but incomplete; Proxy Bird A pauses instead of rushing.',
    },
    {
      purpose: 'TURN',
      note: 'Proxy Quadruped A offers the kinder step; Proxy Bird A chooses it.',
    },
    {
      purpose: 'PAYOFF',
      note: 'They use the lesson about noticing first, then trying a kind step.',
    },
    {
      purpose: 'RESOLUTION',
      note: 'The map is put away and the meadow is left as they found it.',
    },
    {
      purpose: 'BUTTON',
      note: 'A gentle hook: what will they notice next?',
    },
  ],
} as const;

const LIGHTING_FOR_PURPOSE: Record<string, string> = {
  HOOK: 'MEADOW_DAY_KEY',
  SETUP: 'MEADOW_DAY_SOFT',
  DISCOVERY: 'DISCOVERY_GOLDEN',
  COMPLICATION: 'GENTLE_OVERCAST',
  TURN: 'MEADOW_DAY_SOFT',
  PAYOFF: 'DISCOVERY_GOLDEN',
  RESOLUTION: 'MEADOW_DAY_KEY',
  BUTTON: 'MEADOW_DAY_SOFT',
};

export function buildEpisode1Manifests(workflow: WorkflowRun) {
  const library = specifyReusableLibrary(workflow.bundle.draft);
  const purposeByBeat = new Map(workflow.bundle.draft.beats.map((beat) => [beat.beatId, beat.purpose]));
  return {
    label: EPISODE_1_DRAFT_LABEL,
    watermark: PROXY_WATERMARK,
    productionEligible: false as const,
    canonical: false as const,
    camera: workflow.bundle.shotPlan.shots.map((shot) => ({
      shotId: shot.shotId,
      beatId: shot.beatId,
      composition: shot.composition,
      move: shot.move,
      lensMm: shot.lensMm,
      captionSafe: shot.captionSafe,
      aspect: '9:16' as const,
      renderTier: 'DRAFT' as const,
      productionEligible: false as const,
    })),
    lighting: workflow.bundle.draft.beats.map((beat) => ({
      beatId: beat.beatId,
      recipe: LIGHTING_FOR_PURPOSE[beat.purpose] ?? library.lightingRecipe,
      writesProductionLibrary: false as const,
    })),
    environment: library.specifications.environments.map((entry) => ({
      ...entry,
      label: EPISODE_1_DRAFT_LABEL,
    })),
    props: library.specifications.props.map((entry) => ({
      ...entry,
      label: EPISODE_1_DRAFT_LABEL,
    })),
    vfx: library.specifications.vfx.map((entry) => ({
      ...entry,
      label: EPISODE_1_DRAFT_LABEL,
    })),
    audioCues: workflow.bundle.audio.tracks.map((track) => ({
      trackId: track.trackId,
      kind: track.kind,
      voiceId: track.kind === 'PLACEHOLDER' ? track.voiceId : undefined,
      synthesised: false as const,
      requiresPaidProvider: false as const,
      lockedVoicesUntouched: true as const,
    })),
    purposeByBeat: Object.fromEntries(purposeByBeat),
  };
}

export function validateEpisode1Draft(workflow: WorkflowRun) {
  const continuity = validateContinuityAgainstCanon({
    draft: workflow.bundle.draft,
    ledger: workflow.bundle.continuity,
  });
  const canon = evaluateCanonPromotion(workflow.bundle.draft);
  const dependencies = trackShotDependencies({
    draft: workflow.bundle.draft,
    storyboard: workflow.bundle.storyboard,
    animatic: workflow.bundle.animatic,
    shotPlan: workflow.bundle.shotPlan,
  });
  const firstBeat = workflow.bundle.draft.beats[0];
  const invalidation = firstBeat
    ? invalidateShots(dependencies.dependencies, { kind: 'BEAT', id: firstBeat.beatId })
    : { dirtyShotIds: [], paidRerender: false as const };
  return {
    label: EPISODE_1_DRAFT_LABEL,
    continuityOk: continuity.ok,
    dangling: continuity.dangling,
    canonAllowed: canon.allowed,
    shotCount: dependencies.dependencies.length,
    missingLinks: dependencies.dependencies.filter((entry) => !entry.panelId || !entry.clipId).length,
    invalidationPaidRerender: invalidation.paidRerender,
    occupants: workflow.bundle.draft.occupants,
  };
}

export function buildEpisode1DraftPackage(): {
  label: typeof EPISODE_1_DRAFT_LABEL;
  productionEligible: false;
  canonical: false;
  storyApproved: false;
  theatricalEligible: false;
  brief: typeof EPISODE_1_DRAFT_BRIEF;
  storyNotes: typeof EPISODE_1_STORY_NOTES;
  workflow: WorkflowRun;
  summary: ReturnType<typeof summarizeWorkflow>;
  continuity: ReturnType<typeof validateContinuityAgainstCanon>;
  canon: ReturnType<typeof evaluateCanonPromotion>;
  dependencies: ReturnType<typeof trackShotDependencies>;
  validation: ReturnType<typeof validateEpisode1Draft>;
  versions: ReturnType<typeof recordArtifactVersion>[];
  manifests: ReturnType<typeof buildEpisode1Manifests>;
  mux: ReturnType<typeof compileDraftMux>;
  version: typeof PREPRODUCTION_SUBSYSTEM_VERSIONS.episode1;
} {
  const workflow = advanceWorkflow(EPISODE_1_DRAFT_BRIEF);
  const continuity = validateContinuityAgainstCanon({
    draft: workflow.bundle.draft,
    ledger: workflow.bundle.continuity,
  });
  const canon = evaluateCanonPromotion(workflow.bundle.draft);
  const dependencies = trackShotDependencies({
    draft: workflow.bundle.draft,
    storyboard: workflow.bundle.storyboard,
    animatic: workflow.bundle.animatic,
    shotPlan: workflow.bundle.shotPlan,
  });
  const versions = [
    recordArtifactVersion({ kind: 'STORY', cacheKey: workflow.bundle.draft.cacheKey }),
    recordArtifactVersion({ kind: 'STORYBOARD', cacheKey: workflow.bundle.storyboard.cacheKey }),
    recordArtifactVersion({ kind: 'ANIMATIC', cacheKey: workflow.bundle.animatic.cacheKey }),
    recordArtifactVersion({ kind: 'SHOT_PLAN', cacheKey: workflow.bundle.shotPlan.cacheKey }),
  ];
  const mux = compileDraftMux({
    animatic: workflow.bundle.animatic,
    audio: workflow.bundle.audio,
    outputPath: 'artifacts/studio-hardening-17-24/episode-1-draft.mp4',
  });
  return {
    label: EPISODE_1_DRAFT_LABEL,
    productionEligible: false,
    canonical: false,
    storyApproved: false,
    theatricalEligible: false,
    brief: EPISODE_1_DRAFT_BRIEF,
    storyNotes: EPISODE_1_STORY_NOTES,
    workflow,
    summary: summarizeWorkflow(workflow),
    continuity,
    canon,
    dependencies,
    validation: validateEpisode1Draft(workflow),
    versions,
    manifests: buildEpisode1Manifests(workflow),
    mux,
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.episode1,
  };
}

import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001DeliveryArchiveManifest } from '@/lib/tivvlejoy-ep001-delivery-archive-manifest';

export const SEASON_ONE_EPISODE_PRODUCTION_BLUEPRINT_SCHEMA =
  'TIVVLEJOY_SEASON_ONE_EPISODE_PRODUCTION_BLUEPRINT_V1' as const;

const STAGES = [
  ['STORY_PACKAGE', 'Story, beat, dialogue, continuity, and human story approval'],
  ['SCENERY_PACKAGE', 'Approved scenery roles, source identities, licenses, and world assembly plan'],
  ['VOICE_PACKAGE', 'Approved character voice identities, exact line receipts, and timing'],
  ['RIG_ADMISSION', 'Exact artist rigs, controls, poses, deformation review, and human approval'],
  ['ANIMATION_RELEASE', 'Contact readiness, blocking plan, voice timing, continuity, and explicit animation release'],
  ['ANIMATION_QA', 'Stepped blocking, spline polish, facial performance, contacts, continuity, and human playblast review'],
  ['FINAL_RENDER_RELEASE', 'Approved animation, exact worker image, cost cap, and explicit paid-render authorization'],
  ['FINAL_MEDIA_QA', 'Exact encoded-media identity, decode/audio/visual/title-safe QA, and human media approval'],
  ['PUBLISHING_RELEASE', 'Destination, metadata, audience/platform checklist, and explicit upload authorization'],
  ['DELIVERY_ARCHIVE', 'Canonical artifacts, hashes, provenance, immutable versioning, and restore verification'],
] as const;

export function compileSeasonOneEpisodeProductionBlueprint() {
  const ep001Archive = compileEp001DeliveryArchiveManifest();
  const futureEpisodeIds = Array.from({ length: 59 }, (_, index) => `EP${String(index + 2).padStart(3, '0')}`);

  const body = {
    schemaVersion: SEASON_ONE_EPISODE_PRODUCTION_BLUEPRINT_SCHEMA,
    seasonId: 'SEASON_01' as const,
    proofEpisodeId: 'EP001' as const,
    proofArchiveManifestSha256: ep001Archive.archiveManifestSha256,
    state: 'BLUEPRINT_READY_FUTURE_EPISODES_NOT_INSTANTIATED' as const,
    lockedDeliveryDefaults: {
      width: 1080 as const,
      height: 1920 as const,
      aspectRatio: '9:16' as const,
      fps: 30 as const,
      targetDurationSeconds: 60 as const,
      targetFrameCount: 1800 as const,
    },
    futureEpisodeIds,
    stages: STAGES.map(([stageId, acceptancePurpose], index) => ({
      order: index + 1,
      stageId,
      acceptancePurpose,
      defaultState: 'NOT_STARTED' as const,
      humanGateRequired: true as const,
      autoApprovalAllowed: false as const,
    })),
    perEpisodeRequiredBindings: [
      'Unique episode production-package SHA-256',
      'Exact story approval receipt',
      'Exact scenery binding manifest and license evidence',
      'Exact approved voice/audio timing receipts',
      'Exact admitted Pip and Goat rig SHA-256 values',
      'Episode-specific animation plan, playblast, and visual approval receipts',
      'Exact final-render authorization and immutable worker image identity',
      'Exact final encoded-media SHA-256 and media-QA receipt',
      'Explicit platform publishing authorization if publishing is requested',
      'Immutable delivery archive manifest and restore proof',
    ],
    inheritanceRules: [
      'Inherit quality gates and safety rules, never EP001 story-specific evidence or approvals.',
      'Every episode receives new hashes, receipts, human decisions, and authorization identities.',
      'No prior episode rig approval substitutes for verifying the exact rig version used by a new episode if the rig changes.',
      'No paid authorization, upload authorization, or human approval carries forward automatically.',
      'Episode-specific story, scenery, dialogue, animation, and final-media decisions remain independently reviewable.',
      'A reusable template may reduce setup work but cannot weaken any fail-closed gate.',
    ],
    metrics: {
      seasonEpisodeCount: 60 as const,
      proofEpisodeCount: 1 as const,
      futureEpisodeCount: futureEpisodeIds.length,
      stageCountPerEpisode: STAGES.length,
    },
    authority: {
      futureEpisodesInstantiated: false as const,
      episodeExecutionAllowed: false as const,
      paidComputeAllowed: false as const,
      publishingAllowed: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      generatedEpisodeRecords: 0 as const,
      networkCalls: 0 as const,
      paidRequests: 0 as const,
      storageMutations: 0 as const,
      productionMutations: 0 as const,
    },
  };

  return { ...body, blueprintSha256: sha256Canonical(body) };
}

export type SeasonOneEpisodeProductionBlueprint = ReturnType<typeof compileSeasonOneEpisodeProductionBlueprint>;

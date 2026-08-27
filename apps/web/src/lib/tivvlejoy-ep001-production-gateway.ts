import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001RigDeliveryContract } from '@/lib/tivvlejoy-ep001-rig-delivery-contract';
import { compileEp001RigInspectionProtocol } from '@/lib/tivvlejoy-ep001-rig-inspection-protocol';
import { compileEp001RigReviewWorksheet } from '@/lib/tivvlejoy-ep001-rig-review-worksheet';
import { compileEp001AnimationReleaseGate } from '@/lib/tivvlejoy-ep001-animation-release-gate';
import { compileEp001FinalRenderReleaseGate } from '@/lib/tivvlejoy-ep001-final-render-release-gate';
import { compileEp001PublishingReleaseGate } from '@/lib/tivvlejoy-ep001-publishing-release-gate';
import { compileEp001DeliveryArchiveManifest } from '@/lib/tivvlejoy-ep001-delivery-archive-manifest';
import { compileSeasonOneEpisodeProductionBlueprint } from '@/lib/tivvlejoy-season-one-episode-production-blueprint';

export const EP001_PRODUCTION_GATEWAY_SCHEMA =
  'TIVVLEJOY_EP001_PRODUCTION_GATEWAY_V1' as const;

export function compileEp001ProductionGateway() {
  const rigDelivery = compileEp001RigDeliveryContract();
  const rigInspection = compileEp001RigInspectionProtocol();
  const rigReview = compileEp001RigReviewWorksheet();
  const animationRelease = compileEp001AnimationReleaseGate();
  const finalRenderRelease = compileEp001FinalRenderReleaseGate();
  const publishingRelease = compileEp001PublishingReleaseGate();
  const archive = compileEp001DeliveryArchiveManifest();
  const seasonBlueprint = compileSeasonOneEpisodeProductionBlueprint();

  const stages = [
    {
      stageId: 'ARTIST_RIG_DELIVERY',
      label: 'Artist rig delivery',
      route: '/episode-one/rig-delivery',
      state: 'WAITING_ON_EXTERNAL_DELIVERY' as const,
      readyDefinition: 'Delivery contract ready; real corrected character rigs have not been admitted.',
      artifactSha256: rigDelivery.contractSha256,
    },
    {
      stageId: 'RIG_INSPECTION',
      label: 'Rig inspection protocol',
      route: '/episode-one/rig-inspection',
      state: 'PLAN_READY_INPUT_BLOCKED' as const,
      readyDefinition: `${rigInspection.checks.length} blocking checks across ${rigInspection.stages.length} stages are defined.`,
      artifactSha256: rigInspection.protocolSha256,
    },
    {
      stageId: 'RIG_REVIEW',
      label: 'Rig review worksheet',
      route: '/episode-one/rig-review',
      state: 'PLAN_READY_INPUT_BLOCKED' as const,
      readyDefinition: `Pip ${rigReview.characters.find((item) => item.characterId === 'PIP')?.rows.length} checks; Goat ${rigReview.characters.find((item) => item.characterId === 'GOAT')?.rows.length} checks; all results unreviewed until real files arrive.`,
      artifactSha256: rigReview.worksheetSha256,
    },
    {
      stageId: 'ANIMATION_RELEASE',
      label: 'Animation release gate',
      route: '/episode-one/animation-release',
      state: 'BLOCKED' as const,
      readyDefinition: 'Exact approved rigs, voice timing, contacts, continuity, and human animation release are required.',
      artifactSha256: animationRelease.releaseGateSha256,
    },
    {
      stageId: 'FINAL_RENDER_RELEASE',
      label: 'Final render release gate',
      route: '/episode-one/final-render-release',
      state: 'BLOCKED' as const,
      readyDefinition: 'Approved animation, evidence, immutable worker identity, cost cap, paid authorization, and human release are required.',
      artifactSha256: finalRenderRelease.finalRenderGateSha256,
    },
    {
      stageId: 'PUBLISHING_RELEASE',
      label: 'Publishing release gate',
      route: '/episode-one/publishing-release',
      state: 'BLOCKED' as const,
      readyDefinition: 'Exact final media must pass media QA and explicit destination-specific publishing authorization.',
      artifactSha256: publishingRelease.publishingGateSha256,
    },
    {
      stageId: 'DELIVERY_ARCHIVE',
      label: 'Delivery archive manifest',
      route: '/episode-one/delivery-archive',
      state: 'TEMPLATE_READY_INPUT_BLOCKED' as const,
      readyDefinition: `${archive.artifacts.length} canonical delivery artifacts are defined; none are claimed present.`,
      artifactSha256: archive.archiveManifestSha256,
    },
    {
      stageId: 'SEASON_ONE_BLUEPRINT',
      label: 'Season 1 production blueprint',
      route: '/season-one/production-blueprint',
      state: 'BLUEPRINT_READY' as const,
      readyDefinition: `${seasonBlueprint.metrics.futureEpisodeCount} future episode IDs share the quality/safety template without inheriting EP001 approvals.`,
      artifactSha256: seasonBlueprint.blueprintSha256,
    },
  ];

  const body = {
    schemaVersion: EP001_PRODUCTION_GATEWAY_SCHEMA,
    episodeId: 'EP001' as const,
    workingTitle: rigDelivery.workingTitle,
    state: 'EXTERNAL_RIG_DELIVERY_IS_CURRENT_CRITICAL_PATH' as const,
    currentCriticalPath: {
      owner: 'EXTERNAL_CHARACTER_ARTIST' as const,
      requiredInputs: ['Corrected Goat production rig', 'Corrected Pip production rig'] as const,
      nextInternalActionAfterDelivery: 'Record exact bytes and SHA-256, preserve source, run rig inspection, then request human visual approval.' as const,
    },
    stages,
    summary: {
      stageCount: stages.length,
      externalWaitingCount: stages.filter((stage) => stage.state === 'WAITING_ON_EXTERNAL_DELIVERY').length,
      planOrTemplateReadyCount: stages.filter((stage) => stage.state.includes('READY')).length,
      blockedExecutionCount: stages.filter((stage) => stage.state === 'BLOCKED').length,
      paidExecutionAuthorizedCount: 0 as const,
      productionMutationAuthorizedCount: 0 as const,
      publishingAuthorizedCount: 0 as const,
    },
    operatorSequence: [
      'Receive the artist-delivered character source without modifying the original.',
      'Record exact byte size and SHA-256 before inspection.',
      'Run the character-specific rig inspection and review worksheet.',
      'Stop at explicit human visual approval; never auto-admit a technically passing rig.',
      'After both exact rigs are approved, evaluate the animation release gate.',
      'After animation/playblast approval, evaluate final-render release and obtain new exact paid authorization if needed.',
      'After final encoded media QA, obtain explicit destination-specific publishing authorization if publishing is requested.',
      'Archive the exact approved artifacts and receipts by immutable identity.',
    ],
    authority: {
      rigAdmissionAllowed: false as const,
      animationExecutionAllowed: false as const,
      paidComputeAllowed: false as const,
      finalRenderAllowed: false as const,
      publishingAllowed: false as const,
      archiveWriteAllowed: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      sourceBytesIncluded: false as const,
      blenderLaunched: false as const,
      paidRequests: 0 as const,
      networkCalls: 0 as const,
      storageMutations: 0 as const,
      productionMutations: 0 as const,
      externalPostsCreated: 0 as const,
    },
  };

  return { ...body, gatewaySha256: sha256Canonical(body) };
}

export type Ep001ProductionGateway = ReturnType<typeof compileEp001ProductionGateway>;

import { sampleEpisodeWithKnownHashes } from '@/lib/tivvlejoy-episode-scene-planner';
import { evaluateAudienceEngagement } from './evaluate';
import { passingEp012Blueprint } from './fixtures';
import { getApprovedPilot } from './pilots';
import {
  STUDIO_ENGAGEMENT_PIPELINE,
  type AudienceEngagementBlueprint,
  type AudienceEngagementReport,
} from './types';

export type EngagementPipelineAdvisory = {
  pipeline: typeof STUDIO_ENGAGEMENT_PIPELINE;
  episodeId: string;
  title: string;
  dialogueRefs: readonly string[];
  blueprint: AudienceEngagementBlueprint;
  report: AudienceEngagementReport;
  nextExistingStageAfterHumanApproval: 'EXISTING_RENDER_READINESS';
  doesNotReplaceShotAssembly: true;
  doesNotReplacePreflight: true;
  doesNotReplaceVoiceAuthorization: true;
};

function blueprintFor(episodeId: string): AudienceEngagementBlueprint {
  if (episodeId === 'PILOT_1' || episodeId === 'PILOT_2' || episodeId === 'PILOT_3') {
    return getApprovedPilot(episodeId).blueprint;
  }
  return passingEp012Blueprint;
}

export function attachAudienceEngagementAdvisory(
  episodeId = 'EP012',
): EngagementPipelineAdvisory {
  const plan = sampleEpisodeWithKnownHashes();
  const blueprint = blueprintFor(episodeId);
  const report = evaluateAudienceEngagement(blueprint);
  return {
    pipeline: STUDIO_ENGAGEMENT_PIPELINE,
    episodeId: blueprint.episodeId,
    title: blueprint.title,
    dialogueRefs: episodeId === 'EP012' ? plan.storyBeats.flatMap((beat) => beat.dialogueRefs) : blueprint.dialogueRefs,
    blueprint,
    report,
    nextExistingStageAfterHumanApproval: 'EXISTING_RENDER_READINESS',
    doesNotReplaceShotAssembly: true,
    doesNotReplacePreflight: true,
    doesNotReplaceVoiceAuthorization: true,
  };
}

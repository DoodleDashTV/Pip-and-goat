import { comparePilotAnalytics, SYNTHETIC_PREVIEW_ANALYTICS } from './analytics';
import { RESEARCH_CITATIONS } from './citations';
import { evaluateAudienceEngagement } from './evaluate';
import { passingEp012Blueprint } from './fixtures';
import { attachAudienceEngagementAdvisory } from './pipeline';
import { APPROVED_PILOT_EXPERIMENTS } from './pilots';
import {
  FORBIDDEN_VIRALITY_LANGUAGE,
  KIDS_ENGAGEMENT_SCHEMA,
  STUDIO_ENGAGEMENT_PIPELINE,
  type AudienceEngagementReport,
  type PilotComparisonReport,
  type PilotExperiment,
  type ResearchCitation,
} from './types';

export const VIRALITY_HONESTY_NOTICE =
  'Research-informed guidance is not a guarantee of virality. No individual study proves a viral formula, and TivvleJoy does not calculate a viral score.';

export type AudienceEngagementConsoleModel = {
  framework: typeof KIDS_ENGAGEMENT_SCHEMA;
  notice: typeof VIRALITY_HONESTY_NOTICE;
  forbiddenLanguage: typeof FORBIDDEN_VIRALITY_LANGUAGE;
  pipeline: typeof STUDIO_ENGAGEMENT_PIPELINE;
  episode: {
    episodeId: string;
    title: string;
    dialogueRefs: readonly string[];
    report: AudienceEngagementReport;
    ageBands: readonly { ageBand: string; summary: string }[];
  };
  pilots: readonly {
    pilotId: PilotExperiment['pilotId'];
    title: string;
    primaryVariable: string;
    homeBaseOpportunity: string | null;
    approvedConceptOnly: true;
    readiness: AudienceEngagementReport['readiness'];
  }[];
  comparison: PilotComparisonReport;
  citations: readonly ResearchCitation[];
  syntheticPreviewOnly: true;
  productionConnected: false;
  externalAnalyticsConnected: false;
};

export function buildAudienceEngagementConsoleModel(): AudienceEngagementConsoleModel {
  const advisory = attachAudienceEngagementAdvisory('EP012');
  const ep012 = evaluateAudienceEngagement(passingEp012Blueprint);
  return {
    framework: KIDS_ENGAGEMENT_SCHEMA,
    notice: VIRALITY_HONESTY_NOTICE,
    forbiddenLanguage: FORBIDDEN_VIRALITY_LANGUAGE,
    pipeline: STUDIO_ENGAGEMENT_PIPELINE,
    episode: {
      episodeId: advisory.episodeId,
      title: advisory.title,
      dialogueRefs: advisory.dialogueRefs,
      report: ep012,
      ageBands: [
        {
          ageBand: 'AGES_5_7',
          summary: 'Clear visual objective, literal cause and effect, safe physical humor, short sentences, and strong readable expressions. No story-critical wordplay.',
        },
        {
          ageBand: 'AGES_8_10',
          summary: 'Additional inference, clever callbacks, light wordplay, layered motivation, and optional background clues that must not confuse younger viewers.',
        },
      ],
    },
    pilots: APPROVED_PILOT_EXPERIMENTS.map((pilot) => ({
      pilotId: pilot.pilotId,
      title: pilot.title,
      primaryVariable: pilot.primaryVariable,
      homeBaseOpportunity: pilot.homeBaseOpportunity,
      approvedConceptOnly: true as const,
      readiness: evaluateAudienceEngagement(pilot.blueprint).readiness,
    })),
    comparison: comparePilotAnalytics(SYNTHETIC_PREVIEW_ANALYTICS),
    citations: RESEARCH_CITATIONS,
    syntheticPreviewOnly: true,
    productionConnected: false,
    externalAnalyticsConnected: false,
  };
}

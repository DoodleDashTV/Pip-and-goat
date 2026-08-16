/**
 * Step 11 — Hook and retention planner.
 *
 * Advisory draft analytics only. Does not claim real audience performance.
 */
import { stableHash } from '@doodle-dash/direction';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import type { StoryDraft } from '../story';
import { DRAFT_NONCANONICAL, DRAFT_PIPELINE_CLASS } from './story-brain';

export function compileRetentionPlan(draft: StoryDraft): {
  label: typeof DRAFT_NONCANONICAL;
  outputClass: typeof DRAFT_PIPELINE_CLASS;
  advisoryOnly: true;
  claimsRealAudienceData: false;
  firstSecondVisualHook: string;
  firstThreeSecondStoryQuestion: string;
  pacingIntervals: Array<{ beatId: string; startSeconds: number; durationSeconds: number }>;
  curiosityGaps: string[];
  escalationPoints: string[];
  quietMoments: string[];
  payoffTimingSeconds: number;
  endingLoopPotential: boolean;
  retentionRiskFlags: string[];
  cacheKey: string;
  version: typeof PREPRODUCTION_SUBSYSTEM_VERSIONS.retention;
} {
  let cursor = 0;
  const pacingIntervals = draft.beats.map((beat) => {
    const startSeconds = cursor;
    cursor += beat.durationSeconds;
    return { beatId: beat.beatId, startSeconds, durationSeconds: beat.durationSeconds };
  });
  const hook = draft.beats.find((beat) => beat.purpose === 'HOOK');
  const discovery = draft.beats.find((beat) => beat.purpose === 'DISCOVERY');
  const complication = draft.beats.find((beat) => beat.purpose === 'COMPLICATION');
  const payoff = draft.beats.find((beat) => beat.purpose === 'PAYOFF');
  const button = draft.beats.find((beat) => beat.purpose === 'BUTTON');
  const payoffTimingSeconds = pacingIntervals.find((entry) => entry.beatId === payoff?.beatId)?.startSeconds ?? cursor;
  const flags: string[] = [];
  if ((hook?.durationSeconds ?? 0) < 2) flags.push('HOOK_SHORTER_THAN_TWO_SECONDS');
  if (payoffTimingSeconds > 24) flags.push('PAYOFF_AFTER_24S');
  if (cursor < 20 || cursor > 40) flags.push('DURATION_OUTSIDE_30S_WINDOW');
  const record = {
    label: DRAFT_NONCANONICAL,
    outputClass: DRAFT_PIPELINE_CLASS,
    advisoryOnly: true as const,
    claimsRealAudienceData: false as const,
    firstSecondVisualHook: hook?.summary ?? draft.logline,
    firstThreeSecondStoryQuestion: `What will they notice about ${draft.theme}?`,
    pacingIntervals,
    curiosityGaps: discovery ? [discovery.summary] : [],
    escalationPoints: complication ? [complication.summary] : [],
    quietMoments: draft.beats.filter((beat) => beat.purpose === 'RESOLUTION').map((beat) => beat.summary),
    payoffTimingSeconds,
    endingLoopPotential: Boolean(button),
    retentionRiskFlags: flags,
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.retention,
  };
  return {
    ...record,
    cacheKey: stableHash({ version: record.version, episodeId: draft.episodeId, pacingIntervals, flags }),
  };
}

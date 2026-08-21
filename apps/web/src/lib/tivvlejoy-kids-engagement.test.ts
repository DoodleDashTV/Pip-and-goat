import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PIP_VOICE_GUIDE, GOAT_VOICE_GUIDE } from './voice-production/guides';
import { EP012_CANONICAL_DIALOGUE_SHA256 } from './tivvlejoy-real-production-unblock/ep012-canonical-dialogue';
import {
  APPROVED_PILOT_EXPERIMENTS,
  FORBIDDEN_CHILD_OR_VIEWER_KEYS,
  FORBIDDEN_VIRALITY_LANGUAGE,
  KIDS_ENGAGEMENT_SCHEMA,
  STUDIO_ENGAGEMENT_PIPELINE,
  ZERO_SIDE_EFFECTS,
  acceptPilotAnalyticsSnapshot,
  attachAudienceEngagementAdvisory,
  buildAudienceEngagementConsoleModel,
  comparePilotAnalytics,
  createKidsEngagementSideEffectTracker,
  deceptiveLoopBlueprint,
  evaluateAudienceEngagement,
  excessiveAudioBlueprint,
  incompleteCausalChainBlueprint,
  injuryHumorBlueprint,
  missingProcessingBeatsBlueprint,
  naturalReplayBlueprint,
  negativeEmotionHookBlueprint,
  olderWordplayCarriesPlotBlueprint,
  passingEp012Blueprint,
  personalityViolationBlueprint,
  recordHumanEngagementApproval,
  selectPilotWinner,
  unclearGoalBlueprint,
  unrelatedFocalMotionBlueprint,
} from './tivvlejoy-kids-engagement';

const repoRoot = path.resolve(__dirname, '../../../..');

function readRepo(relative: string) {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

const engagementSources = [
  'apps/web/src/lib/tivvlejoy-kids-engagement/types.ts',
  'apps/web/src/lib/tivvlejoy-kids-engagement/evaluate.ts',
  'apps/web/src/lib/tivvlejoy-kids-engagement/analytics.ts',
  'apps/web/src/lib/tivvlejoy-kids-engagement/pilots.ts',
  'apps/web/src/lib/tivvlejoy-kids-engagement/pipeline.ts',
  'apps/web/src/lib/tivvlejoy-kids-engagement/console-model.ts',
  'apps/web/src/lib/tivvlejoy-kids-engagement/fixtures.ts',
  'apps/web/src/components/preview/AudienceEngagementConsole.tsx',
  'apps/web/src/app/audience-engagement/page.tsx',
  'docs/TIVVLEJOY_RESEARCH_INFORMED_KIDS_ENGAGEMENT_V1.md',
];

describe('TIVVLEJOY_RESEARCH_INFORMED_KIDS_ENGAGEMENT_V1', () => {
  it('blocks an unclear or missing goal', () => {
    const report = evaluateAudienceEngagement(unclearGoalBlueprint());
    expect(report.checks.find((item) => item.code === 'VISIBLE_GOAL')?.state).toBe('BLOCKED');
    expect(report.readiness).toBe('BLOCKED');
  });

  it('blocks an incomplete causal chain', () => {
    const report = evaluateAudienceEngagement(incompleteCausalChainBlueprint());
    expect(report.checks.find((item) => item.code === 'CAUSAL_STORY_CHAIN')?.state).toBe('BLOCKED');
    expect(report.readiness).toBe('BLOCKED');
  });

  it('blocks negative-emotion manipulation', () => {
    const report = evaluateAudienceEngagement(negativeEmotionHookBlueprint());
    expect(report.checks.find((item) => item.code === 'POSITIVE_AROUSAL_HOOK')?.state).toBe('BLOCKED');
    expect(report.readiness).toBe('BLOCKED');
  });

  it('blocks injury- or humiliation-based humor', () => {
    const report = evaluateAudienceEngagement(injuryHumorBlueprint());
    expect(report.checks.find((item) => item.code === 'SAFE_HUMOR')?.state).toBe('BLOCKED');
    expect(report.readiness).toBe('BLOCKED');
  });

  it('marks unrelated focal motion as NEEDS_REVISION', () => {
    const report = evaluateAudienceEngagement(unrelatedFocalMotionBlueprint());
    expect(report.checks.find((item) => item.code === 'FOCAL_MOTION')?.state).toBe('NEEDS_REVISION');
    expect(report.readiness).toBe('NEEDS_REVISION');
  });

  it('marks excessive or unsupported sound as NEEDS_REVISION', () => {
    const report = evaluateAudienceEngagement(excessiveAudioBlueprint());
    expect(report.checks.find((item) => item.code === 'RELEVANT_AUDIO')?.state).toBe('NEEDS_REVISION');
    expect(report.readiness).toBe('NEEDS_REVISION');
  });

  it('reports missing processing beats', () => {
    const report = evaluateAudienceEngagement(missingProcessingBeatsBlueprint());
    expect(report.missingProcessingBeats).toEqual(['discoveries', 'choices', 'reactions']);
    expect(report.checks.find((item) => item.code === 'PACING_AND_PROCESSING')?.state).toBe('NEEDS_REVISION');
  });

  it('blocks Pip and Goat personality violations', () => {
    const report = evaluateAudienceEngagement(personalityViolationBlueprint());
    expect(report.checks.find((item) => item.code === 'CHARACTER_CONSISTENCY')?.state).toBe('BLOCKED');
    expect(report.readiness).toBe('BLOCKED');
  });

  it('blocks older-audience wordplay that carries a younger plot fact', () => {
    const report = evaluateAudienceEngagement(olderWordplayCarriesPlotBlueprint());
    expect(report.checks.find((item) => item.code === 'AGE_BAND_LAYERING')?.state).toBe('BLOCKED');
    expect(report.readiness).toBe('BLOCKED');
  });

  it('accepts a natural replay cue', () => {
    const report = evaluateAudienceEngagement(naturalReplayBlueprint());
    expect(report.checks.find((item) => item.code === 'REPLAY_DESIGN')?.state).toBe('PASS');
    expect(report.readiness).toBe('READY_FOR_HUMAN_REVIEW');
  });

  it('rejects a deceptive endless loop', () => {
    const report = evaluateAudienceEngagement(deceptiveLoopBlueprint());
    expect(report.checks.find((item) => item.code === 'REPLAY_DESIGN')?.state).toBe('BLOCKED');
    expect(report.readiness).toBe('BLOCKED');
  });

  it('cannot set human approval automatically', () => {
    const ready = evaluateAudienceEngagement(passingEp012Blueprint);
    expect(ready.readiness).toBe('READY_FOR_HUMAN_REVIEW');
    expect(ready.humanApproval).toBeNull();
    expect(ready.humanApprovalSetAutomatically).toBe(false);
    const rejected = recordHumanEngagementApproval(ready, { actor: 'SYSTEM', decision: 'APPROVE' });
    expect(rejected.readiness).toBe('READY_FOR_HUMAN_REVIEW');
    expect(rejected.humanApproval).toBeNull();
    const blocked = evaluateAudienceEngagement(unclearGoalBlueprint());
    const stillBlocked = recordHumanEngagementApproval(blocked, { actor: 'HUMAN', decision: 'APPROVE' });
    expect(stillBlocked.readiness).toBe('BLOCKED');
    const approved = recordHumanEngagementApproval(ready, { actor: 'HUMAN', decision: 'APPROVE' });
    expect(approved.readiness).toBe('HUMAN_APPROVED');
    expect(approved.humanApproval?.actor).toBe('HUMAN');
    expect(approved.humanApproval?.automatic).toBe(false);
  });

  it('accepts unavailable pilot analytics fields', () => {
    const accepted = acceptPilotAnalyticsSnapshot({
      pilotId: 'PILOT_2',
      observationWindow: '7d',
      views: null,
      engagedViews: null,
      viewedVersusSwipedAway: null,
      averageViewDurationSec: null,
      averagePercentageViewed: null,
      retentionMarkers: null,
      replayOrRepeatedViewIndicators: null,
      likes: null,
      shares: null,
      uniqueViewers: null,
      productionTimeMinutes: null,
      renderCostUsd: null,
      humanComprehensionNotes: null,
      humanEnjoymentNotes: null,
      humanReplayInterestNotes: null,
      source: 'MANUAL_AGGREGATE',
    });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.snapshot.views).toBeNull();
      expect(accepted.snapshot.uniqueViewers).toBeNull();
      expect(accepted.snapshot.externalAnalyticsContacted).toBe(false);
    }
  });

  it('rejects child-level or viewer-identifying analytics fields', () => {
    for (const key of FORBIDDEN_CHILD_OR_VIEWER_KEYS) {
      const accepted = acceptPilotAnalyticsSnapshot({
        pilotId: 'PILOT_1',
        observationWindow: '24h',
        [key]: 'should-not-enter',
      });
      expect(accepted.ok).toBe(false);
      if (!accepted.ok) {
        expect(accepted.rejectedKeys).toContain(key);
      }
    }
    const snapshot = JSON.stringify(
      acceptPilotAnalyticsSnapshot({
        pilotId: 'PILOT_1',
        observationWindow: '24h',
        views: 10,
      }),
    );
    for (const key of ['username', 'childId', 'viewerId', 'comments']) {
      expect(snapshot).not.toContain(`"${key}":`);
    }
  });

  it('cannot select a pilot winner from raw views alone', () => {
    const high = acceptPilotAnalyticsSnapshot({
      pilotId: 'PILOT_1',
      observationWindow: '24h',
      views: 50000,
    });
    const low = acceptPilotAnalyticsSnapshot({
      pilotId: 'PILOT_2',
      observationWindow: '24h',
      views: 12,
    });
    expect(high.ok && low.ok).toBe(true);
    if (!high.ok || !low.ok) return;
    const compared = comparePilotAnalytics([high.snapshot, low.snapshot]);
    expect(compared.selectedWinnerPilotId).toBeNull();
    expect(compared.viewsAloneSelectedWinner).toBe(false);
    expect(compared.humanMustSelectWinner).toBe(true);
    expect(compared.automaticBatchAuthorized).toBe(false);
    expect(compared.automaticSpendAuthorized).toBe(false);
    const machine = selectPilotWinner(compared, { actor: 'SYSTEM', winningPilotId: 'PILOT_1' });
    expect(machine.selectedWinnerPilotId).toBeNull();
    const human = selectPilotWinner(compared, { actor: 'HUMAN', winningPilotId: 'PILOT_2' });
    expect(human.selectedWinnerPilotId).toBe('PILOT_2');
    expect(human.winnerSelectedBy).toBe('HUMAN');
    expect(human.automaticBatchAuthorized).toBe(false);
  });

  it('does not invoke paid transport, GPU, storage, scenery, or external analytics adapters', () => {
    const tracker = createKidsEngagementSideEffectTracker();
    const report = evaluateAudienceEngagement(passingEp012Blueprint);
    const accepted = acceptPilotAnalyticsSnapshot({
      pilotId: 'PILOT_3',
      observationWindow: '28d',
    });
    const advisory = attachAudienceEngagementAdvisory('EP012');
    const model = buildAudienceEngagementConsoleModel();
    expect(accepted.ok).toBe(true);
    expect(report).toMatchObject(ZERO_SIDE_EFFECTS);
    expect(advisory.report).toMatchObject(ZERO_SIDE_EFFECTS);
    expect(model.productionConnected).toBe(false);
    expect(model.externalAnalyticsConnected).toBe(false);
    expect(tracker).toEqual({
      providerContacted: 0,
      sceneryAccessed: 0,
      gpuLaunched: 0,
      paidCompute: 0,
      voiceGenerated: 0,
      commercialBytesDownloaded: 0,
      externalAnalyticsContacted: 0,
      productionMutated: 0,
      storageWritten: 0,
    });
    const joined = engagementSources.map(readRepo).join('\n');
    expect(joined).not.toMatch(/elevenlabs|runpod|cloudflarestorage|youtube\.googleapis|analyticsdata|@aws-sdk\/client-s3/i);
    expect(joined).not.toMatch(/DoodleDash/i);
  });

  it('is deterministic across repeated runs', () => {
    const first = evaluateAudienceEngagement(passingEp012Blueprint);
    const second = evaluateAudienceEngagement(passingEp012Blueprint);
    expect(first).toEqual(second);
    expect(first.reportSha256).toBe(second.reportSha256);
    const leftAccepted = acceptPilotAnalyticsSnapshot({ pilotId: 'PILOT_1', observationWindow: '24h', views: 9 });
    const rightAccepted = acceptPilotAnalyticsSnapshot({ pilotId: 'PILOT_1', observationWindow: '24h', views: 9 });
    expect(leftAccepted.ok && rightAccepted.ok).toBe(true);
    if (!leftAccepted.ok || !rightAccepted.ok) return;
    expect(comparePilotAnalytics([leftAccepted.snapshot])).toEqual(comparePilotAnalytics([rightAccepted.snapshot]));
  });

  it('registers the three approved pilots as planning-only concepts', () => {
    expect(APPROVED_PILOT_EXPERIMENTS.map((pilot) => pilot.title)).toEqual([
      'Goat, Don’t Press That Button!',
      'Can You Find the Missing Map Piece?',
      'The Cloud That Was Afraid to Thunder',
    ]);
    expect(APPROVED_PILOT_EXPERIMENTS[0]?.homeBaseOpportunity).toBe('Neighborhood Shops');
    expect(APPROVED_PILOT_EXPERIMENTS.every((pilot) => pilot.approvedConceptOnly)).toBe(true);
    expect(APPROVED_PILOT_EXPERIMENTS.every((pilot) => pilot.finalScriptApproved === false)).toBe(true);
    expect(APPROVED_PILOT_EXPERIMENTS.every((pilot) => evaluateAudienceEngagement(pilot.blueprint).readiness === 'READY_FOR_HUMAN_REVIEW')).toBe(true);
  });

  it('keeps locked Pip and Goat identities and voices unchanged', () => {
    expect(PIP_VOICE_GUIDE.personality).toEqual(['curious', 'cheerful', 'kind', 'enthusiastic']);
    expect(GOAT_VOICE_GUIDE.personality).toEqual(['warm', 'playful', 'adventurous', 'loyal']);
    expect(EP012_CANONICAL_DIALOGUE_SHA256).toBe('f0b85a04a301359750d59da9699b2d7c26f0acee6d517b83e80fd9420aeb1ac4');
    expect(passingEp012Blueprint.dialogueRefs).toEqual([
      'DL_HOOK_01',
      'DL_DISCOVERY_01',
      'DL_DECISION_01',
      'DL_ACTION_01',
      'DL_COMPLICATION_01',
      'DL_PAYOFF_01',
      'DL_BUTTON_01',
    ]);
  });

  it('wires Preview navigation and documents the framework without forbidden virality language', () => {
    const shell = readRepo('apps/web/src/components/StudioShell.tsx');
    const ui = readRepo('apps/web/src/components/preview/AudienceEngagementConsole.tsx');
    const planner = readRepo('apps/web/src/components/preview/EpisodeScenePlanner.tsx');
    const docs = readRepo('docs/TIVVLEJOY_RESEARCH_INFORMED_KIDS_ENGAGEMENT_V1.md');
    expect(shell).toContain("{ href: '/audience-engagement', label: 'Audience Engagement' }");
    expect(ui).toContain('Not a guarantee of virality');
    expect(ui).toContain('Pilot Lab');
    expect(ui).toContain('disabled={!approvalEnabled}');
    expect(planner).toContain('Open Audience Engagement');
    expect(docs).toContain(KIDS_ENGAGEMENT_SCHEMA);
    expect(docs).toContain('10.1509/jmr.10.0353');
    expect(STUDIO_ENGAGEMENT_PIPELINE[0]).toBe('EPISODE_CONCEPT');
    expect(STUDIO_ENGAGEMENT_PIPELINE).toContain('EXISTING_RENDER_READINESS');
    for (const phrase of FORBIDDEN_VIRALITY_LANGUAGE) {
      expect(ui).not.toContain(phrase);
    }
    expect(docs).toContain('Forbidden language includes');
    expect(ui).not.toMatch(/DoodleDash/i);
    expect(planner).not.toMatch(/DoodleDash/i);
  });
});

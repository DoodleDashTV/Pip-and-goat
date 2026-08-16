/**
 * Closed-gate Steps 9–16 acceptance orchestration.
 *
 * Produces a DRAFT_NONCANONICAL / PIPELINE_TEST_ONLY report. Never claims a
 * completed, animated, canonical, publishable, or production-ready episode.
 */
import { currentStage, evaluateTheatricalGate } from '@doodle-dash/direction';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { evaluateEpisodeLaunchSafety, evaluatePaidResourcePolicy } from '../launch-safety';
import { assertSteps9To16StillClosed, planSteps9To16Infrastructure } from '../closed-stages';
import { trackShotDependencies } from '../dependencies';
import { planPartialRerender, restoreCachedPlan } from '../cache';
import { profileLocalWorkflow } from '../profile';
import { buildProvenance, listDraftReferenceProvenance } from '../provenance';
import { draftAnalytics, estimateDraftCost } from '../analytics';
import { checkpointWorkflow, detectCorruption, resumeFromCheckpoint } from '../recovery';
import { compileStoryBrain } from './story-brain';
import { compileContinuityDatabase } from './continuity-db';
import { compileRetentionPlan } from './retention';
import { compileClosedStoryboard } from './storyboard-compiler';
import { compileClosedAnimatic } from './animatic-compiler';
import { compileVisualQc, type VisualProbe } from './visual-qc';
import { compileMotionAudioQc, type AudioProbe } from './motion-audio-qc';
import { planAutoRepair } from './auto-repair';
import { DRAFT_NONCANONICAL, DRAFT_PIPELINE_CLASS } from './story-brain';
import type { StoryBrief } from '../story';
import type { WorkflowRun } from '../workflow';

export function compileClosedStepsAcceptance(input: {
  brief: StoryBrief;
  workflow: WorkflowRun;
  sourceCommit: string;
  outputPath: string;
  probe?: VisualProbe & AudioProbe;
}): {
  label: typeof DRAFT_NONCANONICAL;
  outputClass: typeof DRAFT_PIPELINE_CLASS;
  completedEpisode: false;
  animatedEpisode: false;
  canonicalEpisode: false;
  publishable: false;
  productionReady: false;
  currentStage: 'DDP_STEPS_1_8';
  theatricalAllowed: false;
  steps9To16Opened: false;
  storyPlan: ReturnType<typeof compileStoryBrain>;
  continuityLedger: ReturnType<typeof compileContinuityDatabase>;
  retentionPlan: ReturnType<typeof compileRetentionPlan>;
  storyboard: ReturnType<typeof compileClosedStoryboard>;
  animatic: ReturnType<typeof compileClosedAnimatic>;
  visualQc: ReturnType<typeof compileVisualQc>;
  motionQc: ReturnType<typeof compileMotionAudioQc>;
  audioQc: ReturnType<typeof compileMotionAudioQc>;
  autoRepair: ReturnType<typeof planAutoRepair>;
  dependencies: ReturnType<typeof trackShotDependencies>;
  cachePlan: ReturnType<typeof planPartialRerender>;
  checkpoint: ReturnType<typeof checkpointWorkflow>;
  provenance: ReturnType<typeof buildProvenance>;
  analytics: ReturnType<typeof draftAnalytics>;
  profile: ReturnType<typeof profileLocalWorkflow>;
  resume: ReturnType<typeof resumeFromCheckpoint>;
  cost: ReturnType<typeof estimateDraftCost>;
  finalDraftAcceptance: {
    status: 'DRAFT_PIPELINE_TEST_ONLY';
    technical: 'PASS' | 'FAIL';
    artistic: 'NOT_RENDERED';
    reason: string;
  };
  version: typeof PREPRODUCTION_SUBSYSTEM_VERSIONS.stepsClosed;
} {
  assertSteps9To16StillClosed();
  const closed = planSteps9To16Infrastructure();
  const stage = currentStage();
  const theatrical = evaluateTheatricalGate();
  if (stage.id !== 'DDP_STEPS_1_8' || theatrical.allowed || closed.opened) {
    throw new Error('Refuse: closed-gate Steps 9–16 infrastructure cannot run if the theatrical gate is open.');
  }

  const draft = input.workflow.bundle.draft;
  const storyPlan = compileStoryBrain({ brief: input.brief, draft });
  const continuityLedger = compileContinuityDatabase(draft);
  const retentionPlan = compileRetentionPlan(draft);
  const storyboard = compileClosedStoryboard(draft);
  const animatic = compileClosedAnimatic({
    draft,
    storyboard: input.workflow.bundle.storyboard,
    audio: input.workflow.bundle.audio,
    outputPath: input.outputPath,
  });
  const dependencies = trackShotDependencies({
    draft,
    storyboard: input.workflow.bundle.storyboard,
    animatic: input.workflow.bundle.animatic,
    shotPlan: input.workflow.bundle.shotPlan,
  });
  const autoRepair = planAutoRepair({
    storyboard: input.workflow.bundle.storyboard,
    animatic: input.workflow.bundle.animatic,
    audio: input.workflow.bundle.audio,
    dependencies: dependencies.dependencies,
  });
  const visualQc = compileVisualQc({
    storyboard: autoRepair.repairedStoryboard,
    animatic: autoRepair.repairedAnimatic,
    probe: input.probe,
  });
  const motionAudioQc = compileMotionAudioQc({
    animatic: autoRepair.repairedAnimatic,
    audio: input.workflow.bundle.audio,
    probe: input.probe,
  });
  const cachePlan = planPartialRerender({
    animatic: autoRepair.repairedAnimatic,
    orchestration: input.workflow.bundle.orchestration,
    shotPlan: input.workflow.bundle.shotPlan,
  });
  restoreCachedPlan({ cacheKey: cachePlan.cacheKeys[cachePlan.reuse[0] ?? ''] ?? cachePlan.cacheKeys[Object.keys(cachePlan.cacheKeys)[0] ?? ''] ?? 'none', plan: input.workflow.bundle.shotPlan });
  const checkpoint = checkpointWorkflow(input.workflow);
  const resume = resumeFromCheckpoint({ checkpoint, run: input.workflow });
  detectCorruption(checkpoint, input.workflow);
  const provenance = buildProvenance({
    sourceCommit: input.sourceCommit,
    episodeId: input.workflow.episodeId,
    cacheKey: input.workflow.cacheKey,
    inputs: { seed: input.brief.seed, occupants: draft.occupants, storyBrain: storyPlan.cacheKey },
    mediaCommandHash: animatic.mux.filterGraph,
    qcHash: visualQc.cacheKey,
  });
  const analytics = draftAnalytics(input.workflow);
  const profile = profileLocalWorkflow(input.brief);
  const cost = estimateDraftCost({ estimateUsd: 1 });
  const launch = evaluateEpisodeLaunchSafety({
    command: 'generate-final',
    intent: 'FINAL',
    characterMode: draft.characterMode,
    occupants: draft.occupants,
  });
  const paid = evaluatePaidResourcePolicy({ allowPaidGpu: true, estimateUsd: 1 });
  if (launch.allowed || paid.allowed || listDraftReferenceProvenance().some((entry) => entry.productionLibraryPath)) {
    throw new Error('Refuse: closed-gate acceptance saw an open launch, paid, or library path.');
  }

  const technical =
    visualQc.technical === 'PASS' &&
    motionAudioQc.technical === 'PASS' &&
    continuityLedger.readiness.ok &&
    storyPlan.promotion.allowed === false
      ? 'PASS'
      : 'FAIL';

  return {
    label: DRAFT_NONCANONICAL,
    outputClass: DRAFT_PIPELINE_CLASS,
    completedEpisode: false,
    animatedEpisode: false,
    canonicalEpisode: false,
    publishable: false,
    productionReady: false,
    currentStage: 'DDP_STEPS_1_8',
    theatricalAllowed: false,
    steps9To16Opened: false,
    storyPlan,
    continuityLedger,
    retentionPlan,
    storyboard,
    animatic,
    visualQc,
    motionQc: motionAudioQc,
    audioQc: motionAudioQc,
    autoRepair,
    dependencies,
    cachePlan,
    checkpoint,
    provenance,
    analytics,
    profile,
    resume,
    cost,
    finalDraftAcceptance: {
      status: 'DRAFT_PIPELINE_TEST_ONLY',
      technical,
      artistic: 'NOT_RENDERED',
      reason: 'Character-independent proxy package only. Not a completed, animated, canonical, or publishable episode.',
    },
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.stepsClosed,
  };
}

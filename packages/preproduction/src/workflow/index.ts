/**
 * Episode-production workflow engine for the character-independent track.
 *
 * Walks BRIEF → STORY → CONTINUITY → STORYBOARD → ANIMATIC → SHOTS →
 * LIBRARY → AUDIO → ORCHESTRATION → QC → OUTPUT_GATE. Terminals are
 * pipeline-test complete, story-plan ready, or blocked. The engine cannot
 * reach FINAL_RENDER, THEATRICAL, or PUBLISHING.
 *
 * Pure: composes `runPreproduction()`. Persistence lives in
 * `@doodle-dash/production` so this package stays free of database I/O.
 */
import { z } from 'zod';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { errorsOf, issueStatus, type PlanIssue } from '../schema';
import { StoryBriefSchema } from '../story';
import { runPreproduction, type PreproductionBundle } from '../pipeline';
import { evaluateWorkflowReadiness } from '../launch-safety';

export const WORKFLOW_STAGES = [
  'BRIEF',
  'STORY',
  'CONTINUITY',
  'STORYBOARD',
  'ANIMATIC',
  'SHOTS',
  'LIBRARY',
  'AUDIO',
  'ORCHESTRATION',
  'QC',
  'OUTPUT_GATE',
] as const;
export type WorkflowStageId = (typeof WORKFLOW_STAGES)[number];

export const WORKFLOW_TERMINALS = [
  'PIPELINE_TEST_COMPLETE',
  'STORY_PLAN_READY',
  'BLOCKED',
] as const;
export type WorkflowTerminal = (typeof WORKFLOW_TERMINALS)[number];

export const FORBIDDEN_WORKFLOW_TERMINALS = ['FINAL_RENDER', 'THEATRICAL', 'PUBLISHING'] as const;

export const WorkflowStageSchema = z.object({
  id: z.enum(WORKFLOW_STAGES),
  status: z.enum(['DONE', 'BLOCKED', 'SKIPPED']),
  errorCount: z.number().int().min(0),
});
export type WorkflowStage = z.infer<typeof WorkflowStageSchema>;

export const WorkflowRunSchema = z.object({
  episodeId: z.string(),
  stages: z.array(WorkflowStageSchema).length(WORKFLOW_STAGES.length),
  currentStage: z.enum(WORKFLOW_STAGES),
  terminal: z.enum(WORKFLOW_TERMINALS),
  mayContinueToFinal: z.literal(false),
  mayContinueToTheatrical: z.literal(false),
  mayPublish: z.literal(false),
  cacheKey: z.string(),
  version: z.literal(PREPRODUCTION_SUBSYSTEM_VERSIONS.workflow),
});
export type WorkflowRun = z.infer<typeof WorkflowRunSchema> & {
  bundle: PreproductionBundle;
  issues: PlanIssue[];
  readiness: ReturnType<typeof evaluateWorkflowReadiness>;
};

const STAGE_SYSTEM: Record<Exclude<WorkflowStageId, 'BRIEF' | 'OUTPUT_GATE'>, string> = {
  STORY: 'story',
  CONTINUITY: 'continuity',
  STORYBOARD: 'storyboard',
  ANIMATIC: 'animatic',
  SHOTS: 'shotplan',
  LIBRARY: 'library',
  AUDIO: 'audio',
  ORCHESTRATION: 'orchestration',
  QC: 'qc',
};

function stageFromIssues(id: WorkflowStageId, issues: readonly PlanIssue[]): WorkflowStage {
  if (id === 'BRIEF') {
    return { id, status: 'DONE', errorCount: 0 };
  }
  if (id === 'OUTPUT_GATE') {
    const gateErrors = issues.filter((issue) => issue.system === 'gates' && issue.severity === 'ERROR');
    return {
      id,
      status: gateErrors.length > 0 ? 'BLOCKED' : 'DONE',
      errorCount: gateErrors.length,
    };
  }
  const system = STAGE_SYSTEM[id];
  const errorCount = issues.filter((issue) => issue.system === system && issue.severity === 'ERROR').length;
  return { id, status: errorCount > 0 ? 'BLOCKED' : 'DONE', errorCount };
}

function resolveTerminal(bundle: PreproductionBundle): WorkflowTerminal {
  if (errorsOf(bundle.issues).length > 0 || bundle.status === 'FAIL') return 'BLOCKED';
  if (bundle.draft.characterMode === 'PROXY' || bundle.outputClass === 'PIPELINE_TEST') {
    return 'PIPELINE_TEST_COMPLETE';
  }
  if (bundle.scenePlan && bundle.draft.storyApproved && bundle.outputClass === 'STORY_APPROVED_PLAN') {
    return 'STORY_PLAN_READY';
  }
  return 'BLOCKED';
}

export function advanceWorkflow(input: Parameters<typeof StoryBriefSchema.parse>[0]): WorkflowRun {
  const brief = StoryBriefSchema.parse(input);
  const bundle = runPreproduction(brief);
  const stages = WORKFLOW_STAGES.map((id) => stageFromIssues(id, bundle.issues));
  const blocked = stages.find((stage) => stage.status === 'BLOCKED');
  const terminal = resolveTerminal(bundle);
  const currentStage = blocked?.id ?? 'OUTPUT_GATE';
  const readiness = evaluateWorkflowReadiness({
    characterMode: bundle.draft.characterMode,
    outputClass: bundle.outputClass,
    qcTechnical: bundle.qc.technical,
    qcArtistic: bundle.qc.artistic,
    scenePlanEmitted: bundle.scenePlan !== null,
  });

  const run = WorkflowRunSchema.parse({
    episodeId: bundle.draft.episodeId,
    stages,
    currentStage,
    terminal,
    mayContinueToFinal: false,
    mayContinueToTheatrical: false,
    mayPublish: false,
    cacheKey: bundle.cacheKey,
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.workflow,
  });

  return {
    ...run,
    bundle,
    issues: bundle.issues,
    readiness,
  };
}

export function summarizeWorkflow(run: WorkflowRun) {
  return {
    episodeId: run.episodeId,
    title: run.bundle.draft.title,
    characterMode: run.bundle.draft.characterMode,
    occupants: run.bundle.draft.occupants,
    outputClass: run.bundle.outputClass,
    terminal: run.terminal,
    currentStage: run.currentStage,
    status: run.bundle.status,
    issueStatus: issueStatus(run.issues),
    errorCount: errorsOf(run.issues).length,
    scenePlanEmitted: run.bundle.scenePlan !== null,
    qcTechnical: run.bundle.qc.technical,
    qcArtistic: run.bundle.qc.artistic,
    mayContinueToFinal: run.mayContinueToFinal,
    mayContinueToTheatrical: run.mayContinueToTheatrical,
    mayPublish: run.mayPublish,
    readiness: run.readiness,
    stages: run.stages,
    cacheKey: run.cacheKey,
    paidGpu: false,
    writesProductionLibrary: run.bundle.library.writesProductionLibrary,
  };
}

export function isForbiddenWorkflowTerminal(value: string): boolean {
  return (FORBIDDEN_WORKFLOW_TERMINALS as readonly string[]).includes(value);
}

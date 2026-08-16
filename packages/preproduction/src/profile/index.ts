/**
 * Local performance profiling and bottleneck evidence.
 *
 * Times a local planner walk. Does not launch renders or paid work.
 */
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { advanceWorkflow } from '../workflow';
import type { StoryBrief } from '../story';

export function profileLocalWorkflow(brief: StoryBrief): {
  elapsedMs: number;
  stageCount: number;
  bottleneck: string;
  paid: false;
  version: typeof PREPRODUCTION_SUBSYSTEM_VERSIONS.profile;
} {
  const started = Date.now();
  const run = advanceWorkflow(brief);
  const elapsedMs = Math.max(0, Date.now() - started);
  const blocked = run.stages.find((stage) => stage.status === 'BLOCKED');
  return {
    elapsedMs,
    stageCount: run.stages.length,
    bottleneck: blocked?.id ?? 'OUTPUT_GATE',
    paid: false,
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.profile,
  };
}

/**
 * Local render-cache and partial-rerender planning.
 *
 * Cache keys are deterministic hashes of planner inputs. A restore never skips
 * QC or safety gates and never enters FINAL_RENDER or production-library.
 */
import { stableHash } from '@doodle-dash/direction';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import type { AnimaticPlan } from '../animatic';
import type { OrchestrationPlan } from '../orchestration';
import type { ShotPlan } from '../shotplan';

export function buildRenderCacheKey(input: {
  shotId: string;
  animaticCacheKey: string;
  shotPlanCacheKey: string;
  dirty: boolean;
}): string {
  return stableHash({
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.cache,
    shotId: input.shotId,
    animaticCacheKey: input.animaticCacheKey,
    shotPlanCacheKey: input.shotPlanCacheKey,
    dirty: input.dirty,
    paid: false,
  });
}

export function planPartialRerender(input: {
  animatic: AnimaticPlan;
  orchestration: OrchestrationPlan;
  shotPlan?: ShotPlan;
  dirtyClipIds?: readonly string[];
}): {
  reuse: string[];
  rerenderLocal: string[];
  cacheKeys: Record<string, string>;
  paidRetry: false;
  maySkipQc: false;
  maySkipSafety: false;
  mayEnterFinal: false;
  version: typeof PREPRODUCTION_SUBSYSTEM_VERSIONS.cache;
} {
  const dirty = new Set(input.dirtyClipIds ?? []);
  const reuse: string[] = [];
  const rerenderLocal: string[] = [];
  const cacheKeys: Record<string, string> = {};
  for (const clip of input.animatic.clips) {
    const isDirty = dirty.has(clip.clipId);
    if (isDirty) rerenderLocal.push(clip.clipId);
    else reuse.push(clip.clipId);
    cacheKeys[clip.clipId] = buildRenderCacheKey({
      shotId: clip.clipId,
      animaticCacheKey: input.animatic.cacheKey,
      shotPlanCacheKey: input.shotPlan?.cacheKey ?? input.orchestration.cacheKey,
      dirty: isDirty,
    });
  }
  return {
    reuse,
    rerenderLocal,
    cacheKeys,
    paidRetry: false,
    maySkipQc: false,
    maySkipSafety: false,
    mayEnterFinal: false,
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.cache,
  };
}

export function restoreCachedPlan<T>(entry: { cacheKey: string; plan: T }): {
  plan: T;
  cacheKey: string;
  mustReevaluateQc: true;
  mustReevaluateSafety: true;
  maySkipGates: false;
  mayEnterFinal: false;
  writesProductionLibrary: false;
} {
  return {
    plan: entry.plan,
    cacheKey: entry.cacheKey,
    mustReevaluateQc: true,
    mustReevaluateSafety: true,
    maySkipGates: false,
    mayEnterFinal: false,
    writesProductionLibrary: false,
  };
}

/**
 * Local render-cache and partial-rerender planning.
 *
 * Advisory only. Reuses cache keys. Never launches a paid retry.
 */
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import type { AnimaticPlan } from '../animatic';
import type { OrchestrationPlan } from '../orchestration';

export function planPartialRerender(input: {
  animatic: AnimaticPlan;
  orchestration: OrchestrationPlan;
  dirtyClipIds?: readonly string[];
}): {
  reuse: string[];
  rerenderLocal: string[];
  paidRetry: false;
  version: typeof PREPRODUCTION_SUBSYSTEM_VERSIONS.cache;
} {
  const dirty = new Set(input.dirtyClipIds ?? []);
  const reuse: string[] = [];
  const rerenderLocal: string[] = [];
  for (const clip of input.animatic.clips) {
    if (dirty.has(clip.clipId)) rerenderLocal.push(clip.clipId);
    else reuse.push(clip.clipId);
  }
  return {
    reuse,
    rerenderLocal,
    paidRetry: false,
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.cache,
  };
}

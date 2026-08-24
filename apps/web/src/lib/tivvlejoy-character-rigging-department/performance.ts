export type PerformanceCounters = {
  sceneLoadMs: number | null;
  rigEvaluationMs: number | null;
  playbackFps: number | null;
  peakMemoryMb: number | null;
  evaluatedMeshCount: number | null;
  modifierCostMs: number | null;
  renderInitMs: number | null;
  renderImpactMs: number | null;
};

export type PerformanceReport = {
  counters: PerformanceCounters;
  destructiveOptimizationForbiddenWithoutProfile: true;
  recommendations: readonly string[];
  state: 'BLOCKED_REAL_EXECUTION_REQUIRED' | 'PROFILED';
};

export function compilePerformanceReport(counters: PerformanceCounters | null): PerformanceReport {
  if (!counters || counters.sceneLoadMs == null) {
    return {
      counters: {
        sceneLoadMs: null,
        rigEvaluationMs: null,
        playbackFps: null,
        peakMemoryMb: null,
        evaluatedMeshCount: null,
        modifierCostMs: null,
        renderInitMs: null,
        renderImpactMs: null,
      },
      destructiveOptimizationForbiddenWithoutProfile: true,
      recommendations: [
        'Profile the WORKING copy after a real Blender attach.',
        'Do not decimate Goat to an old polygon target without measured benefit.',
      ],
      state: 'BLOCKED_REAL_EXECUTION_REQUIRED',
    };
  }
  const recommendations: string[] = [];
  if (counters.playbackFps != null && counters.playbackFps < 24) {
    recommendations.push('Playback is below 24 fps. Inspect modifiers and evaluated mesh count before any decimate.');
  }
  if (recommendations.length === 0) {
    recommendations.push('No destructive optimization recommended from the supplied counters.');
  }
  return {
    counters,
    destructiveOptimizationForbiddenWithoutProfile: true,
    recommendations,
    state: 'PROFILED',
  };
}

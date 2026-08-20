import type { Ep012SceneryRole, FirstEpisodeSceneryMinimum, FirstReadPlan, InspectionOrder, InspectionOrderItem } from './types';

function unique(roles: readonly Ep012SceneryRole[]): Ep012SceneryRole[] {
  return [...new Set(roles)];
}

export function compileInspectionOrder(input: {
  plan: FirstReadPlan;
  scenery: FirstEpisodeSceneryMinimum;
}): InspectionOrder {
  const ranked = [...input.plan.selected].sort((a, b) => {
    const aHits = a.expectedSemanticRoles.filter((role) => input.scenery.required.includes(role)).length;
    const bHits = b.expectedSemanticRoles.filter((role) => input.scenery.required.includes(role)).length;
    const aScore = aHits / Math.max(1, a.expectedDownloadBytes);
    const bScore = bHits / Math.max(1, b.expectedDownloadBytes);
    if (bScore !== aScore) return bScore - aScore;
    return a.expectedDownloadBytes - b.expectedDownloadBytes || a.sourceId.localeCompare(b.sourceId);
  });

  const items: InspectionOrderItem[] = [];
  let running = 0;
  const coverage: Ep012SceneryRole[] = [];
  ranked.forEach((item, index) => {
    const before = new Set(coverage);
    const added = item.expectedSemanticRoles.filter((role) => !before.has(role));
    coverage.push(...item.expectedSemanticRoles);
    running += item.expectedDownloadBytes;
    items.push({
      order: index + 1,
      objectIdentity: item.objectIdentity,
      sourceId: item.sourceId,
      bytes: item.expectedDownloadBytes,
      cumulativeBytes: running,
      rolesAdded: unique(added),
      expectedRoleCoverage: unique(coverage),
    });
  });

  return {
    inspectionOrder: items,
    cumulativeBytes: running,
    expectedRoleCoverage: unique(coverage),
    stopAfterEvidenceCondition:
      'Stop downloading more scenery as soon as inspected sources satisfy every required EP012 scenery role. Do not continue through the queue for completeness.',
  };
}

export function shouldStopInspection(input: {
  covered: readonly Ep012SceneryRole[];
  required: readonly Ep012SceneryRole[];
}): boolean {
  return input.required.every((role) => input.covered.includes(role));
}

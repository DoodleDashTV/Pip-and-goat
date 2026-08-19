import { sha256Canonical, stableSorted } from './hash';
import { BATCH_PLAN_SCHEMA, BATCH_SCHEDULER_SCHEMA, type WorkUnitType } from './types';

export type SchedulableUnit = {
  unitId: string;
  jobType: WorkUnitType;
  episodeId: string;
  shotId?: string;
  locationId?: string;
  lightingFamily?: string;
  approvedAssetFamily?: string;
  characterFamily?: string;
  priority?: number;
  blocked?: boolean;
  blockerLabel?: string;
  inputDependencySha256: string;
  dependsOn?: string[];
};

export type ProductionBatch = {
  batchId: string;
  jobType: WorkUnitType;
  locationId?: string;
  lightingFamily?: string;
  unitIds: string[];
  reuseOpportunity: string | null;
  blocked: boolean;
};

export type BatchPlan = {
  schemaVersion: typeof BATCH_PLAN_SCHEMA;
  schedulerVersion: typeof BATCH_SCHEDULER_SCHEMA;
  requestedEpisodeCount: number;
  units: number;
  batches: ProductionBatch[];
  parallelizableGroups: string[][];
  blockedGroups: string[][];
  criticalPath: string[];
  cacheReuse: string[];
  batchPlanSha256: string;
};

export function planProductionBatches(units: SchedulableUnit[]): BatchPlan {
  const sorted = [...units].sort((left, right) => {
    const priority = (right.priority ?? 0) - (left.priority ?? 0);
    if (priority) return priority;
    return `${left.jobType}:${left.locationId ?? ''}:${left.lightingFamily ?? ''}:${left.unitId}`.localeCompare(
      `${right.jobType}:${right.locationId ?? ''}:${right.lightingFamily ?? ''}:${right.unitId}`,
    );
  });
  const batches: ProductionBatch[] = [];
  const grouped = new Map<string, SchedulableUnit[]>();
  for (const unit of sorted) {
    const key = [unit.jobType, unit.locationId ?? 'NONE', unit.lightingFamily ?? 'NONE', unit.blocked ? 'BLOCKED' : 'OPEN'].join('::');
    grouped.set(key, [...(grouped.get(key) ?? []), unit]);
  }
  for (const [key, group] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const first = group[0]!;
    batches.push({
      batchId: `BATCH::${key}`,
      jobType: first.jobType,
      locationId: first.locationId,
      lightingFamily: first.lightingFamily,
      unitIds: group.map((item) => item.unitId).sort(),
      reuseOpportunity:
        first.locationId && group.length > 1
          ? `Reuse ${first.locationId} ${first.lightingFamily ?? 'lighting'} for ${group.length} units`
          : first.approvedAssetFamily && group.length > 1
            ? `Reuse approved family ${first.approvedAssetFamily}`
            : null,
      blocked: group.every((item) => item.blocked),
    });
  }

  const parallelizableGroups = batches.filter((batch) => !batch.blocked).map((batch) => batch.unitIds);
  const blockedGroups = batches.filter((batch) => batch.blocked).map((batch) => batch.unitIds);
  const criticalPath = sorted.filter((item) => item.blocked || item.jobType === 'SHOT_ASSEMBLY' || item.jobType === 'VOICE_PREP').map((item) => item.unitId);
  const cacheReuse = batches.filter((batch) => batch.reuseOpportunity).map((batch) => batch.reuseOpportunity!);
  const episodes = new Set(units.map((item) => item.episodeId));

  const body = {
    schemaVersion: BATCH_PLAN_SCHEMA,
    schedulerVersion: BATCH_SCHEDULER_SCHEMA,
    requestedEpisodeCount: episodes.size,
    units: units.length,
    batches,
    parallelizableGroups,
    blockedGroups,
    criticalPath: stableSorted(criticalPath),
    cacheReuse: stableSorted(cacheReuse),
  };
  return { ...body, batchPlanSha256: sha256Canonical({ batches: batches.map((batch) => ({ id: batch.batchId, units: batch.unitIds })), types: stableSorted(units.map((item) => item.jobType)) }) };
}

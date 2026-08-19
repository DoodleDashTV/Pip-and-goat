import { sceneryCoverageReport } from '@/lib/tivvlejoy-world-builder/coverage';
import type { BuiltEnvironment } from '@/lib/tivvlejoy-world-builder/engine';
import type { WorldBuilderInput } from '@/lib/tivvlejoy-world-builder/types';
import { assetGapDecision as planningAssetGapDecision } from '@/lib/tivvlejoy-world-builder/coverage';
import { normalizeSemanticRole } from './mapping';
import type { ApprovedAssetRegistry, LibraryCapabilityState, ProductionSemanticRole } from './types';

export function approvedLibraryCoverage(registry?: ApprovedAssetRegistry) {
  const planning = sceneryCoverageReport();
  const approvedRoles = new Set(registry?.assets.filter((asset) => asset.approvalState === 'APPROVED' && asset.worldBuilderEligible).flatMap((asset) => asset.semanticRoles) ?? []);
  const categories = Object.fromEntries(
    planning.productionReadyCategories.concat(planning.partialCategories).map((category) => {
      const hasApproved = Boolean(
        registry?.assets.some(
          (asset) => asset.approvalState === 'APPROVED' && asset.coverageCategories.includes(category),
        ),
      );
      const blocked = Boolean(
        registry?.assets.some((asset) => asset.coverageCategories.includes(category) && asset.approvalState === 'BLOCKED'),
      );
      const state: LibraryCapabilityState = hasApproved
        ? 'PARTIAL_APPROVED_LIBRARY'
        : blocked
          ? 'BLOCKED_LIBRARY_SOURCE'
          : 'PLANNED_NATIVE_CAPABILITY';
      return [category, state];
    }),
  );
  return {
    planningCoveragePercent: planning.coveragePercent,
    productionReadyInflated: false,
    approvedLogicalAssetCount: registry?.assets.filter((asset) => asset.approvalState === 'APPROVED').length ?? 0,
    approvedRoles: [...approvedRoles].sort(),
    categories,
    note: 'Planning coverage is not a production-ready score. Approved library capability is counted separately.',
  };
}

export function assetGapDecisionWithRegistry(
  env: BuiltEnvironment,
  input: WorldBuilderInput,
  registry?: ApprovedAssetRegistry,
) {
  const planned = planningAssetGapDecision(env, input);
  const required = (input.requiredHeroRoles ?? []).map((role) => {
    try {
      return normalizeSemanticRole(role);
    } catch {
      return role;
    }
  });
  const approvedMatch = required.filter((role) =>
    registry?.assets.some(
      (asset) =>
        asset.approvalState === 'APPROVED' &&
        asset.worldBuilderEligible &&
        asset.semanticRoles.includes(role as ProductionSemanticRole),
    ),
  );
  if (approvedMatch.length && approvedMatch.length === required.length) {
    return {
      ...planned,
      decision: 'REUSE_EXISTING' as const,
      purchaseRequired: 'NO' as const,
      missingSemanticRole: null,
      reasons: ['approved registry asset exists for the requested semantic role'],
    };
  }
  if (env.buildability === 'READY_WITH_NATIVE_PROCEDURAL' || env.buildability === 'READY_FROM_EXISTING_LIBRARY') {
    return planned.decision === 'PURCHASE_MAY_BE_JUSTIFIED' ? planned : { ...planned, decision: planned.decision };
  }
  return planned;
}

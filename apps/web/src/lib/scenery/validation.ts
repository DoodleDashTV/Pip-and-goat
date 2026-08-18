import { catalogById, parseCatalogAsset, type AssetCatalog, type ValidationFinding } from './catalog';
import { evaluateComposition } from './composition';
import { planSceneryScene, type ScenePlan, type SceneBrief } from './planner';
import { getRecipe } from './recipes';
import { listRegisteredSources, resolveSourcePresence } from './source-registry';
import { SUPPORTED_BLENDER_VERSION, SceneryError } from './types';

export interface SceneryValidationResult {
  ok: boolean;
  findings: ValidationFinding[];
  geometricBlenderRequired: boolean;
  geometricLimitation: string;
}

function finding(code: string, severity: ValidationFinding['severity'], message: string): ValidationFinding {
  return { code, severity, message };
}

export function validateCatalogRecord(asset: unknown): ValidationFinding[] {
  try {
    parseCatalogAsset(asset);
    return [];
  } catch (error) {
    return [finding('INVALID_CATALOG', 'error', error instanceof Error ? error.message : 'Invalid catalog record.')];
  }
}

export function validateSources(): ValidationFinding[] {
  return listRegisteredSources().map(resolveSourcePresence).flatMap((source) => {
    const findings: ValidationFinding[] = [];
    if (source.ingestionStatus === 'source_unavailable') {
      findings.push(finding('MISSING_SOURCE', 'error', `${source.sourceId} is source_unavailable.`));
    }
    if (source.supportedBlenderVersion !== SUPPORTED_BLENDER_VERSION) {
      findings.push(
        finding(
          'UNSUPPORTED_BLENDER',
          'error',
          `${source.sourceId} lists unsupported Blender ${source.supportedBlenderVersion}.`,
        ),
      );
    }
    if (!source.licenseProvenancePlaceholder) {
      findings.push(finding('MISSING_PROVENANCE', 'error', `${source.sourceId} is missing provenance.`));
    }
    findings.push(finding('MISSING_TEXTURE', 'warning', `${source.sourceId} textures have not been inspected.`));
    return findings;
  });
}

export function validateScenePlan(
  plan: ScenePlan,
  catalog: AssetCatalog,
  brief: SceneBrief,
): SceneryValidationResult {
  const findings: ValidationFinding[] = [];
  const recipe = getRecipe(brief.recipe);
  const byId = catalogById(catalog);

  if (brief.seed === undefined || brief.seed === null || Number.isNaN(Number(brief.seed))) {
    findings.push(finding('MISSING_SEED', 'error', 'A deterministic seed is required.'));
  }

  const sourceFindings = validateSources();
  findings.push(
    ...sourceFindings.map((item) =>
      plan.provenance.fixtureOnly && item.code === 'MISSING_SOURCE'
        ? { ...item, severity: 'warning' as const }
        : item,
    ),
  );

  for (const role of recipe.requiredRoles) {
    if (!plan.placements.some((item) => item.role === role)) {
      findings.push(finding('MISSING_ROLE', 'error', `Plan is missing required role ${role}.`));
    }
  }

  for (const placement of plan.placements) {
    const asset = byId.get(placement.assetId);
    if (!asset) {
      findings.push(finding('INVALID_CATALOG', 'error', `${placement.assetId} is not in the catalog.`));
      continue;
    }
    if (asset.approvalStatus === 'unapproved' || asset.approvalStatus === 'quarantined') {
      findings.push(finding('UNAPPROVED_ASSET', 'error', `${asset.assetId} is not approved for planning.`));
    }
    if (!asset.licensingProvenanceRef) {
      findings.push(finding('MISSING_PROVENANCE', 'error', `${asset.assetId} is missing provenance.`));
    }
    if (asset.approvalStatus !== 'fixture_only' && !asset.bytesInspected) {
      findings.push(finding('MISSING_SOURCE', 'error', `${asset.assetId} has not been inspected.`));
    }
  }

  if (plan.resourceEstimate.triangleCount > recipe.performanceBudget.maxTriangles) {
    findings.push(
      finding(
        'TRIANGLE_BUDGET',
        'error',
        `Triangle count ${plan.resourceEstimate.triangleCount} exceeds ${recipe.performanceBudget.maxTriangles}.`,
      ),
    );
  }
  if (!plan.textureDecision.withinBudget) {
    findings.push(
      finding(
        'TEXTURE_MEMORY',
        'error',
        `Estimated ${plan.textureDecision.estimatedMemoryMb} MB exceeds the ${plan.textureDecision.memoryBudgetMb} MB budget.`,
      ),
    );
  }

  const replay = planSceneryScene(catalog, brief);
  if (JSON.stringify(replay.placements) !== JSON.stringify(plan.placements) || replay.seed !== plan.seed) {
    findings.push(finding('NONDETERMINISTIC', 'error', 'Replaying the brief produced a different plan.'));
  }

  findings.push(...evaluateComposition(plan, catalog, recipe));

  const errors = findings.filter((item) => item.severity === 'error');
  return {
    ok: errors.length === 0,
    findings,
    geometricBlenderRequired: true,
    geometricLimitation:
      'Exact mesh intersection, occlusion, and origin inspection require Blender. This pass uses dry-run bounds fixtures only. Real Blender execution was not run.',
  };
}

export function assertValidScenePlan(plan: ScenePlan, catalog: AssetCatalog, brief: SceneBrief): void {
  const result = validateScenePlan(plan, catalog, brief);
  if (!result.ok) {
    const first = result.findings.find((item) => item.severity === 'error');
    throw new SceneryError(first?.message ?? 'Scene plan failed validation.', first?.code ?? 'INVALID_PLAN');
  }
}

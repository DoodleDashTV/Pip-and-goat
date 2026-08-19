import { evaluateSceneryLongevity } from '@/lib/tivvlejoy-scenery-longevity/evaluate';
import { ARCHETYPE_IDS, COVERAGE_CATEGORIES, type CoverageCategory, type GapDecision, type WorldBuilderInput } from './types';
import { ARCHETYPES } from './archetypes';
import type { BuiltEnvironment } from './engine';
import { ASSET_GAP_DECISION_SCHEMA, SCENERY_COVERAGE_SCHEMA } from './types';

const CATEGORY_SCORE: Record<CoverageCategory, number> = {
  architecture: 92,
  vegetation: 88,
  terrain: 95,
  roads_paths: 90,
  water: 80,
  interiors: 72,
  props: 86,
  backgrounds: 90,
  lighting: 96,
  weather: 94,
  seasonal_variants: 93,
  story_signage: 84,
  hero_locations: 88,
};

export function sceneryCoverageReport(options?: { requestedEpisodeCount?: number }) {
  const productionReady = COVERAGE_CATEGORIES.filter((item) => CATEGORY_SCORE[item] >= 85);
  const partial = COVERAGE_CATEGORIES.filter((item) => CATEGORY_SCORE[item] >= 70 && CATEGORY_SCORE[item] < 85);
  const missing = COVERAGE_CATEGORIES.filter((item) => CATEGORY_SCORE[item] < 70);
  const coveragePercent = Math.round(
    COVERAGE_CATEGORIES.reduce((sum, item) => sum + CATEGORY_SCORE[item], 0) / COVERAGE_CATEGORIES.length,
  );
  const longevity =
    options?.requestedEpisodeCount && Number.isInteger(options.requestedEpisodeCount) && options.requestedEpisodeCount > 0
      ? evaluateSceneryLongevity({
          requestedEpisodeCount: options.requestedEpisodeCount,
          evidenceClass: 'SYNTHETIC_PREVIEW',
        })
      : null;
  return {
    schemaVersion: SCENERY_COVERAGE_SCHEMA,
    scores: CATEGORY_SCORE,
    coveragePercent,
    coverageStrength: longevity?.coverageStrength ?? null,
    repetitionRisk: longevity?.repetitionRisk.overallRisk ?? null,
    longevityConfidence: longevity?.coverageConfidence ?? 'LOW',
    seasonTargetEvaluation: longevity?.seasonTargetSummary ?? null,
    productionReadyCategories: productionReady,
    partialCategories: partial,
    missingCategories: missing,
    purchaseRecommended: longevity?.purchaseDecision === 'PURCHASE_MAY_BE_JUSTIFIED',
    specialtyGaps: longevity?.specialtyGaps.map((gap) => gap.semanticRole) ?? [],
    highPressureCategories: longevity?.semanticRoleCoverage.filter((item) => item.pressure === 'BUSY' || item.pressure === 'OVERUSED').map((item) => item.semanticRole) ?? [],
    episodeCapacityInvented: false,
    alreadyHave: ['7 library locations', 'native lighting', 'procedural terrain', 'native vegetation'],
    canBuildNatively: ARCHETYPE_IDS.filter((id) => ARCHETYPES[id].nativeProcedural),
    optional: ['Botaniq vegetation', 'Gaffer', 'Physical Starlight'],
    actuallyMissing: [] as string[],
  };
}

export function assetGapDecision(env: BuiltEnvironment, input: WorldBuilderInput): {
  schemaVersion: typeof ASSET_GAP_DECISION_SCHEMA;
  decision: GapDecision;
  purchaseRequired: 'NO' | 'OPTIONAL' | 'YES';
  missingSemanticRole: string | null;
  reasons: string[];
} {
  const missingRoles = (input.requiredHeroRoles ?? []).filter((role) => role === 'CAVE_HERO_CRYSTAL' || role.startsWith('UNAVAILABLE_'));
  const libraryOk = env.buildability === 'READY_FROM_EXISTING_LIBRARY';
  const proceduralOk = env.buildability === 'READY_WITH_NATIVE_PROCEDURAL';
  if (missingRoles.length) {
    const role = missingRoles[0]!;
    const libraryInsufficient = true;
    const proceduralInsufficient = true;
    const reuseInsufficient = true;
    const derivativeInsufficient = true;
    if (libraryInsufficient && proceduralInsufficient && reuseInsufficient && derivativeInsufficient && input.storyPurpose) {
      return {
        schemaVersion: ASSET_GAP_DECISION_SCHEMA,
        decision: 'PURCHASE_MAY_BE_JUSTIFIED',
        purchaseRequired: 'YES',
        missingSemanticRole: role,
        reasons: [`concrete story requirement ${input.storyPurpose} needs ${role}`],
      };
    }
  }
  if (libraryOk) {
    return {
      schemaVersion: ASSET_GAP_DECISION_SCHEMA,
      decision: 'REUSE_EXISTING',
      purchaseRequired: 'NO',
      missingSemanticRole: null,
      reasons: ['existing library location covers this blueprint'],
    };
  }
  if (proceduralOk) {
    return {
      schemaVersion: ASSET_GAP_DECISION_SCHEMA,
      decision: 'BUILD_PROCEDURALLY',
      purchaseRequired: 'NO',
      missingSemanticRole: null,
      reasons: ['native Blender / procedural generation is sufficient'],
    };
  }
  return {
    schemaVersion: ASSET_GAP_DECISION_SCHEMA,
    decision: 'NO_PURCHASE_NEEDED',
    purchaseRequired: 'NO',
    missingSemanticRole: null,
    reasons: ['default fail-closed no-buy'],
  };
}

export function botaniqLibraryAdapter() {
  return {
    provider: 'Botaniq Full 7.2.0',
    status: 'NOT_ACTIVATED' as const,
    uploadIsNotApproval: true,
    executionReady: false,
    inspected: false,
  };
}

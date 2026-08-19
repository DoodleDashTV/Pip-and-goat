import type { ApprovedEnvironmentAsset } from '@/lib/tivvlejoy-approved-asset-registry/types';
import { ARCHETYPE_IDS, EXISTING_LOCATIONS, SEASONS, TIMES_OF_DAY, WEATHERS } from '@/lib/tivvlejoy-world-builder/types';
import { sha256Canonical, stableSorted } from './hash';
import {
  canonicalSupplyForRole,
  demandRiskFromLoad,
  maxRisk,
  pressureToRisk,
  reuseRiskFromShare,
  rolePressureFromDemand,
} from './pressure';
import { buildRepetitionRisk } from './risk';
import { assetsWithCategory, assetsWithRole, selectableApprovedAssets, uniqueCanonicalGroups } from './selectable';
import { environmentVisualSignatureSha256 } from './signature';
import {
  isInteriorArchetype,
  meaningfulSeasonFamilies,
  meaningfulTimeFamilies,
  meaningfulWeatherFamilies,
} from './variation';
import {
  DEFAULT_RECENT_WINDOW_SIZE,
  LONGEVITY_SCHEMA,
  PRESSURE_ROLES,
  SPECIALTY_STORY_ROLES,
  type CoverageStrength,
  type EpisodeUsageRecord,
  type LongevityConfidence,
  type LongevityPurchaseDecision,
  type PlannedEpisodeRequirement,
  type SceneryLongevityInput,
  type SceneryLongevityReport,
  type SemanticRolePressure,
  type SpecialtyGap,
} from './types';

export class InvalidLongevityTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidLongevityTargetError';
  }
}

function assertPositiveTarget(requestedEpisodeCount: number): void {
  if (!Number.isInteger(requestedEpisodeCount) || requestedEpisodeCount < 1) {
    throw new InvalidLongevityTargetError(
      'TIVVLEJOY_SCENERY_LONGEVITY_V1 requires a positive integer requestedEpisodeCount. It does not invent an episode ceiling.',
    );
  }
}

function coverageStrengthFromRatio(ratio: number): CoverageStrength {
  if (ratio >= 1.8) return 'EXCELLENT';
  if (ratio >= 1.05) return 'STRONG';
  if (ratio >= 0.7) return 'ADEQUATE';
  if (ratio >= 0.4) return 'THIN';
  return 'INSUFFICIENT';
}

function confidenceOf(input: SceneryLongevityInput, hasRegistry: boolean): LongevityConfidence {
  const evidence = input.evidenceClass ?? 'SYNTHETIC_PREVIEW';
  const history = input.episodeUsageHistory?.length ?? 0;
  const plan = input.plannedEpisodeRequirements?.length ?? 0;
  if (evidence === 'SYNTHETIC_PREVIEW' || !hasRegistry) return 'LOW';
  if (history >= 8 || plan >= Math.max(8, Math.floor(input.requestedEpisodeCount / 4))) return 'HIGH';
  return 'MEDIUM';
}

function plannedDemandForRole(
  role: string,
  requested: number,
  history: EpisodeUsageRecord[],
  plans: PlannedEpisodeRequirement[],
): number {
  const fromHistory = history.filter((item) => (item.requiredHeroRoles ?? []).includes(role)).length;
  const fromPlans = plans.filter((item) => (item.requiredHeroRoles ?? []).includes(role)).length;
  if (fromHistory || fromPlans) return fromHistory + fromPlans;
  if (role === 'BUILDING_HERO') return Math.ceil(requested * 0.08);
  if (role === 'INTERIOR_SHELL') return Math.ceil(requested * 0.05);
  if (role === 'TREE_HERO') return Math.ceil(requested * 0.07);
  if (role === 'MOUNTAIN_BACKGROUND') return Math.ceil(requested * 0.05);
  if (role === 'WATER') return Math.ceil(requested * 0.06);
  if (role === 'SKY' || role === 'BACKGROUND_FILL') return Math.ceil(requested * 0.09);
  if (role === 'SIGNAGE') return Math.ceil(requested * 0.05);
  return 0;
}

function nativeCanCover(role: string): boolean {
  return !SPECIALTY_STORY_ROLES.includes(role as (typeof SPECIALTY_STORY_ROLES)[number]);
}

function specialtyGapsFromPlans(
  plans: PlannedEpisodeRequirement[],
  selectable: ApprovedEnvironmentAsset[],
): SpecialtyGap[] {
  const gaps: SpecialtyGap[] = [];
  for (const plan of plans) {
    for (const role of plan.requiredHeroRoles ?? []) {
      if (!SPECIALTY_STORY_ROLES.includes(role as (typeof SPECIALTY_STORY_ROLES)[number])) continue;
      const approved = canonicalSupplyForRole(selectable, role) > 0;
      if (approved) continue;
      if (plan.nativeProceduralSufficient || plan.derivativeSufficient || plan.kitbashSufficient) continue;
      if (plan.backgroundSubstitutionSufficient || plan.rewriteSufficient) continue;
      if (nativeCanCover(role) && !plan.storyPurpose) continue;
      gaps.push({
        semanticRole: role,
        storyPurpose: plan.storyPurpose ?? null,
        reason: `planned story requires ${role} and no selectable approved logical asset covers it`,
      });
    }
  }
  return gaps.sort((left, right) => left.semanticRole.localeCompare(right.semanticRole));
}

export function evaluateSceneryLongevity(input: SceneryLongevityInput): SceneryLongevityReport {
  assertPositiveTarget(input.requestedEpisodeCount);
  const requested = input.requestedEpisodeCount;
  const locations = stableSorted(input.worldBuilderLocations ?? EXISTING_LOCATIONS);
  const archetypes = stableSorted(input.worldBuilderArchetypes ?? ARCHETYPE_IDS);
  const seasons = input.seasonCapabilities ?? SEASONS;
  const weathers = input.weatherCapabilities ?? WEATHERS;
  const times = input.timeOfDayCapabilities ?? TIMES_OF_DAY;
  const cameras = input.cameraCompositionCapabilities ?? input.lightingCapabilities ?? ['ESTABLISHING', 'CLOSE', 'OTS'];
  const windowSize = input.recentWindowSize ?? DEFAULT_RECENT_WINDOW_SIZE;
  const history = [...(input.episodeUsageHistory ?? [])];
  const plans = [...(input.plannedEpisodeRequirements ?? [])];
  const selectable = selectableApprovedAssets(input.approvedAssetRegistry);
  const evidenceClass = input.evidenceClass ?? 'SYNTHETIC_PREVIEW';

  const heroAssets = selectable.filter((asset) => asset.qualityEligibility.includes('HERO') && asset.coverageCategories.includes('hero_locations'));
  const interiorAssets = assetsWithCategory(selectable, 'interiors');
  const interiorShells = assetsWithRole(selectable, 'INTERIOR_SHELL');
  const interiorProps = assetsWithRole(selectable, 'INTERIOR_PROP');
  const backgroundAssets = assetsWithCategory(selectable, 'backgrounds');
  const mountainBackgrounds = assetsWithRole(selectable, 'MOUNTAIN_BACKGROUND');
  const skies = assetsWithRole(selectable, 'SKY');
  const fills = assetsWithRole(selectable, 'BACKGROUND_FILL');

  const seasonFamilies = meaningfulSeasonFamilies(seasons);
  const weatherFamilies = meaningfulWeatherFamilies(weathers);
  const timeFamilies = meaningfulTimeFamilies(times);
  const approvedHeroGroups = uniqueCanonicalGroups(heroAssets).length;
  const approvedInteriorGroups = uniqueCanonicalGroups(interiorShells).length;
  const approvedBackgroundGroups = uniqueCanonicalGroups(backgroundAssets).length;
  const effectiveVariationUnits =
    locations.length * Math.min(3, Math.max(1, seasonFamilies)) +
    Math.min(archetypes.length, locations.length * 3) +
    approvedHeroGroups * 3 +
    approvedInteriorGroups * 2 +
    approvedBackgroundGroups * 2 +
    Math.min(weatherFamilies, 4) +
    Math.min(timeFamilies, 3) +
    Math.min(cameras.length, 3);

  const strength = coverageStrengthFromRatio(effectiveVariationUnits / requested);
  const coverageConfidence = confidenceOf(input, Boolean(input.approvedAssetRegistry));

  const semanticRoleCoverage: SemanticRolePressure[] = PRESSURE_ROLES.map((role) => {
    const approvedSupply = canonicalSupplyForRole(selectable, role);
    const nativeSoftSupply = nativeCanCover(role) ? Math.min(2, Math.ceil(locations.length / 4)) : 0;
    const supply = approvedSupply + nativeSoftSupply;
    const demand = plannedDemandForRole(role, requested, history, plans);
    return {
      semanticRole: role,
      supplyCanonicalGroups: approvedSupply,
      demand,
      pressure: rolePressureFromDemand(demand, supply),
    };
  }).sort((left, right) => left.semanticRole.localeCompare(right.semanticRole));

  const usesByLocation = new Map<string, EpisodeUsageRecord[]>();
  for (const locationId of locations) usesByLocation.set(locationId, []);
  for (const item of history) {
    usesByLocation.set(item.locationId, [...(usesByLocation.get(item.locationId) ?? []), item]);
  }
  const plannedByLocation = new Map<string, number>();
  for (const plan of plans) {
    if (!plan.locationId) continue;
    plannedByLocation.set(plan.locationId, (plannedByLocation.get(plan.locationId) ?? 0) + 1);
  }
  const inferredPerLocation = history.length ? 0 : Math.ceil(requested / Math.max(locations.length, 1));

  const locationLoad = locations.map((locationId) => {
    const used = usesByLocation.get(locationId) ?? [];
    const recent = used.slice(-windowSize);
    const signatures = new Set(recent.map(environmentVisualSignatureSha256));
    const archetypesUsed = new Set(used.map((item) => item.archetypeId));
    const plannedUses = plannedByLocation.get(locationId) ?? (used.length || inferredPerLocation);
    const variationFamilies = seasonFamilies + weatherFamilies + (locationId.includes('forest') || locationId.includes('river') ? 2 : 1);
    return {
      locationId,
      plannedUses,
      recentUses: recent.length,
      distinctArchetypesUsed: archetypesUsed.size,
      distinctVisualSignatures: signatures.size,
      availableVariationFamilies: variationFamilies,
      repetitionRisk: reuseRiskFromShare(
        plannedUses / Math.max(requested, 1),
        Math.max(signatures.size, variationFamilies > 4 ? 3 : 1),
      ),
    };
  });

  const usesByArchetype = new Map<string, EpisodeUsageRecord[]>();
  for (const item of history) {
    usesByArchetype.set(item.archetypeId, [...(usesByArchetype.get(item.archetypeId) ?? []), item]);
  }
  const observedArchetypes = stableSorted([
    ...new Set([...archetypes.filter((id) => (usesByArchetype.get(id)?.length ?? 0) > 0), ...history.map((item) => item.archetypeId)]),
  ]);
  const archetypeFocus = observedArchetypes.length ? observedArchetypes : archetypes.slice(0, Math.min(8, archetypes.length));
  const archetypeLoad = archetypeFocus.map((archetypeId) => {
    const used = usesByArchetype.get(archetypeId) ?? [];
    const compatible = selectable.filter((asset) => asset.archetypeCompatibility.includes(archetypeId) || asset.archetypeCompatibility.includes('GENERIC'));
    const useCount = used.length || (history.length ? 0 : Math.ceil(requested / Math.max(archetypeFocus.length, 1)));
    const variants = new Set(used.map(environmentVisualSignatureSha256)).size;
    return {
      archetypeId,
      useCount,
      compatibleApprovedAssets: uniqueCanonicalGroups(compatible).length,
      distinctVariantsUsed: variants,
      repetitionRisk: reuseRiskFromShare(useCount / Math.max(requested, 1), Math.max(variants, uniqueCanonicalGroups(compatible).length)),
    };
  });

  const recent = history.slice(-windowSize);
  const locationShare = (id: string) => (recent.length ? recent.filter((item) => item.locationId === id).length / recent.length : inferredPerLocation / requested);
  const highPressureLocations = locationLoad
    .filter((item) => item.repetitionRisk === 'HIGH' || item.repetitionRisk === 'VERY_HIGH' || locationShare(item.locationId) >= 0.4)
    .map((item) => item.locationId);
  const highPressureArchetypes = archetypeLoad
    .filter((item) => item.repetitionRisk === 'HIGH' || item.repetitionRisk === 'VERY_HIGH')
    .map((item) => item.archetypeId);

  const heroDemand = plannedDemandForRole('BUILDING_HERO', requested, history, plans);
  const interiorDemand = plannedDemandForRole('INTERIOR_SHELL', requested, history, plans);
  const heroPressure = rolePressureFromDemand(heroDemand, Math.max(approvedHeroGroups, 2));
  const interiorPressure = rolePressureFromDemand(interiorDemand, Math.max(approvedInteriorGroups + 2, 3));
  const busiestRole = semanticRoleCoverage.reduce((worst, item) => (item.pressure === 'OVERUSED' ? item : worst), semanticRoleCoverage[0]!);

  const heroKeys = recent.map((item) => stableSorted(item.heroAssetIds).join('|') || 'NONE');
  const heroCounts = new Map<string, number>();
  for (const key of heroKeys) heroCounts.set(key, (heroCounts.get(key) ?? 0) + 1);
  const topHeroUses = Math.max(0, ...heroCounts.values());
  const heroHistoryShare = recent.length === 0 ? heroDemand / requested : topHeroUses / Math.max(recent.length, 1);
  const uniqueHeroSets = new Set(heroKeys.filter((key) => key !== 'NONE')).size;
  const backgroundKeys = recent.map((item) => item.backgroundFamily ?? 'UNSPECIFIED');
  const backgroundCounts = new Map<string, number>();
  for (const key of backgroundKeys) backgroundCounts.set(key, (backgroundCounts.get(key) ?? 0) + 1);
  const topBackgroundUses = Math.max(0, ...backgroundCounts.values());
  const uniqueBackgrounds = new Set(backgroundKeys).size;
  const uniqueDressing = new Set(recent.map((item) => item.dressingState ?? 'DEFAULT')).size;
  const backgroundShare = recent.length ? topBackgroundUses / recent.length : requested / (approvedBackgroundGroups + 8) / 20;

  const locationReuseRisk = maxRisk([
    demandRiskFromLoad(requested / Math.max(locations.length, 1), seasonFamilies + weatherFamilies),
    ...locationLoad.map((item) => item.repetitionRisk),
  ]);
  const archetypeReuseRisk = maxRisk([
    demandRiskFromLoad(requested / Math.max(archetypes.length, 8), 2),
    ...archetypeLoad.map((item) => item.repetitionRisk),
  ]);
  const heroSetReuseRisk = maxRisk([pressureToRisk(heroPressure), reuseRiskFromShare(heroHistoryShare, Math.max(uniqueHeroSets, approvedHeroGroups))]);
  const interiorReuseRisk = pressureToRisk(interiorPressure);
  const backgroundReuseRisk = reuseRiskFromShare(backgroundShare, uniqueBackgrounds || approvedBackgroundGroups);
  const dressingReuseRisk = reuseRiskFromShare(recent.length ? 1 - uniqueDressing / Math.max(recent.length, 1) : 0.2, uniqueDressing || weatherFamilies);
  const semanticRisk = pressureToRisk(busiestRole?.pressure ?? 'HEALTHY');

  const reasons: string[] = [];
  for (const location of highPressureLocations.slice(0, 4)) {
    const count = recent.filter((item) => item.locationId === location).length;
    if (count) reasons.push(`${location} used in ${count} of recent ${recent.length} episodes`);
  }
  reasons.push(`${approvedInteriorGroups} approved interior shell${approvedInteriorGroups === 1 ? '' : 's'} available`);
  reasons.push(`${approvedBackgroundGroups} approved background families available`);
  if (approvedHeroGroups <= 2) reasons.push('hero environment diversity is limited');
  if (!recent.length) reasons.push('no recent usage history; demand is inferred from the requested season target');

  const suggestions: string[] = [];
  if (interiorPressure === 'BUSY' || interiorPressure === 'OVERUSED') suggestions.push('Rotate interior shells or use exterior/background solutions before buying.');
  if (heroPressure === 'OVERUSED') suggestions.push('Change archetype, season, or lighting family before repeating the same hero set.');
  if (highPressureLocations.length) suggestions.push('Keep architecture and change weather, season, or background family.');
  suggestions.push('Creative direction, shot design, and story requirements still affect longevity.');

  const repetitionRisk = buildRepetitionRisk({
    recent,
    windowSize,
    locationReuseRisk,
    archetypeReuseRisk,
    heroSetReuseRisk,
    interiorReuseRisk,
    backgroundReuseRisk,
    dressingReuseRisk,
    semanticRolePressure: semanticRisk,
    highPressureLocations,
    highPressureArchetypes,
    reasons,
    suggestions,
  });

  const specialtyGaps = specialtyGapsFromPlans(plans, selectable);
  let purchaseDecision: LongevityPurchaseDecision = 'NO_PURCHASE_NEEDED';
  let purchaseSemanticGap: string | null = null;
  if (specialtyGaps.length) {
    purchaseDecision = 'PURCHASE_MAY_BE_JUSTIFIED';
    purchaseSemanticGap = specialtyGaps[0]!.semanticRole;
  } else if (repetitionRisk.overallRisk === 'HIGH' || repetitionRisk.overallRisk === 'VERY_HIGH') {
    purchaseDecision = 'OPTIONAL_EXPANSION';
  }

  const limitingFactors = [
    approvedInteriorGroups <= 1 ? 'interior shell supply is thin' : null,
    approvedHeroGroups <= 2 ? 'hero environment families are limited' : null,
    specialtyGaps.length ? `specialty story gap ${specialtyGaps[0]!.semanticRole}` : null,
    requested >= 150 && strength !== 'EXCELLENT' ? 'larger season targets increase reuse pressure without new approved capacity' : null,
  ].filter((item): item is string => Boolean(item));

  const seasonTargetSummary = `${strength} COVERAGE FOR ${requested}-EPISODE TARGET`;
  const longevitySignals = [
    `requested target ${requested} is a caller-supplied plan, not a scenery ceiling`,
    `effective variation units ${effectiveVariationUnits} come from locations, approved logical identities, and meaningful season/weather families`,
    `cartesian season×weather×time products are not treated as unique episodes`,
    evidenceClass === 'SYNTHETIC_PREVIEW'
      ? 'SYNTHETIC / PLANNING ANALYSIS — NOT LIVE APPROVED-ASSET COVERAGE'
      : 'approved-production-plan evidence class; still not a live R2 read',
  ];

  const body = {
    schemaVersion: LONGEVITY_SCHEMA,
    requestedEpisodeCount: requested,
    evaluatedEpisodeCount: requested,
    coverageStrength: strength,
    coverageConfidence,
    baseLocationCount: locations.length,
    archetypeCount: archetypes.length,
    approvedLogicalAssetCount: uniqueCanonicalGroups(selectable).length,
    approvedHeroAssetCount: approvedHeroGroups,
    approvedInteriorAssetCount: uniqueCanonicalGroups(interiorAssets).length,
    approvedBackgroundAssetCount: approvedBackgroundGroups,
    approvedInteriorShellCount: approvedInteriorGroups,
    approvedInteriorPropFamilies: uniqueCanonicalGroups(interiorProps).length,
    interiorArchetypeCoverage: archetypes.filter(isInteriorArchetype).length,
    interiorReusePressure: interiorPressure,
    heroEnvironmentCount: approvedHeroGroups,
    heroEnvironmentRoleCoverage: PRESSURE_ROLES.filter((role) => role.includes('HERO') && canonicalSupplyForRole(selectable, role) > 0).length,
    heroReusePressure: heroPressure,
    backgroundFamilyCount: approvedBackgroundGroups,
    mountainBackgroundCount: uniqueCanonicalGroups(mountainBackgrounds).length,
    skyFamilyCount: uniqueCanonicalGroups(skies).length,
    backgroundFillCount: uniqueCanonicalGroups(fills).length,
    semanticRoleCoverage,
    variationCapacity: {
      meaningfulSeasonFamilies: seasonFamilies,
      meaningfulWeatherFamilies: weatherFamilies,
      meaningfulTimeFamilies: timeFamilies,
      cameraCompositionFamilies: cameras.length,
      effectiveVariationUnits,
      cartesianProductRejected: true as const,
    },
    locationLoad,
    archetypeLoad,
    specialtyGapCount: specialtyGaps.length,
    specialtyGaps,
    repetitionRisk,
    longevitySignals,
    limitingFactors,
    purchaseDecision,
    purchaseSemanticGap,
    seasonTargetSummary,
    evidenceClass,
    syntheticPlanningAnalysis: evidenceClass === 'SYNTHETIC_PREVIEW',
  };

  return { ...body, reportSha256: sha256Canonical(body) };
}

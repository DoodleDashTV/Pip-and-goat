export const LONGEVITY_SCHEMA = 'TIVVLEJOY_SCENERY_LONGEVITY_V1' as const;
export const REPETITION_RISK_SCHEMA = 'TIVVLEJOY_SCENERY_REPETITION_RISK_V1' as const;
export const DEFAULT_RECENT_WINDOW_SIZE = 10 as const;

export const COVERAGE_STRENGTHS = ['EXCELLENT', 'STRONG', 'ADEQUATE', 'THIN', 'INSUFFICIENT'] as const;
export type CoverageStrength = (typeof COVERAGE_STRENGTHS)[number];

export const RISK_LEVELS = ['VERY_LOW', 'LOW', 'MODERATE', 'HIGH', 'VERY_HIGH'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const CONFIDENCE_LEVELS = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type LongevityConfidence = (typeof CONFIDENCE_LEVELS)[number];

export const ROLE_PRESSURES = ['UNDERUSED', 'HEALTHY', 'BUSY', 'OVERUSED'] as const;
export type RolePressure = (typeof ROLE_PRESSURES)[number];

export const VARIATION_STRENGTHS = ['MINOR', 'MODERATE', 'MAJOR'] as const;
export type VariationStrength = (typeof VARIATION_STRENGTHS)[number];

export const PURCHASE_DECISIONS = ['NO_PURCHASE_NEEDED', 'OPTIONAL_EXPANSION', 'PURCHASE_MAY_BE_JUSTIFIED'] as const;
export type LongevityPurchaseDecision = (typeof PURCHASE_DECISIONS)[number];

export const EVIDENCE_CLASSES = ['SYNTHETIC_PREVIEW', 'APPROVED_PRODUCTION_PLAN'] as const;
export type LongevityEvidenceClass = (typeof EVIDENCE_CLASSES)[number];

export const SPECIALTY_STORY_ROLES = [
  'CAVE_HERO',
  'CAVE_HERO_CRYSTAL',
  'COASTAL_HERO',
  'UNDERWATER_HERO',
  'AMUSEMENT_RIDE_HERO',
  'DESERT_HERO',
  'CASTLE_RUIN_HERO',
  'SWAMP_HERO',
  'SNOW_SPECIALTY_HERO',
] as const;
export type SpecialtyStoryRole = (typeof SPECIALTY_STORY_ROLES)[number];

export const PRESSURE_ROLES = [
  'BUILDING_HERO',
  'INTERIOR_SHELL',
  'TREE_HERO',
  'MOUNTAIN_BACKGROUND',
  'WATER',
  'SKY',
  'BACKGROUND_FILL',
  'SIGNAGE',
] as const;

export type EpisodeUsageRecord = {
  episodeId: string;
  locationId: string;
  archetypeId: string;
  season: 'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER';
  weather: string;
  timeOfDay: string;
  lightingFamily?: string;
  heroAssetIds?: string[];
  supportingFamilies?: string[];
  interiorShellId?: string | null;
  backgroundFamily?: string;
  terrainFamily?: string;
  pathFamily?: string;
  dressingState?: string;
  requiredHeroRoles?: string[];
  storyCriticalPropIds?: string[];
  originalFilename?: string;
  displayLabel?: string;
};

export type PlannedEpisodeRequirement = {
  episodeId: string;
  locationId?: string;
  archetypeId?: string;
  requiredHeroRoles?: string[];
  storyPurpose?: string;
  nativeProceduralSufficient?: boolean;
  derivativeSufficient?: boolean;
  kitbashSufficient?: boolean;
  backgroundSubstitutionSufficient?: boolean;
  rewriteSufficient?: boolean;
};

export type SceneryLongevityInput = {
  requestedEpisodeCount: number;
  worldBuilderLocations?: readonly string[];
  worldBuilderArchetypes?: readonly string[];
  approvedAssetRegistry?: import('@/lib/tivvlejoy-approved-asset-registry/types').ApprovedAssetRegistry;
  episodeUsageHistory?: EpisodeUsageRecord[];
  plannedEpisodeRequirements?: PlannedEpisodeRequirement[];
  seasonCapabilities?: readonly string[];
  weatherCapabilities?: readonly string[];
  timeOfDayCapabilities?: readonly string[];
  lightingCapabilities?: readonly string[];
  cameraCompositionCapabilities?: readonly string[];
  recentWindowSize?: number;
  evidenceClass?: LongevityEvidenceClass;
};

export type LocationLoad = {
  locationId: string;
  plannedUses: number;
  recentUses: number;
  distinctArchetypesUsed: number;
  distinctVisualSignatures: number;
  availableVariationFamilies: number;
  repetitionRisk: RiskLevel;
};

export type ArchetypeLoad = {
  archetypeId: string;
  useCount: number;
  compatibleApprovedAssets: number;
  distinctVariantsUsed: number;
  repetitionRisk: RiskLevel;
};

export type SemanticRolePressure = {
  semanticRole: string;
  supplyCanonicalGroups: number;
  demand: number;
  pressure: RolePressure;
};

export type SpecialtyGap = {
  semanticRole: string;
  storyPurpose: string | null;
  reason: string;
};

export type RepetitionRiskReport = {
  schemaVersion: typeof REPETITION_RISK_SCHEMA;
  overallRisk: RiskLevel;
  locationReuseRisk: RiskLevel;
  archetypeReuseRisk: RiskLevel;
  heroSetReuseRisk: RiskLevel;
  interiorReuseRisk: RiskLevel;
  backgroundReuseRisk: RiskLevel;
  dressingReuseRisk: RiskLevel;
  semanticRolePressure: RiskLevel;
  consecutiveSimilarityRisk: RiskLevel;
  highPressureLocations: string[];
  highPressureArchetypes: string[];
  repeatedVisualSignatures: string[];
  recentWindowAnalysis: {
    windowSize: number;
    analyzedEpisodeCount: number;
    distinctLocations: number;
    distinctArchetypes: number;
    distinctSignatures: number;
    longestConsecutiveIdenticalSignatures: number;
  };
  suggestions: string[];
  reasons: string[];
  scoreSha256: string;
};

export type SceneryLongevityReport = {
  schemaVersion: typeof LONGEVITY_SCHEMA;
  requestedEpisodeCount: number;
  evaluatedEpisodeCount: number;
  coverageStrength: CoverageStrength;
  coverageConfidence: LongevityConfidence;
  baseLocationCount: number;
  archetypeCount: number;
  approvedLogicalAssetCount: number;
  approvedHeroAssetCount: number;
  approvedInteriorAssetCount: number;
  approvedBackgroundAssetCount: number;
  approvedInteriorShellCount: number;
  approvedInteriorPropFamilies: number;
  interiorArchetypeCoverage: number;
  interiorReusePressure: RolePressure;
  heroEnvironmentCount: number;
  heroEnvironmentRoleCoverage: number;
  heroReusePressure: RolePressure;
  backgroundFamilyCount: number;
  mountainBackgroundCount: number;
  skyFamilyCount: number;
  backgroundFillCount: number;
  semanticRoleCoverage: SemanticRolePressure[];
  variationCapacity: {
    meaningfulSeasonFamilies: number;
    meaningfulWeatherFamilies: number;
    meaningfulTimeFamilies: number;
    cameraCompositionFamilies: number;
    effectiveVariationUnits: number;
    cartesianProductRejected: true;
  };
  locationLoad: LocationLoad[];
  archetypeLoad: ArchetypeLoad[];
  specialtyGapCount: number;
  specialtyGaps: SpecialtyGap[];
  repetitionRisk: RepetitionRiskReport;
  longevitySignals: string[];
  limitingFactors: string[];
  purchaseDecision: LongevityPurchaseDecision;
  purchaseSemanticGap: string | null;
  seasonTargetSummary: string;
  evidenceClass: LongevityEvidenceClass;
  syntheticPlanningAnalysis: boolean;
  reportSha256: string;
};

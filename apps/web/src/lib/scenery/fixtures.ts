import { parseAssetCatalog, type AssetCatalog, type CatalogAsset } from './catalog';
import {
  DEFAULT_SCENERY_SEED,
  GOAT_CHARACTER_ID,
  PIP_CHARACTER_ID,
  SCENERY_SCHEMA_VERSION,
  type SceneryRole,
} from './types';
import type { SceneBrief } from './planner';

const FIXTURE_GENERATED_AT = '2026-08-18T00:00:00.000Z';

function boundsFromSize(x: number, y: number, z: number) {
  return {
    minX: -x / 2,
    maxX: x / 2,
    minY: 0,
    maxY: y,
    minZ: -z / 2,
    maxZ: z / 2,
  };
}

function fixtureAsset(
  partial: Omit<
    CatalogAsset,
    | 'schemaVersion'
    | 'collection'
    | 'style'
    | 'sourceId'
    | 'normalizedBlendPath'
    | 'proxyPath'
    | 'previewPath'
    | 'originPolicy'
    | 'surfaceRequirements'
    | 'allowedScaleRange'
    | 'materials'
    | 'textureTierAvailability'
    | 'estimatedMemoryMb'
    | 'heroSafe'
    | 'backgroundSafe'
    | 'clearanceBounds'
    | 'animationCapable'
    | 'geometryNodesCapable'
    | 'licensingProvenanceRef'
    | 'compatibilityStatus'
    | 'validationFindings'
    | 'bytesInspected'
  > & {
    width: number;
    height: number;
    depth: number;
    triangles: number;
    approvalStatus?: CatalogAsset['approvalStatus'];
    placementMode?: CatalogAsset['placementMode'];
    rotationPolicy?: CatalogAsset['rotationPolicy'];
  },
): CatalogAsset {
  const { width, height, depth, triangles, ...rest } = partial;
  return {
    schemaVersion: SCENERY_SCHEMA_VERSION,
    collection: 'Synthetic fixture catalog',
    style: 'tivvlejoy-stylized-placeholder',
    sourceId: 'SRC_FIXTURE_SYNTHETIC',
    normalizedBlendPath: null,
    proxyPath: null,
    previewPath: null,
    originPolicy: 'ground_bottom',
    surfaceRequirements: ['ground'],
    allowedScaleRange: { min: 0.85, max: 1.15 },
    materials: ['fixture_placeholder'],
    textureTierAvailability: { '1024': true, '2048': true, '4096': true },
    estimatedMemoryMb: 8,
    heroSafe: rest.assetType === 'building' || rest.assetType === 'water',
    backgroundSafe: rest.assetType !== 'building',
    clearanceBounds: boundsFromSize(width, height, depth),
    animationCapable: rest.assetType === 'swarm',
    geometryNodesCapable: rest.assetType === 'scatter' || rest.assetType === 'swarm',
    licensingProvenanceRef: 'FIXTURE_SYNTHETIC_NO_COMMERCIAL_GEOMETRY',
    compatibilityStatus: 'compatible',
    validationFindings: [],
    bytesInspected: true,
    dimensionsMeters: { x: width, y: height, z: depth },
    triangleCount: triangles,
    placementMode: rest.placementMode ?? 'grounded',
    rotationPolicy: rest.rotationPolicy ?? (rest.assetType === 'building' ? 'yaw_only' : 'yaw_only'),
    displayName: rest.displayName,
    assetId: rest.assetId,
    assetType: rest.assetType,
    biome: rest.biome,
    tags: rest.tags,
    sourceObjectName: rest.sourceObjectName,
    approvalStatus: rest.approvalStatus ?? 'fixture_only',
  };
}

const FIXTURE_ASSETS: CatalogAsset[] = [
  fixtureAsset({
    assetId: 'SCN_FIXTURE_CABIN_001',
    displayName: 'Fixture cabin',
    assetType: 'building',
    biome: 'village',
    tags: ['cabin', 'building'],
    sourceObjectName: 'FixtureCabin',
    width: 4.2,
    height: 3.4,
    depth: 3.6,
    triangles: 2400,
  }),
  fixtureAsset({
    assetId: 'SCN_FIXTURE_PATH_001',
    displayName: 'Fixture path',
    assetType: 'path',
    biome: 'mixed',
    tags: ['path'],
    sourceObjectName: 'FixturePath',
    width: 2.2,
    height: 0.08,
    depth: 14,
    triangles: 180,
  }),
  fixtureAsset({
    assetId: 'SCN_FIXTURE_TREE_LEFT_001',
    displayName: 'Fixture left tree',
    assetType: 'vegetation',
    biome: 'forest',
    tags: ['tree_left', 'tree'],
    sourceObjectName: 'FixtureTreeLeft',
    width: 2.4,
    height: 6.2,
    depth: 2.4,
    triangles: 1800,
  }),
  fixtureAsset({
    assetId: 'SCN_FIXTURE_TREE_RIGHT_001',
    displayName: 'Fixture right tree',
    assetType: 'vegetation',
    biome: 'forest',
    tags: ['tree_right', 'tree'],
    sourceObjectName: 'FixtureTreeRight',
    width: 2.5,
    height: 6.4,
    depth: 2.5,
    triangles: 1900,
  }),
  fixtureAsset({
    assetId: 'SCN_FIXTURE_ROCK_001',
    displayName: 'Fixture rock',
    assetType: 'prop',
    biome: 'forest',
    tags: ['rock'],
    sourceObjectName: 'FixtureRock',
    width: 1.1,
    height: 0.7,
    depth: 0.9,
    triangles: 420,
  }),
  fixtureAsset({
    assetId: 'SCN_FIXTURE_FLOWER_001',
    displayName: 'Fixture flowers',
    assetType: 'vegetation',
    biome: 'clearing',
    tags: ['flower'],
    sourceObjectName: 'FixtureFlowers',
    width: 0.8,
    height: 0.35,
    depth: 0.8,
    triangles: 260,
  }),
  fixtureAsset({
    assetId: 'SCN_FIXTURE_CREEK_001',
    displayName: 'Fixture creek',
    assetType: 'water',
    biome: 'creek',
    tags: ['creek', 'water'],
    sourceObjectName: 'FixtureCreek',
    width: 2.2,
    height: 0.12,
    depth: 4.2,
    triangles: 320,
    placementMode: 'grounded',
  }),
  fixtureAsset({
    assetId: 'SCN_FIXTURE_BUTTERFLY_001',
    displayName: 'Fixture butterflies',
    assetType: 'swarm',
    biome: 'clearing',
    tags: ['butterfly'],
    sourceObjectName: 'FixtureButterflies',
    width: 1.2,
    height: 0.8,
    depth: 1.2,
    triangles: 140,
    placementMode: 'volume',
  }),
  fixtureAsset({
    assetId: 'SCN_FIXTURE_FIREFLY_001',
    displayName: 'Fixture fireflies',
    assetType: 'swarm',
    biome: 'clearing',
    tags: ['firefly'],
    sourceObjectName: 'FixtureFireflies',
    width: 1.4,
    height: 1,
    depth: 1.4,
    triangles: 120,
    placementMode: 'volume',
  }),
  fixtureAsset({
    assetId: 'SCN_FIXTURE_SKY_DAY_001',
    displayName: 'Fixture day sky',
    assetType: 'sky',
    biome: 'mixed',
    tags: ['sky'],
    sourceObjectName: 'FixtureSkyDay',
    width: 1,
    height: 1,
    depth: 1,
    triangles: 80,
    placementMode: 'volume',
    rotationPolicy: 'locked',
  }),
  fixtureAsset({
    assetId: 'SCN_FIXTURE_SKY_NIGHT_001',
    displayName: 'Fixture night sky',
    assetType: 'sky',
    biome: 'clearing',
    tags: ['sky'],
    sourceObjectName: 'FixtureSkyNight',
    width: 1,
    height: 1,
    depth: 1,
    triangles: 80,
    placementMode: 'volume',
    rotationPolicy: 'locked',
  }),
  fixtureAsset({
    assetId: 'SCN_FIXTURE_HDRI_DAY_001',
    displayName: 'Fixture day HDRI',
    assetType: 'hdri',
    biome: 'mixed',
    tags: ['hdri'],
    sourceObjectName: 'FixtureHdriDay',
    width: 1,
    height: 1,
    depth: 1,
    triangles: 0,
    placementMode: 'volume',
    rotationPolicy: 'locked',
  }),
  fixtureAsset({
    assetId: 'SCN_FIXTURE_HDRI_NIGHT_001',
    displayName: 'Fixture night HDRI',
    assetType: 'hdri',
    biome: 'clearing',
    tags: ['hdri'],
    sourceObjectName: 'FixtureHdriNight',
    width: 1,
    height: 1,
    depth: 1,
    triangles: 0,
    placementMode: 'volume',
    rotationPolicy: 'locked',
  }),
  fixtureAsset({
    assetId: 'SCN_FIXTURE_GRASS_001',
    displayName: 'Fixture grass',
    assetType: 'scatter',
    biome: 'forest',
    tags: ['grass'],
    sourceObjectName: 'FixtureGrass',
    width: 8,
    height: 0.25,
    depth: 8,
    triangles: 900,
    placementMode: 'grounded',
  }),
  fixtureAsset({
    assetId: 'SCN_FIXTURE_FENCE_001',
    displayName: 'Fixture fence',
    assetType: 'prop',
    biome: 'village',
    tags: ['fence'],
    sourceObjectName: 'FixtureFence',
    width: 6,
    height: 1.2,
    depth: 0.2,
    triangles: 360,
  }),
  fixtureAsset({
    assetId: 'SCN_FIXTURE_TABLE_001',
    displayName: 'Fixture table',
    assetType: 'prop',
    biome: 'village',
    tags: ['table'],
    sourceObjectName: 'FixtureTable',
    width: 1.2,
    height: 0.75,
    depth: 1.2,
    triangles: 280,
  }),
  fixtureAsset({
    assetId: 'SCN_FIXTURE_CHAIR_001',
    displayName: 'Fixture chair',
    assetType: 'prop',
    biome: 'village',
    tags: ['chair'],
    sourceObjectName: 'FixtureChair',
    width: 0.55,
    height: 0.9,
    depth: 0.55,
    triangles: 220,
  }),
  fixtureAsset({
    assetId: 'SCN_FIXTURE_UNAPPROVED_CABIN_001',
    displayName: 'Unapproved fixture cabin',
    assetType: 'building',
    biome: 'village',
    tags: ['cabin'],
    sourceObjectName: 'UnapprovedCabin',
    width: 4,
    height: 3,
    depth: 3,
    triangles: 2000,
    approvalStatus: 'unapproved',
  }),
];

export const SYNTHETIC_SCENERY_CATALOG: AssetCatalog = parseAssetCatalog({
  schemaVersion: SCENERY_SCHEMA_VERSION,
  generatedAt: FIXTURE_GENERATED_AT,
  assets: FIXTURE_ASSETS,
});

export function acceptanceSceneBrief(overrides: Partial<SceneBrief> = {}): SceneBrief {
  return {
    recipe: 'forest_village_day',
    storyPurpose: 'Pip and Goat follow a path toward a cabin',
    mood: 'cheerful',
    timeOfDay: 'morning',
    characters: [PIP_CHARACTER_ID, GOAT_CHARACTER_ID],
    requiredFeatures: ['path', 'cabin', 'creek'],
    effects: ['butterflies'],
    durationSeconds: 10,
    aspectRatio: '9:16',
    seed: DEFAULT_SCENERY_SEED,
    textureTier: '2048',
    memoryBudgetMb: 1400,
    shotKind: 'standard',
    ...overrides,
  };
}

export function fixtureRoleIds(): Partial<Record<SceneryRole, string>> {
  return {
    cabin: 'SCN_FIXTURE_CABIN_001',
    path: 'SCN_FIXTURE_PATH_001',
    tree_left: 'SCN_FIXTURE_TREE_LEFT_001',
    tree_right: 'SCN_FIXTURE_TREE_RIGHT_001',
    rock: 'SCN_FIXTURE_ROCK_001',
    flower: 'SCN_FIXTURE_FLOWER_001',
    creek: 'SCN_FIXTURE_CREEK_001',
    butterfly: 'SCN_FIXTURE_BUTTERFLY_001',
    firefly: 'SCN_FIXTURE_FIREFLY_001',
    sky: 'SCN_FIXTURE_SKY_DAY_001',
    hdri: 'SCN_FIXTURE_HDRI_DAY_001',
    grass: 'SCN_FIXTURE_GRASS_001',
    fence: 'SCN_FIXTURE_FENCE_001',
    table: 'SCN_FIXTURE_TABLE_001',
    chair: 'SCN_FIXTURE_CHAIR_001',
  };
}

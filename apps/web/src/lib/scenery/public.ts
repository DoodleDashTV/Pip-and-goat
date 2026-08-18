export { SCENERY_SCHEMA_VERSION, DEFAULT_SCENERY_SEED, RECIPE_IDS } from './types';
export { SCENERY_COPY } from './copy';
export { publicSceneryStoragePolicy, SCENERY_STORAGE_LAYOUT, SCENERY_STORAGE_ENV } from './storage-policy';
export { textureTierPolicyCopy, recommendTextureTier, resolveTextureTier } from './texture-policy';
export { listRecipes } from './recipes';
export { SceneBriefSchema, planSceneryScene } from './planner';
export { SYNTHETIC_SCENERY_CATALOG, acceptanceSceneBrief } from './fixtures';
export { assertNoLegacyBrand } from './types';

export type PublicScenerySnapshot = {
  schemaVersion: string;
  copy: typeof import('./copy').SCENERY_COPY;
  previewOnly: true;
  rendered: false;
  blenderExecuted: false;
  realBlenderOperations: 'not_run';
  purchasedBytesInspected: false;
  storage: ReturnType<typeof import('./storage-policy').publicSceneryStoragePolicy>;
  texturePolicy: string[];
  sources: Array<{
    sourceId: string;
    collectionName: string;
    ingestionStatus: string;
    compatibilityStatus: string;
    supportedBlenderVersion: string;
    bytesInspected: boolean;
    schemaVersion: string;
  }>;
  recipes: Array<{
    recipeId: string;
    displayName: string;
    biome: string;
    requiredRoles: string[];
    optionalRoles: string[];
    textureTier: string;
  }>;
  assets: {
    registered: number;
    normalizedPurchased: number;
    quarantined: number;
    approvedPurchased: number;
    fixtureOnly: number;
  };
  fixtureAssets: Array<{
    assetId: string;
    displayName: string;
    approvalStatus: string;
    tags: string[];
  }>;
  defaultSeed: number;
  missingPrerequisites: string[];
};

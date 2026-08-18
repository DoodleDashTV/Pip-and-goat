import { SCENERY_COPY } from './copy';
import { SYNTHETIC_SCENERY_CATALOG } from './fixtures';
import { publicIntakeSnapshot } from './intake/readiness';
import { getSceneryIntakeStore } from './intake/store';
import { listRecipes } from './recipes';
import { publicSourceSnapshot } from './source-registry';
import { publicSceneryStoragePolicy } from './storage-policy';
import { textureTierPolicyCopy } from './texture-policy';
import { DEFAULT_SCENERY_SEED, SCENERY_SCHEMA_VERSION } from './types';
import type { PublicScenerySnapshot } from './public';

export function buildPublicScenerySnapshot(): PublicScenerySnapshot {
  const sources = publicSourceSnapshot();
  const assets = SYNTHETIC_SCENERY_CATALOG.assets;
  return {
    schemaVersion: SCENERY_SCHEMA_VERSION,
    copy: SCENERY_COPY,
    previewOnly: true,
    rendered: false,
    blenderExecuted: false,
    realBlenderOperations: 'not_run' as const,
    purchasedBytesInspected: false,
    storage: publicSceneryStoragePolicy(),
    texturePolicy: textureTierPolicyCopy(),
    sources,
    recipes: listRecipes().map((recipe) => ({
      recipeId: recipe.recipeId,
      displayName: recipe.displayName,
      biome: recipe.biome,
      requiredRoles: recipe.requiredRoles,
      optionalRoles: recipe.optionalRoles,
      textureTier: recipe.textureTier,
    })),
    assets: {
      registered: assets.length,
      normalizedPurchased: 0,
      quarantined: assets.filter((asset) => asset.approvalStatus === 'quarantined').length,
      approvedPurchased: assets.filter((asset) => asset.approvalStatus === 'approved').length,
      fixtureOnly: assets.filter((asset) => asset.approvalStatus === 'fixture_only').length,
    },
    fixtureAssets: assets
      .filter((asset) => asset.approvalStatus === 'fixture_only')
      .map((asset) => ({
        assetId: asset.assetId,
        displayName: asset.displayName,
        approvalStatus: asset.approvalStatus,
        tags: asset.tags,
      })),
    defaultSeed: DEFAULT_SCENERY_SEED,
    intake: publicIntakeSnapshot(getSceneryIntakeStore().listManifests()),
    missingPrerequisites: [
      'Confirmed 14-file inventory is registered. Internal archive files are not missing downloads.',
      'Normalized purchased assets are unavailable until a later approved pass.',
      'Real Blender inspection stays blocked unless an isolated Blender 4.2 worker is available.',
    ],
  };
}

export type { PublicScenerySnapshot };

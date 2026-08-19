import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { worldGraph } from './tivvlejoy-storybook-environment';
import {
  ARCHETYPE_IDS,
  ENVIRONMENT_RECIPES,
  EXISTING_LOCATIONS,
  assetGapDecision,
  botaniqLibraryAdapter,
  buildEnvironment,
  episodeEnvironmentDirector,
  environmentChangeImpact,
  recipeByName,
  recipeCount,
  sceneryCoverageReport,
  scalePlan60,
  scoreVariety,
  shotAssemblyEnvironmentAdapter,
  type WorldBuilderInput,
} from './tivvlejoy-world-builder';

const repoRoot = path.resolve(__dirname, '../../../..');

function bakery(overrides: Partial<WorldBuilderInput> = {}): WorldBuilderInput {
  return {
    locationId: 'bakery',
    archetypeId: 'BAKERY_EXTERIOR',
    season: 'SUMMER',
    weather: 'CLEAR',
    timeOfDay: 'MORNING_WARM',
    storyPurpose: 'open on the bakery',
    qualityTarget: 'HERO',
    seed: 4170179,
    storyPropIds: ['MAP_PROP_001'],
    storyPropStates: { MAP_PROP_001: 'discovered' },
    cameraTemplateId: 'TJ_CAM_ESTABLISHING_VERTICAL',
    focalTarget: 'HERO_SCENERY',
    ...overrides,
  };
}

describe('deterministic world builder', () => {
  it('builds deterministic blueprints and hashes', () => {
    const a = buildEnvironment(bakery());
    const b = buildEnvironment(bakery());
    expect(a.environmentDependencySha256).toBe(b.environmentDependencySha256);
    expect(a.baseIdentitySha256).toBe(b.baseIdentitySha256);
    expect(a.blueprint.environmentDependencySha256).toBe(a.environmentDependencySha256);
  });

  it('keeps the same seed identical and changes dressing only when the seed changes', () => {
    const a = buildEnvironment(bakery({ seed: 1 }));
    const b = buildEnvironment(bakery({ seed: 1 }));
    const c = buildEnvironment(bakery({ seed: 99 }));
    expect(a.environmentDependencySha256).toBe(b.environmentDependencySha256);
    expect(a.baseIdentitySha256).toBe(c.baseIdentitySha256);
    expect(a.environmentDependencySha256).not.toBe(c.environmentDependencySha256);
  });

  it('keeps season, weather, and time-of-day variants deterministic', () => {
    const season = buildEnvironment(bakery({ season: 'AUTUMN' }));
    const weather = buildEnvironment(bakery({ weather: 'RAIN' }));
    const time = buildEnvironment(bakery({ timeOfDay: 'NIGHT_COZY' }));
    expect(buildEnvironment(bakery({ season: 'AUTUMN' })).environmentDependencySha256).toBe(season.environmentDependencySha256);
    expect(buildEnvironment(bakery({ weather: 'RAIN' })).environmentDependencySha256).toBe(weather.environmentDependencySha256);
    expect(buildEnvironment(bakery({ timeOfDay: 'NIGHT_COZY' })).environmentDependencySha256).toBe(time.environmentDependencySha256);
    expect(season.variant.reusesArchitecture).toBe(true);
  });

  it('keeps the base environment immutable while variants reuse it', () => {
    const morning = buildEnvironment(bakery());
    const rain = buildEnvironment(bakery({ weather: 'RAIN', timeOfDay: 'RAINY_COZY' }));
    expect(morning.baseIdentitySha256).toBe(rain.baseIdentitySha256);
    expect(morning.kitbash.sourceImmutable).toBe(true);
    expect(morning.harmonization.sourceImmutable).toBe(true);
  });

  it('never randomly moves story props and keeps performance zones clear', () => {
    const env = buildEnvironment(bakery());
    expect(env.story.randomStoryPropMutation).toBe(false);
    expect(env.story.storyPropStates.MAP_PROP_001).toBe('discovered');
    expect(env.dressing.performanceZonesClear).toBe(true);
    expect(env.dressing.sightlineProtected).toBe(true);
    expect(env.path.walkablePolicyMet).toBe(true);
    expect(env.path.walkableRatio).toBeGreaterThanOrEqual(0.8);
  });

  it('flags excessive duplicates and builds depth plus quality tiers', () => {
    const env = buildEnvironment(bakery());
    expect(env.vegetation.obviousIdenticalCopies).toBeLessThanOrEqual(3);
    expect(env.vegetation.excessiveDuplication).toBe(false);
    expect(env.layers.FOREGROUND.qualityTier).toBe('SUPPORTING');
    expect(env.layers.MIDGROUND.qualityTier).toBe('HERO');
    expect(env.layers.BACKGROUND.qualityTier).toBe('BACKGROUND');
    expect(env.tiers.HERO.textureTarget).toBe(4096);
    expect(env.tiers.automaticUpscaleClaimed).toBe(false);
  });
});

describe('providers, recipes, continuity, and gaps', () => {
  it('uses native procedural fallback and does not require commercial plugins', () => {
    const env = buildEnvironment(bakery());
    expect(env.vegetation.provider).toBe('NATIVE_BLENDER');
    expect(env.vegetation.botaniqStatus).toBe('NOT_ACTIVATED');
    expect(env.vegetation.geoScatterStatus).toBe('NOT_INTEGRATED');
    expect(env.lighting.pluginDependency).toBe('NONE');
    expect(env.lighting.gaffer).toBe('OPTIONAL_PROVIDER_NOT_ACTIVATED');
    expect(env.lighting.physicalStarlight).toBe('OPTIONAL_PROVIDER_NOT_ACTIVATED');
    expect(botaniqLibraryAdapter().status).toBe('NOT_ACTIVATED');
    expect(botaniqLibraryAdapter().uploadIsNotApproval).toBe(true);
  });

  it('returns no-purchase-needed and requires a concrete gap for purchase', () => {
    const bakeryEnv = buildEnvironment(bakery());
    expect(assetGapDecision(bakeryEnv, bakery()).decision).toBe('REUSE_EXISTING');
    expect(assetGapDecision(bakeryEnv, bakery()).purchaseRequired).toBe('NO');
    const caveInput = bakery({
      archetypeId: 'CAVE_INTERIOR',
      locationId: 'forest_exit',
      storyPurpose: 'find the crystal chamber',
      requiredHeroRoles: ['CAVE_HERO_CRYSTAL'],
    });
    const cave = buildEnvironment(caveInput);
    const gap = assetGapDecision(cave, caveInput);
    expect(gap.decision).toBe('PURCHASE_MAY_BE_JUSTIFIED');
    expect(gap.missingSemanticRole).toBe('CAVE_HERO_CRYSTAL');
  });

  it('builds interior, forest, village, river, snow, beach, and cave recipes', () => {
    expect(buildEnvironment(recipeByName('Cozy Bakery Interior')!).interior?.kind).toBe('bakery');
    expect(buildEnvironment(recipeByName('Autumn Forest Trail')!).blueprint.biome).toBe('forest');
    expect(buildEnvironment(recipeByName('Sunny Bakery Morning')!).buildability).toBe('READY_FROM_EXISTING_LIBRARY');
    expect(buildEnvironment(recipeByName('Foggy River Road')!).water?.waterType).toBe('river');
    expect(buildEnvironment(recipeByName('Snowy Village Morning')!).terrain.terrainType).toBe('snow ground');
    expect(buildEnvironment(recipeByName('Beach Morning')!).terrain.terrainType).toBe('beach');
    expect(buildEnvironment(recipeByName('Cave Interior Placeholder')!).terrain.terrainType).toBe('cave floor');
  });

  it('keeps weather, time, and environment state continuity plus the world graph', () => {
    const director = episodeEnvironmentDirector();
    expect(director.weatherContinuity).toBe(true);
    expect(director.timeContinuity).toBe(true);
    expect(director.environments.every((item) => item.story.randomStoryPropMutation === false)).toBe(true);
    expect(worldGraph().nodes.length).toBeGreaterThan(0);
    expect(director.environments.every((item) => item.worldNode === null || typeof item.worldNode === 'string')).toBe(true);
  });

  it('warns when sets are too similar and suggests a low-cost fix', () => {
    const a = buildEnvironment(bakery());
    const b = buildEnvironment(bakery({ notes: 'label only' }));
    const variety = scoreVariety([a, b]);
    expect(variety.score).toBe('TOO_SIMILAR');
    expect(variety.suggestion).toMatch(/weather or time/i);
  });

  it('keeps performance and LOD plans deterministic', () => {
    expect(buildEnvironment(bakery()).budget.status).toBe(buildEnvironment(bakery()).budget.status);
    expect(buildEnvironment(bakery()).lod.byDistance.near).toBe('HERO_FULL');
    expect(buildEnvironment(bakery()).lod.meshConverted).toBe(false);
  });

  it('limits change impact to dependent shots', () => {
    const bakeryMorning = buildEnvironment(bakery());
    const bakeryRain = buildEnvironment(bakery({ weather: 'RAIN', timeOfDay: 'RAINY_COZY' }));
    const forestA = buildEnvironment(bakery({ locationId: 'forest_exit', archetypeId: 'FOREST_PATH', seed: 1 }));
    const forestB = buildEnvironment(bakery({ locationId: 'forest_exit', archetypeId: 'FOREST_PATH', seed: 20 }));
    const winter = buildEnvironment(bakery({ season: 'WINTER' }));
    const shots = [
      { shotId: 'SH001', locationId: 'bakery', season: 'SUMMER', weather: 'CLEAR' },
      { shotId: 'SH_RAIN', locationId: 'bakery', season: 'SUMMER', weather: 'RAIN' },
      { shotId: 'SH_FOREST', locationId: 'forest_exit', season: 'SUMMER', weather: 'CLEAR' },
      { shotId: 'SH_WINTER', locationId: 'bakery', season: 'WINTER', weather: 'CLEAR' },
    ];
    expect(environmentChangeImpact(bakeryMorning, bakeryRain, shots).affectedShotIds).toEqual(['SH_RAIN']);
    expect(environmentChangeImpact(forestA, forestB, shots).affectedShotIds).toEqual(['SH_FOREST']);
    expect(environmentChangeImpact(forestA, forestB, shots).affectedShotIds).not.toContain('SH001');
    expect(environmentChangeImpact(bakeryMorning, winter, shots).affectedShotIds).toEqual(['SH_WINTER']);
    expect(environmentChangeImpact(bakeryMorning, bakeryMorning, shots).affectedShotIds).toEqual([]);
  });

  it('exposes 25+ recipes and a deterministic shot-assembly adapter', () => {
    expect(recipeCount()).toBeGreaterThanOrEqual(25);
    expect(ENVIRONMENT_RECIPES).toHaveLength(recipeCount());
    const adapter = shotAssemblyEnvironmentAdapter(buildEnvironment(bakery()));
    expect(shotAssemblyEnvironmentAdapter(buildEnvironment(bakery())).adapterHash).toBe(adapter.adapterHash);
    expect(adapter.materialized).toBe(false);
  });

  it('does not execute Blender or launch paid GPU and leaves purchased-assets untouched', () => {
    const env = buildEnvironment(bakery());
    expect(env.safety.blenderExecuted).toBe(false);
    expect(env.safety.gpuLaunched).toBe(false);
    expect(env.safety.paidCompute).toBe(false);
    expect(existsSync(path.join(repoRoot, 'apps/web/src/app/purchased-assets'))).toBe(false);
    expect(existsSync(path.join(repoRoot, 'apps/web/src/app/api/purchased-tools'))).toBe(false);
    expect(existsSync(path.join(repoRoot, 'apps/web/src/components/preview/PurchasedToolsIphoneIntake.tsx'))).toBe(false);
    expect(existsSync(path.join(repoRoot, 'apps/web/src/lib/purchased-tools'))).toBe(false);
  });

  it('documents the world builder and keeps Preview copy free of legacy branding', () => {
    const docs = readFileSync(path.join(repoRoot, 'docs/TIVVLEJOY_WORLD_BUILDER_AND_SCENERY_AUTOMATION_V1.md'), 'utf8');
    const ui = readFileSync(path.join(repoRoot, 'apps/web/src/components/preview/WorldBuilder.tsx'), 'utf8');
    expect(docs).toContain('TIVVLEJOY_WORLD_BUILDER_V1');
    expect(docs).toContain('SCENERY PURCHASE REQUIRED');
    expect(ui).toContain('World Builder');
    expect(ui).toContain('WHAT WE ALREADY HAVE');
    expect(ui).not.toMatch(/DoodleDash/i);
    expect(EXISTING_LOCATIONS).toHaveLength(7);
    expect(ARCHETYPE_IDS.length).toBeGreaterThan(20);
    expect(sceneryCoverageReport().purchaseRecommended).toBe(false);
    expect(scalePlan60().baseLocations).toBe(7);
  });
});

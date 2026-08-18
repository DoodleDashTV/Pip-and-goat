import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CatalogAssetSchema, parseCatalogAsset } from './scenery/catalog';
import { createDryRunAssemblyReport, parseAssemblyReport, serializeAssemblyReport, buildBlenderAssembleArgv } from './scenery/assembly';
import { acceptanceSceneBrief, SYNTHETIC_SCENERY_CATALOG, fixtureRoleIds } from './scenery/fixtures';
import {
  buildBlenderInspectArgv,
  createDryRunInspectReport,
  parseInspectReport,
  serializeInspectReport,
} from './scenery/ingestion';
import { planSceneryScene } from './scenery/planner';
import { getRecipe, listRecipes, parseRecipe, SCENERY_RECIPES } from './scenery/recipes';
import {
  listRegisteredSources,
  resolveSourcePresence,
  validateSourceRecord,
} from './scenery/source-registry';
import { recommendTextureTier, resolveTextureTier } from './scenery/texture-policy';
import { DEFAULT_SCENERY_SEED, SCENERY_SCHEMA_VERSION, SceneryError } from './scenery/types';
import { validateCatalogRecord, validateScenePlan, validateSources } from './scenery/validation';
import { buildPublicScenerySnapshot } from './scenery/snapshot';

const repoRoot = path.resolve(__dirname, '../../../..');

function readRepo(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

describe('TivvleJoy scenery source registry', () => {
  it('validates registered purchased sources as unavailable and uninspected', () => {
    const sources = listRegisteredSources();
    expect(sources).toHaveLength(4);
    expect(sources.map((item) => item.sourceId).sort()).toEqual([
      'SRC_PROCEDURAL_NATURE',
      'SRC_SKY_HDRI',
      'SRC_STYLIZED_FOREST',
      'SRC_VILLAGE_ENV',
    ]);
    for (const source of sources) {
      expect(validateSourceRecord(source).ingestionStatus).toBe('source_unavailable');
      expect(source.bytesInspected).toBe(false);
      expect(source.sha256).toBeNull();
      expect(resolveSourcePresence(source).ingestionStatus).toBe('source_unavailable');
    }
    expect(validateSources().some((item) => item.code === 'MISSING_SOURCE')).toBe(true);
  });

  it('rejects an invalid source record', () => {
    expect(() => validateSourceRecord({ sourceId: 'bad' })).toThrow(SceneryError);
  });
});

describe('TivvleJoy scenery catalog schema', () => {
  it('accepts fixture catalog records and rejects invalid assets', () => {
    for (const asset of SYNTHETIC_SCENERY_CATALOG.assets.filter((item) => item.approvalStatus === 'fixture_only')) {
      expect(CatalogAssetSchema.parse(asset).assetId).toMatch(/^SCN_/);
    }
    expect(validateCatalogRecord({ assetId: 'nope' })[0]?.code).toBe('INVALID_CATALOG');
    expect(() =>
      parseCatalogAsset({
        ...SYNTHETIC_SCENERY_CATALOG.assets[0],
        assetId: 'not-an-id',
      }),
    ).toThrow(SceneryError);
  });

  it('refuses to approve uninspected purchased assets', () => {
    expect(() =>
      parseCatalogAsset({
        ...SYNTHETIC_SCENERY_CATALOG.assets[0],
        sourceId: 'SRC_VILLAGE_ENV',
        approvalStatus: 'approved',
        bytesInspected: false,
      }),
    ).toThrow(/cannot be approved/);
  });
});

describe('TivvleJoy scenery recipes', () => {
  it('validates the six foundation recipes', () => {
    expect(listRecipes().map((item) => item.recipeId)).toEqual([
      'forest_village_day',
      'forest_trail_day',
      'village_square_day',
      'cabin_exterior_day',
      'creek_clearing_day',
      'magical_clearing_night',
    ]);
    for (const recipe of SCENERY_RECIPES) {
      expect(parseRecipe(recipe).requiredRoles.length).toBeGreaterThan(0);
    }
  });

  it('detects a missing required role', () => {
    const catalog = {
      ...SYNTHETIC_SCENERY_CATALOG,
      assets: SYNTHETIC_SCENERY_CATALOG.assets.filter((asset) => asset.assetId !== 'SCN_FIXTURE_CABIN_001' && asset.assetId !== 'SCN_FIXTURE_UNAPPROVED_CABIN_001'),
    };
    expect(() => planSceneryScene(catalog, acceptanceSceneBrief())).toThrow(/Missing required recipe role: cabin/);
    expect(getRecipe('forest_village_day').requiredRoles).toContain('cabin');
  });
});

describe('TivvleJoy scenery planner', () => {
  it('reproduces the Forest Village acceptance plan for seed 4170179', () => {
    const brief = acceptanceSceneBrief();
    const first = planSceneryScene(SYNTHETIC_SCENERY_CATALOG, brief);
    const second = planSceneryScene(SYNTHETIC_SCENERY_CATALOG, brief);
    expect(brief.seed).toBe(DEFAULT_SCENERY_SEED);
    expect(first).toEqual(second);
    expect(first.rendered).toBe(false);
    expect(first.aspectRatio).toBe('9:16');
    expect(first.textureTier).toBe('2048');
    expect(first.characters).toEqual(['CHAR_PIP_001', 'CHAR_GOAT_001']);
    const ids = fixtureRoleIds();
    expect(first.placements.find((item) => item.role === 'cabin')?.assetId).toBe(ids.cabin);
    expect(first.placements.find((item) => item.role === 'path')?.assetId).toBe(ids.path);
    expect(first.placements.find((item) => item.role === 'tree_left')?.assetId).toBe(ids.tree_left);
    expect(first.placements.find((item) => item.role === 'tree_right')?.assetId).toBe(ids.tree_right);
    expect(first.placements.find((item) => item.role === 'rock')?.assetId).toBe(ids.rock);
    expect(first.placements.find((item) => item.role === 'flower')?.assetId).toBe(ids.flower);
    expect(first.placements.find((item) => item.role === 'creek')?.assetId).toBe(ids.creek);
    expect(first.placements.find((item) => item.role === 'butterfly')?.assetId).toBe(ids.butterfly);
    expect(first.placements.some((item) => item.assetId === 'SCN_FIXTURE_UNAPPROVED_CABIN_001')).toBe(false);
    const validation = validateScenePlan(first, SYNTHETIC_SCENERY_CATALOG, brief);
    expect(validation.findings.filter((item) => item.severity === 'error')).toEqual([]);
    expect(validation.ok).toBe(true);
    expect(validation.geometricBlenderRequired).toBe(true);
    expect(validation.geometricLimitation).toContain('Real Blender execution was not run');
  });

  it('varies transforms when the seed changes', () => {
    const a = planSceneryScene(SYNTHETIC_SCENERY_CATALOG, acceptanceSceneBrief());
    const b = planSceneryScene(SYNTHETIC_SCENERY_CATALOG, acceptanceSceneBrief({ seed: 99 }));
    expect(JSON.stringify(a.placements)).not.toEqual(JSON.stringify(b.placements));
    expect(a.seed).not.toBe(b.seed);
  });
});

describe('TivvleJoy scenery composition and gates', () => {
  it('flags character clearance and 9:16 camera-safe violations', () => {
    const brief = acceptanceSceneBrief();
    const plan = planSceneryScene(SYNTHETIC_SCENERY_CATALOG, brief);
    const blocked = {
      ...plan,
      placements: plan.placements.map((item) =>
        item.role === 'cabin' ? { ...item, position: { x: 0, y: 0, z: 0 } } : item,
      ),
    };
    const clearance = validateScenePlan(blocked, SYNTHETIC_SCENERY_CATALOG, brief);
    expect(clearance.findings.some((item) => item.code === 'CHARACTER_CLEARANCE')).toBe(true);

    const crowded = {
      ...plan,
      placements: plan.placements.map((item) =>
        item.role === 'flower' ? { ...item, position: { x: 0, y: 0, z: 3.2 }, scale: 6 } : item,
      ),
    };
    const camera = validateScenePlan(crowded, SYNTHETIC_SCENERY_CATALOG, brief);
    expect(camera.findings.some((item) => item.code === 'CAMERA_SAFE_9_16')).toBe(true);
  });

  it('enforces texture-tier policy and memory budget', () => {
    expect(recommendTextureTier('preview')).toBe('1024');
    expect(recommendTextureTier('standard')).toBe('2048');
    expect(recommendTextureTier('hero_closeup')).toBe('4096');
    const overBudget = resolveTextureTier(
      { requestedTier: '4096', memoryBudgetMb: 80, shotKind: 'standard' },
      2,
    );
    expect(overBudget.selectedTier).toBe('1024');
    expect(overBudget.rejectedTiers).toContain('4096');
    expect(overBudget.withinBudget).toBe(true);

    const tight = planSceneryScene(
      SYNTHETIC_SCENERY_CATALOG,
      acceptanceSceneBrief({ memoryBudgetMb: 30, textureTier: '4096', shotKind: 'standard' }),
    );
    expect(tight.textureTier).toBe('1024');
    const memory = validateScenePlan(
      {
        ...tight,
        textureDecision: { ...tight.textureDecision, withinBudget: false, estimatedMemoryMb: 9999 },
      },
      SYNTHETIC_SCENERY_CATALOG,
      acceptanceSceneBrief({ memoryBudgetMb: 30 }),
    );
    expect(memory.findings.some((item) => item.code === 'TEXTURE_MEMORY')).toBe(true);
  });

  it('enforces asset approval and provenance', () => {
    const brief = acceptanceSceneBrief();
    const plan = planSceneryScene(SYNTHETIC_SCENERY_CATALOG, brief);
    const unapproved = {
      ...plan,
      placements: plan.placements.map((item) =>
        item.role === 'cabin' ? { ...item, assetId: 'SCN_FIXTURE_UNAPPROVED_CABIN_001' } : item,
      ),
    };
    const approval = validateScenePlan(unapproved, SYNTHETIC_SCENERY_CATALOG, brief);
    expect(approval.findings.some((item) => item.code === 'UNAPPROVED_ASSET')).toBe(true);

    const stripped = {
      ...SYNTHETIC_SCENERY_CATALOG,
      assets: SYNTHETIC_SCENERY_CATALOG.assets.map((asset) =>
        asset.assetId === 'SCN_FIXTURE_CABIN_001' ? { ...asset, licensingProvenanceRef: '' } : asset,
      ),
    };
    const provenance = validateScenePlan(plan, stripped, brief);
    expect(provenance.findings.some((item) => item.code === 'MISSING_PROVENANCE')).toBe(true);
  });
});

describe('TivvleJoy scenery dry-run ingestion and assembly', () => {
  it('builds inspect commands and parses dry-run reports', () => {
    const argv = buildBlenderInspectArgv({
      sourceId: 'SRC_VILLAGE_ENV',
      sourceBlendPath: 'tivvlejoy-assets/source/village/Assembled Project File.blend',
      reportPath: 'tivvlejoy-assets/validation/village.json',
      normalizeOutputPath: 'tivvlejoy-assets/normalized/village',
      dryRun: true,
    });
    expect(argv).toContain('scripts/blender/scenery_inspect.py');
    expect(argv).toContain('--dry-run');
    const report = createDryRunInspectReport({
      sourceId: 'SRC_VILLAGE_ENV',
      sourceBlendPath: 'tivvlejoy-assets/source/village/source.blend',
      reportPath: 'tivvlejoy-assets/validation/village.json',
      normalizeOutputPath: 'tivvlejoy-assets/normalized/village',
      dryRun: true,
    });
    expect(report.blenderExecuted).toBe(false);
    expect(report.realExecution).toBe('not_run');
    expect(report.sourceModified).toBe(false);
    expect(parseInspectReport(JSON.parse(serializeInspectReport(report)))).toEqual(report);
  });

  it('builds assembly commands and keeps real assembly blocked', () => {
    const plan = planSceneryScene(SYNTHETIC_SCENERY_CATALOG, acceptanceSceneBrief());
    const argv = buildBlenderAssembleArgv({
      planPath: 'tivvlejoy-assets/catalogs/plan.json',
      outputBlendPath: 'tivvlejoy-assets/scenes/plan-v1.blend',
      reportPath: 'tivvlejoy-assets/validation/assemble.json',
      dryRun: true,
    });
    expect(argv).toContain('scripts/blender/scenery_assemble.py');
    const report = createDryRunAssemblyReport(plan, {
      planPath: 'tivvlejoy-assets/catalogs/plan.json',
      outputBlendPath: 'tivvlejoy-assets/scenes/plan-v1.blend',
      reportPath: 'tivvlejoy-assets/validation/assemble.json',
      dryRun: true,
    });
    expect(report.sceneWritten).toBe(false);
    expect(report.rendered).toBe(false);
    expect(report.realExecution).toBe('not_run');
    expect(parseAssemblyReport(JSON.parse(serializeAssemblyReport(report))).blockedReasons.length).toBeGreaterThan(0);
  });

  it('runs the Python inspect and assemble scripts in dry-run without Blender', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tivvlejoy-scenery-'));
    const inspectReport = path.join(dir, 'inspect.json');
    const assembleReport = path.join(dir, 'assemble.json');
    const planPath = path.join(dir, 'plan.json');
    writeFileSync(planPath, `${JSON.stringify(planSceneryScene(SYNTHETIC_SCENERY_CATALOG, acceptanceSceneBrief()))}\n`);
    const inspect = spawnSync(
      'python3',
      [
        path.join(repoRoot, 'scripts/blender/scenery_inspect.py'),
        '--source-id',
        'SRC_VILLAGE_ENV',
        '--source',
        path.join(dir, 'missing-source.blend'),
        '--report',
        inspectReport,
        '--normalize-out',
        path.join(dir, 'normalized'),
        '--dry-run',
      ],
      { encoding: 'utf8' },
    );
    expect(inspect.status).toBe(0);
    expect(JSON.parse(readFileSync(inspectReport, 'utf8')).realExecution).toBe('not_run');
    const assemble = spawnSync(
      'python3',
      [
        path.join(repoRoot, 'scripts/blender/scenery_assemble.py'),
        '--plan',
        planPath,
        '--output',
        path.join(dir, 'scene-v1.blend'),
        '--report',
        assembleReport,
        '--dry-run',
      ],
      { encoding: 'utf8' },
    );
    expect(assemble.status).toBe(0);
    expect(JSON.parse(readFileSync(assembleReport, 'utf8')).rendered).toBe(false);
  });
});

describe('TivvleJoy scenery studio preview', () => {
  it('keeps TivvleJoy preview-only copy and omits legacy brand wording', () => {
    const studio = readRepo('apps/web/src/components/preview/SceneryStudio.tsx');
    const page = readRepo('apps/web/src/app/scenery/page.tsx');
    const dashboard = readRepo('apps/web/src/components/preview/PreviewDashboard.tsx');
    const shell = readRepo('apps/web/src/components/StudioShell.tsx');
    expect(page).toContain('isPublicWebsitePreview');
    expect(page).toContain('SceneryStudio');
    expect(studio).toContain('SCENERY_COPY.previewOnly');
    expect(studio).toContain('SCENERY_COPY.noRender');
    expect(studio).toContain('SCENERY_COPY.generatePlan');
    expect(readRepo('apps/web/src/lib/scenery/copy.ts')).toContain('Preview Only');
    expect(readRepo('apps/web/src/lib/scenery/copy.ts')).toContain('No Render');
    expect(dashboard).toContain('Open Scenery');
    expect(dashboard).toContain('Preview Only');
    expect(dashboard).toContain('No Render');
    expect(dashboard).toContain('Production Setup → New Episode → Assets → Voices → Episode Workflow → Readiness → Render');
    expect(shell).toContain("{ href: '/scenery', label: 'Scenery' }");
    expect(`${studio}${page}${dashboard}`).not.toMatch(/DoodleDash/i);
    expect(buildPublicScenerySnapshot().purchasedBytesInspected).toBe(false);
    expect(buildPublicScenerySnapshot().rendered).toBe(false);
    expect(SCENERY_SCHEMA_VERSION).toBe('TIVVLEJOY_SCENERY_FOUNDATION_V1');
  });
});

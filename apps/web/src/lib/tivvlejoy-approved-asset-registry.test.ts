import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assembleShot, resolveAssetSlot } from './tivvlejoy-shot-assembly-manifest';
import { ep012AssemblyInputs } from './tivvlejoy-shot-assembly-manifest/fixture';
import { buildEnvironment, shotAssemblyEnvironmentAdapter } from './tivvlejoy-world-builder';
import {
  adaptAuditSource,
  approvedLibraryCoverage,
  assetDependencySha256,
  assetGapDecisionWithRegistry,
  buildApprovedAssetRegistry,
  categoryMappingFromRoles,
  conflictRegistry,
  largeSyntheticRegistry,
  makeApprovedAsset,
  makeResolutionRequest,
  mayApproveAsset,
  missingApprovalEvidence,
  normalizeSemanticRole,
  PRODUCTION_SEMANTIC_ROLES,
  resolveApprovedAsset,
  resolveWorldBuilderEnvironmentAssets,
  resolutionToEnvironmentSlot,
  SELECTABLE_SYNTHETIC_ASSETS,
  SYNTHETIC_APPROVED_ASSETS,
  SYNTHETIC_SHA,
  syntheticRegistry,
  type ApprovedAuditSourceInput,
  type AssetResolutionReceipt,
} from './tivvlejoy-approved-asset-registry';

const repoRoot = path.resolve(__dirname, '../../../..');

function request(
  registrySha: string,
  overrides: Partial<Parameters<typeof makeResolutionRequest>[0]> = {},
) {
  return makeResolutionRequest({
    slotId: 'SLOT_TEST',
    semanticRole: 'BUILDING_HERO',
    archetypeId: 'BAKERY_EXTERIOR',
    biome: 'village',
    depth: 'MIDGROUND',
    qualityTier: 'HERO',
    season: 'SUMMER',
    weather: 'CLEAR',
    styleRequirement: 'TIVVLEJOY_STORYBOOK',
    seed: 4170179,
    registrySnapshotSha256: registrySha,
    ...overrides,
  });
}

function bakeryEnv() {
  return buildEnvironment({
    locationId: 'bakery',
    archetypeId: 'BAKERY_EXTERIOR',
    season: 'SUMMER',
    weather: 'CLEAR',
    timeOfDay: 'MORNING_WARM',
    storyPurpose: 'open on the bakery',
    qualityTarget: 'HERO',
    seed: 4170179,
  });
}

describe('approved asset registry contracts', () => {
  it('builds a deterministic registry that ignores input order, filenames, and display names', () => {
    const a = syntheticRegistry();
    const b = buildApprovedAssetRegistry({ assets: [...DIAGNOSTIC_SHUFFLE()] });
    const renamed = buildApprovedAssetRegistry({
      assets: a.assets.map((asset) => ({ ...asset, displayName: `${asset.displayName}!`, originalFilename: 'renamed.zip' })),
    });
    expect(a.registrySha256).toBe(b.registrySha256);
    expect(a.registrySha256).toBe(renamed.registrySha256);
    expect(a.filenameSelectionAllowed).toBe(false);
    expect(a.mutableLatestAllowed).toBe(false);
  });

  it('changes the registry hash when a future asset is added', () => {
    const base = buildApprovedAssetRegistry({ assets: SELECTABLE_SYNTHETIC_ASSETS });
    const grown = buildApprovedAssetRegistry({
      assets: [...SELECTABLE_SYNTHETIC_ASSETS, SYNTHETIC_APPROVED_ASSETS.futureMeadowKit],
    });
    expect(grown.assets.length).toBe(base.assets.length + 1);
    expect(grown.registrySha256).not.toBe(base.registrySha256);
  });

  it('does not hard-code an asset count and works at 0, 1, and hundreds of assets', () => {
    expect(buildApprovedAssetRegistry({ assets: [] }).assets).toHaveLength(0);
    expect(buildApprovedAssetRegistry({ assets: [SYNTHETIC_APPROVED_ASSETS.sky] }).assets).toHaveLength(1);
    expect(largeSyntheticRegistry(100).assets.length).toBeGreaterThan(100);
    expect(largeSyntheticRegistry(500).assets.length).toBeGreaterThan(500);
  });

  it('keeps assetDependencySha256 independent of filename and displayName', () => {
    const asset = SYNTHETIC_APPROVED_ASSETS.villageHero;
    expect(assetDependencySha256({ ...asset, displayName: 'x', originalFilename: 'y.zip' } as typeof asset)).toBe(
      asset.assetDependencySha256,
    );
    expect(assetDependencySha256({ ...asset, sourceSha256: SYNTHETIC_SHA.srcB })).not.toBe(asset.assetDependencySha256);
  });

  it('normalizes SHRUB to SHRUBS and maps categories from classification, not filenames', () => {
    expect(normalizeSemanticRole('SHRUB')).toBe('SHRUBS');
    expect(PRODUCTION_SEMANTIC_ROLES).toContain('SHRUBS');
    expect(categoryMappingFromRoles(['MOUNTAIN_BACKGROUND', 'ROCK'], 'MOUNTAIN').categories).toEqual(
      expect.arrayContaining(['terrain', 'backgrounds']),
    );
    expect(readFileSync(path.join(repoRoot, 'apps/web/src/lib/tivvlejoy-approved-asset-registry/mapping.ts'), 'utf8')).not.toMatch(
      /mountain\.zip|tavern\.blend/,
    );
  });

  it('requires visual evidence before hero approval', () => {
    const missing = missingApprovalEvidence({
      evidence: {
        ...requireEvidenceShape(),
        visualEvidenceRefs: [],
        semanticClassification: {
          roles: ['BUILDING_HERO'],
          coverageCategories: ['architecture'],
          archetypes: ['BAKERY_EXTERIOR'],
          biomes: ['village'],
          kind: 'BUILDING',
        },
      },
      approval: null,
      qualityTier: 'HERO',
    });
    expect(missing).toEqual(expect.arrayContaining(['approval receipt', 'visual evidence present']));
    expect(mayApproveAsset).toBeTypeOf('function');
  });
});

describe('filename-independent resolver matrix', () => {
  const registry = syntheticRegistry();

  it('returns identical assets and receipts for the same request and seed', () => {
    const first = resolveApprovedAsset(registry, request(registry.registrySha256));
    const second = resolveApprovedAsset(registry, request(registry.registrySha256));
    expect(first.selectedAssetId).toBe('AA_VILLAGE_HERO_BUILDING');
    expect(first.resolutionReceiptSha256).toBe(second.resolutionReceiptSha256);
  });

  it('ignores shuffled candidates, filename metadata, and display names', () => {
    const shuffled = buildApprovedAssetRegistry({ assets: [...registry.assets].reverse() });
    const renamed = buildApprovedAssetRegistry({
      assets: registry.assets.map((asset) => ({ ...asset, displayName: 'UI label', originalFilename: 'pack.zip' })),
    });
    expect(resolveApprovedAsset(shuffled, request(shuffled.registrySha256)).selectedAssetId).toBe(
      resolveApprovedAsset(registry, request(registry.registrySha256)).selectedAssetId,
    );
    const renamedResult = resolveApprovedAsset(renamed, request(renamed.registrySha256));
    expect(renamedResult.selectedAssetId).toBe('AA_VILLAGE_HERO_BUILDING');
    expect(renamedResult.resolutionReceiptSha256).toBe(
      resolveApprovedAsset(registry, request(registry.registrySha256)).resolutionReceiptSha256,
    );
  });

  it('lets an exact archetype and biome beat a generic candidate regardless of seed', () => {
    const exact = resolveApprovedAsset(registry, request(registry.registrySha256, { seed: 1 }));
    const also = resolveApprovedAsset(registry, request(registry.registrySha256, { seed: 99 }));
    expect(exact.selectedAssetId).toBe('AA_VILLAGE_HERO_BUILDING');
    expect(also.selectedAssetId).toBe('AA_VILLAGE_HERO_BUILDING');
    expect(exact.selectedAssetId).not.toBe('AA_GENERIC_BUILDING');
  });

  it('prefers PRIMARY over a compatible alternate', () => {
    expect(resolveApprovedAsset(registry, request(registry.registrySha256)).selectedAssetId).toBe('AA_VILLAGE_HERO_BUILDING');
  });

  it('may select a fallback-enabled alternate when the primary cannot satisfy the request', () => {
    const primaryOnlyMeadow = makeApprovedAsset({
      assetId: 'AA_PRIMARY_MEADOW_ONLY',
      sourceId: 'SRC_SYN_MEADOW_ONLY',
      sourceSha256: SYNTHETIC_SHA.srcA,
      displayName: 'Meadow-only primary',
      kind: 'BUILDING',
      roles: ['BUILDING_HERO'],
      categories: ['architecture'],
      archetypes: ['BAKERY_EXTERIOR'],
      biomes: ['meadow'],
      depths: ['MIDGROUND'],
      qualities: ['HERO'],
      groupId: 'CANON_FALLBACK_DEMO',
      canonicalState: 'PRIMARY',
    });
    const alternateVillage = makeApprovedAsset({
      assetId: 'AA_ALT_VILLAGE',
      sourceId: 'SRC_SYN_ALT_VILLAGE',
      sourceSha256: SYNTHETIC_SHA.srcB,
      displayName: 'Village alternate',
      kind: 'BUILDING',
      roles: ['BUILDING_HERO'],
      categories: ['architecture'],
      archetypes: ['BAKERY_EXTERIOR'],
      biomes: ['village'],
      depths: ['MIDGROUND'],
      qualities: ['HERO'],
      groupId: 'CANON_FALLBACK_DEMO',
      canonicalState: 'ALTERNATE_APPROVED',
      fallbackEligible: true,
    });
    const local = buildApprovedAssetRegistry({ assets: [primaryOnlyMeadow, alternateVillage] });
    expect(resolveApprovedAsset(local, request(local.registrySha256)).selectedAssetId).toBe('AA_ALT_VILLAGE');
  });

  it('pins a valid continuity asset and refuses silent substitution when the pin is invalid', () => {
    const pinned = resolveApprovedAsset(
      registry,
      request(registry.registrySha256, { continuityAssetId: 'AA_VILLAGE_ALT_BUILDING' }),
    );
    expect(pinned.selectedAssetId).toBe('AA_VILLAGE_ALT_BUILDING');
    const invalid = resolveApprovedAsset(
      registry,
      request(registry.registrySha256, { continuityAssetId: 'AA_QUARANTINED' }),
    );
    expect(invalid.selectedAssetId).toBeNull();
    expect(invalid.resolutionState).toBe('BLOCKED_CONTINUITY_PIN_INVALID');
  });

  it('never selects DUPLICATE or ARCHIVAL wrappers', () => {
    expect(resolveApprovedAsset(registry, request(registry.registrySha256, { semanticRole: 'TREE_HERO', archetypeId: 'FOREST_PATH', biome: 'forest' })).selectedAssetId).toBe(
      'AA_FOREST_HERO_TREE',
    );
    expect(resolveApprovedAsset(registry, request(registry.registrySha256, { semanticRole: 'INTERIOR_SHELL', archetypeId: 'BAKERY_INTERIOR' })).selectedAssetId).toBe(
      'AA_TAVERN_INTERIOR_SHELL',
    );
  });

  it('fails closed on canonical PRIMARY conflict', () => {
    const conflicted = conflictRegistry();
    const result = resolveApprovedAsset(conflicted, request(conflicted.registrySha256));
    expect(result.resolutionState).toBe('BLOCKED_CANONICAL_CONFLICT');
    expect(result.selectedAssetId).toBeNull();
  });

  it('does not treat distinct logical assets from one source hash as automatic duplicates', () => {
    expect(SYNTHETIC_APPROVED_ASSETS.forestHeroTree.sourceSha256).toBe(SYNTHETIC_APPROVED_ASSETS.forestSupportTree.sourceSha256);
    expect(SYNTHETIC_APPROVED_ASSETS.forestHeroTree.assetId).not.toBe(SYNTHETIC_APPROVED_ASSETS.forestSupportTree.assetId);
    expect(resolveApprovedAsset(registry, request(registry.registrySha256, { semanticRole: 'TREE_SUPPORT', archetypeId: 'FOREST_PATH', biome: 'forest', qualityTier: 'SUPPORTING' })).selectedAssetId).toBe(
      'AA_FOREST_SUPPORT_TREE',
    );
  });

  it('returns unresolved when nothing is eligible and never invents a source', () => {
    const empty = buildApprovedAssetRegistry({ assets: [] });
    const result = resolveApprovedAsset(empty, request(empty.registrySha256));
    expect(result.resolutionState).toBe('UNRESOLVED_NO_ELIGIBLE_ASSET');
    expect(result.selectedAssetId).toBeNull();
    if ('inventedSource' in result) expect(result.inventedSource).toBe(false);
  });

  it('cannot resolve STORE_ONLY / Botaniq upload-only / failed inspection records', () => {
    expect(resolveApprovedAsset(registry, request(registry.registrySha256, { semanticRole: 'TREE_HERO', continuityAssetId: 'AA_BOTANIQ_UPLOAD_ONLY' })).resolutionState).toBe(
      'BLOCKED_CONTINUITY_PIN_INVALID',
    );
    const storeOnly: ApprovedAuditSourceInput = {
      sourceId: 'SRC_STORE_ONLY',
      catalogPresent: true,
      receiptPresent: true,
      stored: true,
      sizeVerified: true,
      sourceSha256: SYNTHETIC_SHA.srcA,
      sourceReceiptRef: 'receipt:x',
      inspectionState: 'AWAITING_INSPECTION',
      productionUsable: false,
      worldBuilderEligible: false,
      duplicateState: 'NONE',
      canonicalCandidate: true,
      blockers: [],
      warnings: ['STORE_ONLY'],
      activation: 'STORE_ONLY',
      sourceImmutable: true,
    };
    expect(adaptAuditSource(storeOnly).worldBuilderEligible).toBe(false);
  });

  it('fails closed for missing receipts, hashes, inspection, approval, provenance, and license', () => {
    expect(resolveApprovedAsset(registry, request(registry.registrySha256, { continuityAssetId: 'AA_MISSING_RECEIPT' })).resolutionState).toBe(
      'BLOCKED_CONTINUITY_PIN_INVALID',
    );
    expect(resolveApprovedAsset(registry, request(registry.registrySha256, { semanticRole: 'BUILDING_SUPPORT', continuityAssetId: 'AA_UNKNOWN_PROVENANCE' })).resolutionState).toBe(
      'BLOCKED_CONTINUITY_PIN_INVALID',
    );
    expect(resolveApprovedAsset(registry, request(registry.registrySha256, { semanticRole: 'BUILDING_SUPPORT', continuityAssetId: 'AA_LICENSE_BLOCKED' })).resolutionState).toBe(
      'BLOCKED_CONTINUITY_PIN_INVALID',
    );
    expect(resolveApprovedAsset(registry, request(registry.registrySha256, { continuityAssetId: 'AA_HASH_INVALID' })).resolutionState).toBe(
      'BLOCKED_CONTINUITY_PIN_INVALID',
    );
  });

  it('excludes style-incompatible and Blender-incompatible assets', () => {
    expect(resolveApprovedAsset(registry, request(registry.registrySha256, { continuityAssetId: 'AA_STYLE_INCOMPATIBLE' })).resolutionState).toBe(
      'BLOCKED_CONTINUITY_PIN_INVALID',
    );
    expect(resolveApprovedAsset(registry, request(registry.registrySha256, { continuityAssetId: 'AA_BLENDER_INCOMPATIBLE' })).resolutionState).toBe(
      'BLOCKED_CONTINUITY_PIN_INVALID',
    );
  });

  it('enforces quality capability: BACKGROUND cannot satisfy HERO or SUPPORTING', () => {
    const bg = resolveApprovedAsset(
      registry,
      request(registry.registrySha256, { semanticRole: 'MOUNTAIN_BACKGROUND', archetypeId: 'MOUNTAIN_OVERLOOK', biome: 'mountain', depth: 'BACKGROUND', qualityTier: 'HERO' }),
    );
    expect(bg.resolutionState).toBe('UNRESOLVED_NO_ELIGIBLE_ASSET');
    const supportOk = resolveApprovedAsset(
      registry,
      request(registry.registrySha256, { semanticRole: 'BUILDING_HERO', qualityTier: 'SUPPORTING' }),
    );
    expect(supportOk.selectedAssetId).toBe('AA_VILLAGE_HERO_BUILDING');
    const bgOk = resolveApprovedAsset(
      registry,
      request(registry.registrySha256, {
        semanticRole: 'MOUNTAIN_BACKGROUND',
        archetypeId: 'MOUNTAIN_OVERLOOK',
        biome: 'mountain',
        depth: 'BACKGROUND',
        qualityTier: 'BACKGROUND',
      }),
    );
    expect(bgOk.selectedAssetId).toBe('AA_MOUNTAIN_BACKGROUND');
  });

  it('keeps existing selections when a lower-ranked or unrelated asset is added', () => {
    const base = buildApprovedAssetRegistry({ assets: SELECTABLE_SYNTHETIC_ASSETS });
    const first = resolveApprovedAsset(base, request(base.registrySha256));
    const grown = buildApprovedAssetRegistry({
      assets: [...SELECTABLE_SYNTHETIC_ASSETS, SYNTHETIC_APPROVED_ASSETS.futureMeadowKit],
    });
    const second = resolveApprovedAsset(grown, request(grown.registrySha256));
    expect(second.selectedAssetId).toBe(first.selectedAssetId);
    expect(first).toMatchObject({ filenameUsedForSelection: false, mutableLatestUsed: false });
  });

  it('can select a newly approved higher-ranked asset on new unpinned resolutions only', () => {
    const base = buildApprovedAssetRegistry({ assets: [SYNTHETIC_APPROVED_ASSETS.genericBuilding] });
    const before = resolveApprovedAsset(base, request(base.registrySha256));
    expect(before.selectedAssetId).toBe('AA_GENERIC_BUILDING');
    const grown = buildApprovedAssetRegistry({
      assets: [SYNTHETIC_APPROVED_ASSETS.genericBuilding, SYNTHETIC_APPROVED_ASSETS.villageHero],
    });
    const after = resolveApprovedAsset(grown, request(grown.registrySha256));
    expect(after.selectedAssetId).toBe('AA_VILLAGE_HERO_BUILDING');
    expect(before.resolutionReceiptSha256).not.toBe(after.resolutionReceiptSha256);
  });

  it('keeps an already-bound shot receipt unchanged after library growth', () => {
    const base = buildApprovedAssetRegistry({ assets: SELECTABLE_SYNTHETIC_ASSETS });
    const bound = resolveApprovedAsset(base, request(base.registrySha256)) as AssetResolutionReceipt;
    const grown = buildApprovedAssetRegistry({
      assets: [...SELECTABLE_SYNTHETIC_ASSETS, SYNTHETIC_APPROVED_ASSETS.futureMeadowKit],
    });
    expect(bound.selectedAssetId).toBe('AA_VILLAGE_HERO_BUILDING');
    expect(grown.registrySha256).not.toBe(base.registrySha256);
    expect(bound.resolutionReceiptSha256).toBe(
      (resolveApprovedAsset(base, request(base.registrySha256)) as AssetResolutionReceipt).resolutionReceiptSha256,
    );
    expect(bound.registrySnapshotSha256).toBe(base.registrySha256);
  });

  it('settles equal-ranked ties deterministically from seed and asset identity', () => {
    const one = makeApprovedAsset({
      assetId: 'AA_TIE_A',
      sourceId: 'SRC_TIE_A',
      sourceSha256: SYNTHETIC_SHA.srcA,
      displayName: 'Tie A',
      kind: 'BACKGROUND',
      roles: ['BACKGROUND_FILL'],
      categories: ['backgrounds'],
      archetypes: ['GENERIC'],
      biomes: ['generic'],
      depths: ['BACKGROUND'],
      qualities: ['BACKGROUND'],
      groupId: 'CANON_TIE_A',
      canonicalState: 'PRIMARY',
      complexity: 2,
    });
    const two = makeApprovedAsset({
      assetId: 'AA_TIE_B',
      sourceId: 'SRC_TIE_B',
      sourceSha256: SYNTHETIC_SHA.srcB,
      displayName: 'Tie B',
      kind: 'BACKGROUND',
      roles: ['BACKGROUND_FILL'],
      categories: ['backgrounds'],
      archetypes: ['GENERIC'],
      biomes: ['generic'],
      depths: ['BACKGROUND'],
      qualities: ['BACKGROUND'],
      groupId: 'CANON_TIE_B',
      canonicalState: 'PRIMARY',
      complexity: 2,
    });
    const local = buildApprovedAssetRegistry({ assets: [one, two] });
    const seedOne = resolveApprovedAsset(
      local,
      request(local.registrySha256, { semanticRole: 'BACKGROUND_FILL', archetypeId: 'GENERIC', biome: 'generic', depth: 'BACKGROUND', qualityTier: 'BACKGROUND', seed: 1 }),
    );
    const seedTwo = resolveApprovedAsset(
      local,
      request(local.registrySha256, { semanticRole: 'BACKGROUND_FILL', archetypeId: 'GENERIC', biome: 'generic', depth: 'BACKGROUND', qualityTier: 'BACKGROUND', seed: 2 }),
    );
    expect(seedOne.selectedAssetId).toBeTruthy();
    expect(seedTwo.selectedAssetId).toBeTruthy();
    expect(['AA_TIE_A', 'AA_TIE_B']).toContain(seedOne.selectedAssetId);
  });

  it('propagates source, inspection, and approval hashes into dependency and resolution hashes', () => {
    const original = SYNTHETIC_APPROVED_ASSETS.villageHero;
    const sourceChanged = { ...original, sourceSha256: SYNTHETIC_SHA.srcB, assetDependencySha256: assetDependencySha256({ ...original, sourceSha256: SYNTHETIC_SHA.srcB }) };
    const inspectionChanged = { ...original, inspectionSha256: SYNTHETIC_SHA.srcC, assetDependencySha256: assetDependencySha256({ ...original, inspectionSha256: SYNTHETIC_SHA.srcC }) };
    const approvalChanged = { ...original, approvalSha256: SYNTHETIC_SHA.srcD, assetDependencySha256: assetDependencySha256({ ...original, approvalSha256: SYNTHETIC_SHA.srcD }) };
    expect(sourceChanged.assetDependencySha256).not.toBe(original.assetDependencySha256);
    expect(inspectionChanged.assetDependencySha256).not.toBe(original.assetDependencySha256);
    expect(approvalChanged.assetDependencySha256).not.toBe(original.assetDependencySha256);
    const a = buildApprovedAssetRegistry({ assets: [original] });
    const b = buildApprovedAssetRegistry({ assets: [sourceChanged] });
    expect(resolveApprovedAsset(a, request(a.registrySha256)).resolutionReceiptSha256).not.toBe(
      resolveApprovedAsset(b, request(b.registrySha256)).resolutionReceiptSha256,
    );
  });

  it('prohibits filename and latest lookup in resolver production code', () => {
    const resolver = readFileSync(path.join(repoRoot, 'apps/web/src/lib/tivvlejoy-approved-asset-registry/resolver.ts'), 'utf8');
    expect(resolver).not.toMatch(/originalFilename|expectedFilename|includes\('\.zip'\)|endsWith\('\.blend'\)/);
    expect(resolver).not.toMatch(/lookupLatest|selectLatest|mutableLatestUsed === true/);
    expect(request(registry.registrySha256)).not.toHaveProperty('originalFilename');
    expect(request(registry.registrySha256)).not.toHaveProperty('objectKey');
  });

  it('resolves a large synthetic registry deterministically', () => {
    const large = largeSyntheticRegistry(320);
    const first = resolveApprovedAsset(
      large,
      request(large.registrySha256, {
        semanticRole: 'MOUNTAIN_BACKGROUND',
        archetypeId: 'MOUNTAIN_OVERLOOK',
        biome: 'mountain',
        depth: 'BACKGROUND',
        qualityTier: 'BACKGROUND',
      }),
    );
    const second = resolveApprovedAsset(
      large,
      request(large.registrySha256, {
        semanticRole: 'MOUNTAIN_BACKGROUND',
        archetypeId: 'MOUNTAIN_OVERLOOK',
        biome: 'mountain',
        depth: 'BACKGROUND',
        qualityTier: 'BACKGROUND',
      }),
    );
    expect(first.selectedAssetId).toBe('AA_MOUNTAIN_BACKGROUND');
    expect(first.resolutionReceiptSha256).toBe(second.resolutionReceiptSha256);
  });
});

describe('world builder bridge and shot assembly propagation', () => {
  const registry = syntheticRegistry();

  it('keeps the planning-only adapter unchanged without a registry', () => {
    const env = bakeryEnv();
    const adapter = shotAssemblyEnvironmentAdapter(env);
    expect(adapter.approvedResolution).toBeNull();
    expect(adapter.environmentAssetSlots[0]?.sourceReceiptRef).toBe('UNRESOLVED');
    expect(shotAssemblyEnvironmentAdapter(env).adapterHash).toBe(adapter.adapterHash);
  });

  it('resolves bakery, interior, forest, mountain, river, and snow examples from semantic roles', () => {
    const cases = [
      ['BAKERY_EXTERIOR', 'bakery', 'AA_VILLAGE_HERO_BUILDING'],
      ['BAKERY_INTERIOR', 'bakery', 'AA_TAVERN_INTERIOR_SHELL'],
      ['FOREST_PATH', 'forest_exit', 'AA_FOREST_HERO_TREE'],
      ['MOUNTAIN_OVERLOOK', 'forest_exit', 'AA_MOUNTAIN_BACKGROUND'],
      ['RIVERBANK', 'river_road', 'AA_RIVER_WATER'],
      ['SNOW_VILLAGE', 'home_village', 'AA_BACKGROUND_FILL'],
    ] as const;
    for (const [archetypeId, locationId, expected] of cases) {
      const env = buildEnvironment({
        locationId,
        archetypeId,
        season: 'SUMMER',
        weather: 'CLEAR',
        timeOfDay: 'DAY_ADVENTURE',
        storyPurpose: 'example',
        qualityTarget:
          archetypeId === 'MOUNTAIN_OVERLOOK' || archetypeId === 'SNOW_VILLAGE'
            ? 'BACKGROUND'
            : archetypeId === 'RIVERBANK'
              ? 'SUPPORTING'
              : 'HERO',
        seed: 4170179,
      });
      const resolved = resolveWorldBuilderEnvironmentAssets(env, registry);
      expect(resolved.botaniqActivated).toBe(false);
      expect(resolved.slots[0]?.approvedAssetId).toBe(expected);
    }
  });

  it('propagates a successful resolution into Shot Assembly as RESOLVED_APPROVED', () => {
    const resolution = resolveApprovedAsset(registry, request(registry.registrySha256)) as AssetResolutionReceipt;
    const slot = resolutionToEnvironmentSlot(resolution, {
      semanticRole: 'BUILDING_HERO',
      qualityTier: 'HERO',
      required: true,
      visibilityClass: 'HERO',
    });
    const assembled = assembleShot({
      ...ep012AssemblyInputs()[0]!,
      environmentSlots: [slot],
    });
    const resolved = assembled.environmentAssets.slots[0]!;
    expect(resolved.dependencyStatus).toBe('RESOLVED_APPROVED');
    expect(resolved.blocker).toBeNull();
    expect(resolved.approvedAssetId).toBe(resolution.selectedAssetId);
    expect(resolved.approvedAssetVersion).toBe(resolution.selectedAssetVersion);
    expect(resolved.sourceReceiptRef).toBe(resolution.sourceReceiptRef);
    expect(resolved.sourceSha256).toBe(resolution.sourceSha256);
    expect(resolved.inspectionReceiptRef).toBe(resolution.inspectionReceiptRef);
    expect(resolved.inspectionSha256).toBe(resolution.inspectionSha256);
    expect(resolved.approvalReceiptRef).toBe(resolution.approvalReceiptRef);
    expect(resolved.approvalSha256).toBe(resolution.approvalSha256);
    expect(resolved.assetDependencySha256).toBe(resolution.assetDependencySha256);
    expect(resolved.resolutionReceiptSha256).toBe(resolution.resolutionReceiptSha256);
    expect(resolved.registrySnapshotSha256).toBe(resolution.registrySnapshotSha256);
    expect(resolved.filenameSubstitution).toBe(false);
    expect(resolved.latestUsed).toBe(false);
    expect(assembled.realAssemblyStatus).not.toBe('READY_FOR_REAL_ASSEMBLY');
    expect(assembled.characters.slots.every((slot) => slot.rigVersion === 'UNRESOLVED_PRODUCTION_RIG')).toBe(true);
  });

  it('changes the assembly manifest hash when source or approval evidence changes, not when labels change', () => {
    const resolution = resolveApprovedAsset(registry, request(registry.registrySha256)) as AssetResolutionReceipt;
    const slot = resolutionToEnvironmentSlot(resolution, {
      semanticRole: 'BUILDING_HERO',
      qualityTier: 'HERO',
      required: true,
      visibilityClass: 'HERO',
    });
    const first = assembleShot({ ...ep012AssemblyInputs()[0]!, environmentSlots: [slot] });
    const labelOnly = assembleShot({
      ...ep012AssemblyInputs()[0]!,
      environmentSlots: [slot],
      notes: 'filename village-hero.blend is provenance only',
    });
    expect(first.assemblyDependencySha256).toBe(labelOnly.assemblyDependencySha256);
    const mutated = assembleShot({
      ...ep012AssemblyInputs()[0]!,
      environmentSlots: [{ ...slot, sourceSha256: SYNTHETIC_SHA.srcB, assetDependencySha256: SYNTHETIC_SHA.srcC }],
    });
    expect(mutated.assemblyDependencySha256).not.toBe(first.assemblyDependencySha256);
  });

  it('maps resolver failures to Shot Assembly blockers without silent replacement', () => {
    const none = resolveApprovedAsset(buildApprovedAssetRegistry({ assets: [] }), request('00'.repeat(32)));
    const noneSlot = resolutionToEnvironmentSlot(none, {
      semanticRole: 'BUILDING_HERO',
      qualityTier: 'HERO',
      required: true,
      visibilityClass: 'HERO',
    });
    expect(resolveAssetSlot(noneSlot)).toMatchObject({ dependencyStatus: 'UNRESOLVED_SOURCE', blocker: 'MISSING_ENVIRONMENT_SOURCE' });
    expect(assembleShot({ ...ep012AssemblyInputs()[0]!, environmentSlots: [noneSlot] }).realAssemblyStatus).not.toBe(
      'READY_FOR_REAL_ASSEMBLY',
    );

    const unapproved = resolutionToEnvironmentSlot(
      { ...none, resolutionState: 'BLOCKED_UNAPPROVED', selectedAssetId: null, reason: 'unapproved', inventedSource: false, filenameUsedForSelection: false, mutableLatestUsed: false, schemaVersion: 'TIVVLEJOY_ASSET_RESOLUTION_FAILURE_V1', slotId: 'x', requestSha256: '11'.repeat(32), registrySnapshotSha256: '22'.repeat(32), resolutionReceiptSha256: '33'.repeat(32) },
      { semanticRole: 'BUILDING_HERO', qualityTier: 'HERO', required: true, visibilityClass: 'HERO' },
    );
    expect(resolveAssetSlot(unapproved)).toMatchObject({ dependencyStatus: 'BLOCKED_UNAPPROVED', blocker: 'UNAPPROVED_ASSET' });

    expect(
      resolveAssetSlot({
        slotId: 'q',
        semanticRole: 'BUILDING_HERO',
        qualityTier: 'HERO',
        required: true,
        visibilityClass: 'HERO',
        resolutionState: 'BLOCKED_QUARANTINED',
        approvalStatus: 'quarantined',
      }),
    ).toMatchObject({ dependencyStatus: 'BLOCKED_QUARANTINED', blocker: 'QUARANTINED_ASSET' });
    expect(
      resolveApprovedAsset(registry, request(registry.registrySha256, { continuityAssetId: 'AA_QUARANTINED' })).resolutionState,
    ).toBe('BLOCKED_CONTINUITY_PIN_INVALID');

    const conflicted = resolutionToEnvironmentSlot(resolveApprovedAsset(conflictRegistry(), request(conflictRegistry().registrySha256)), {
      semanticRole: 'BUILDING_HERO',
      qualityTier: 'HERO',
      required: true,
      visibilityClass: 'HERO',
    });
    expect(resolveAssetSlot(conflicted)).toMatchObject({ dependencyStatus: 'BLOCKED_CANONICAL_CONFLICT', blocker: 'CANONICAL_CONFLICT' });
    expect(conflicted.approvedAssetId ?? null).toBeNull();
  });

  it('does not inflate planning coverage and only recommends purchase for a concrete missing role', () => {
    const coverage = approvedLibraryCoverage(registry);
    expect(coverage.planningCoveragePercent).toBe(88);
    expect(coverage.productionReadyInflated).toBe(false);
    const env = bakeryEnv();
    const reuse = assetGapDecisionWithRegistry(env, { ...env.input, requiredHeroRoles: ['BUILDING_HERO'] }, registry);
    expect(reuse.decision).toBe('REUSE_EXISTING');
    const purchase = assetGapDecisionWithRegistry(env, { ...env.input, requiredHeroRoles: ['CAVE_HERO_CRYSTAL'], storyPurpose: 'find the crystal' }, registry);
    expect(purchase.decision).toBe('PURCHASE_MAY_BE_JUSTIFIED');
  });

  it('keeps provider policy fail-closed', () => {
    const resolved = resolveWorldBuilderEnvironmentAssets(bakeryEnv(), registry);
    expect(resolved.gafferActivated).toBe(false);
    expect(resolved.physicalStarlightActivated).toBe(false);
    expect(resolved.geoScatterIntegrated).toBe(false);
    expect(resolved.nativeProceduralUsed).toBe(true);
  });
});

function DIAGNOSTIC_SHUFFLE() {
  return [...syntheticRegistry().assets].sort(() => -1);
}

function requireEvidenceShape() {
  return {
    schemaVersion: 'TIVVLEJOY_ASSET_INSPECTION_EVIDENCE_V1' as const,
    sourceId: 'SRC',
    sourceReceiptRef: 'r',
    sourceSha256: SYNTHETIC_SHA.srcA,
    storedByteSize: 1,
    expectedByteSize: 1,
    sizeVerified: true,
    inspectionId: 'i',
    inspectionVersion: '1',
    inspectionPerformedAt: '2026-08-19T00:00:00.000Z',
    containerIntegrity: 'PASSED' as const,
    discoveredAssetId: 'A',
    discoveredAssetKind: 'BUILDING',
    nativeFormat: 'SYNTHETIC',
    blenderCompatibility: 'COMPATIBLE' as const,
    geometryMetrics: { verts: 1 },
    materialMetrics: { count: 1 },
    textureMetrics: { count: 1 },
    dimensions: { x: 1, y: 1, z: 1 },
    originAssessment: 'ok',
    scaleAssessment: 'ok',
    externalDependencies: [],
    requiredAddonDependencies: [],
    missingTextureRefs: [],
    missingExternalRefs: [],
    safetyAssessment: { scripts: 'SAFE' as const, network: 'SAFE' as const, shell: 'SAFE' as const },
    provenanceState: 'RESOLVED' as const,
    licenseState: 'APPROVED_INTERNAL' as const,
    visualEvidenceRefs: [],
    styleFingerprint: 'TIVVLEJOY_STORYBOOK',
    semanticClassification: {
      roles: ['BUILDING_HERO'] as const,
      coverageCategories: ['architecture'] as const,
      archetypes: ['BAKERY_EXTERIOR'],
      biomes: ['village'],
      kind: 'BUILDING',
    },
    canonicalRecommendation: { groupId: 'G', state: 'PRIMARY' as const },
    inspectionWarnings: [],
    inspectionBlockers: [],
    inspectionSha256: SYNTHETIC_SHA.srcA,
  };
}

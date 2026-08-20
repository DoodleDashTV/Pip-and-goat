import { describe, expect, it } from 'vitest';
import {
  analyzeBudget,
  analyzeScale,
  analyzeTransform,
  assessStyleCompatibility,
  buildHarmonizationRecipe,
  classifyDepth,
  classifyQuality,
  detectDuplicates,
  makeReceipt,
  recommendCanonical,
  versionIdentity,
  discoverLogicalAssets,
} from './tivvlejoy-real-scenery-inspection';

describe('style, quality, depth and canonical analysis', () => {
  it('assesses EXACT, HARMONIZABLE, INCOMPATIBLE and UNKNOWN style', () => {
    expect(assessStyleCompatibility({ realismLevel: 'STORYBOOK', textureStyle: 'PAINTED' }).state).toBe('EXACT');
    expect(assessStyleCompatibility({ realismLevel: 'STYLIZED', textureStyle: 'MIXED' }).state).toBe('HARMONIZABLE');
    expect(assessStyleCompatibility({ realismLevel: 'REALISTIC', materialComplexity: 'HIGH', textureStyle: 'PBR_REALISTIC' }).state).toBe('INCOMPATIBLE');
    expect(assessStyleCompatibility({}).state).toBe('UNKNOWN');
    expect(assessStyleCompatibility({ realismLevel: 'STORYBOOK' }).commercialMaterialModified).toBe(false);
  });

  it('creates non-destructive harmonization recipes only', () => {
    const style = assessStyleCompatibility({ realismLevel: 'STYLIZED' });
    const recipe = buildHarmonizationRecipe(style);
    expect(recipe?.recipeGenerated).toBe(true);
    expect(recipe?.recipeExecuted).toBe(false);
    expect(buildHarmonizationRecipe(assessStyleCompatibility({ realismLevel: 'STORYBOOK', textureStyle: 'PAINTED' }))).toBeNull();
  });

  it('classifies quality tiers and never auto-approves hero', () => {
    const hero = classifyQuality({
      triangleEstimate: 20_000,
      textureMax: 2048,
      materialComplete: true,
      technicallyClean: true,
      dependenciesComplete: true,
      style: 'EXACT',
      roles: ['BUILDING_HERO'],
    });
    expect(hero.tiers).toContain('HERO');
    expect(hero.heroRequiresHumanVisualApproval).toBe(true);
    const background = classifyQuality({
      triangleEstimate: 200,
      textureMax: 256,
      dependenciesComplete: true,
      style: 'HARMONIZABLE',
      roles: ['MOUNTAIN_BACKGROUND'],
    });
    expect(background.tiers).toContain('BACKGROUND');
    expect(background.tiers).not.toContain('HERO');
  });

  it('keeps useful background assets even when they fail hero', () => {
    const depth = classifyDepth({
      quality: ['BACKGROUND'],
      roles: ['MOUNTAIN_BACKGROUND', 'BACKGROUND_FILL'],
      triangleEstimate: 400,
    });
    expect(depth.tiers).toContain('BACKGROUND');
  });

  it('records scale and transform without altering the source', () => {
    expect(analyzeScale({}).state).toBe('SCALE_UNKNOWN');
    expect(analyzeScale({ dimensions: { x: 8, y: 6, z: 10 } }).state).toBe('SCALE_PLAUSIBLE');
    expect(analyzeScale({ dimensions: { x: 99999, y: 1, z: 1 } }).state).toBe('SCALE_REVIEW_REQUIRED');
    expect(analyzeScale({ dimensions: { x: 8, y: 6, z: 10 } }).rescaled).toBe(false);
    const transform = analyzeTransform({ scale: { x: -1, y: 2, z: 200 }, origin: { x: 0, y: 0, z: 0 } });
    expect(transform.negativeScale).toBe(true);
    expect(transform.unappliedScale).toBe(true);
    expect(transform.extremeTransforms).toBe(true);
    expect(transform.sourceAltered).toBe(false);
  });

  it('assigns performance bands without GPU claims', () => {
    expect(analyzeBudget({ triangleEstimate: 100, quality: 'BACKGROUND' }).band).toBe('LIGHT');
    expect(analyzeBudget({ triangleEstimate: 20_000, quality: 'SUPPORTING' }).band).toBe('NORMAL');
    expect(analyzeBudget({ triangleEstimate: 120_000, quality: 'HERO' }).band).toBe('HEAVY');
    expect(analyzeBudget({ triangleEstimate: 400_000, quality: 'HERO' }).gpuPerformanceClaimed).toBe(false);
  });

  it('detects duplicates without collapsing distinct logical children', () => {
    const sha = 'ee'.repeat(32);
    const children = discoverLogicalAssets({
      sourceId: 'SRC_TAVERN',
      sourceSha256: sha,
      hints: [
        { internalStableRef: 'interior_shell:tavern', assetKind: 'interior_shell' },
        { internalStableRef: 'table:01', assetKind: 'table' },
      ],
    });
    const report = detectDuplicates({
      sources: [makeReceipt({ sourceId: 'SRC_TAVERN', sourceSha256: sha }), makeReceipt({ sourceId: 'SRC_COPY', sourceSha256: sha })],
      children,
    });
    expect(report.exactSourceShaGroups[0]?.sourceIds).toHaveLength(2);
    expect(report.sameSourceDistinctChildrenPreserved).toBe(true);
    expect(report.logicalCanonicalGroups).toHaveLength(2);
  });

  it('keeps wrappers and historical versions separately identifiable', () => {
    const child = discoverLogicalAssets({
      sourceId: 'SRC_WRAP',
      sourceSha256: 'ff'.repeat(32),
      hints: [{ internalStableRef: 'building:tavern', assetKind: 'building' }],
    })[0]!;
    const wrapper = recommendCanonical({
      receipt: makeReceipt({ sourceId: 'SRC_WRAP', wrapperOfSourceId: 'SRC_DIRECT', formatHint: 'ZIP' }),
      child,
    });
    const historical = recommendCanonical({
      receipt: makeReceipt({ sourceId: 'SRC_OLD', historicalOfSourceId: 'SRC_NEW', packageFamily: 'Gaffer', packageVersion: '3.0' }),
      child,
    });
    const direct = recommendCanonical({
      receipt: makeReceipt({ sourceId: 'SRC_DIRECT', canonicalSourceRelation: 'DIRECT_ORIGINAL', formatHint: 'BLEND' }),
      child,
    });
    expect(wrapper.state).toBe('ARCHIVAL');
    expect(historical.state).toBe('ARCHIVAL');
    expect(direct.state).toBe('PRIMARY');
    expect(wrapper.mutableLatestUsed).toBe(false);
    expect(versionIdentity(makeReceipt({ sourceId: 'SRC_G1', packageFamily: 'Gaffer', packageVersion: '3.1' }))).not.toBe(
      versionIdentity(makeReceipt({ sourceId: 'SRC_G2', packageFamily: 'Gaffer', packageVersion: '4.0' })),
    );
  });
});

describe('quality and depth matrix', () => {
  for (const role of ['BUILDING_HERO', 'TREE_HERO', 'MOUNTAIN_HERO', 'INTERIOR_SHELL'] as const) {
    it(`requires later visual approval for ${role}`, () => {
      const quality = classifyQuality({
        triangleEstimate: 12_000,
        textureMax: 2048,
        materialComplete: true,
        technicallyClean: true,
        dependenciesComplete: true,
        style: 'EXACT',
        roles: [role],
      });
      expect(quality.heroRequiresHumanVisualApproval).toBe(true);
    });
  }
  for (const role of ['SKY', 'BACKGROUND_FILL', 'MOUNTAIN_BACKGROUND', 'TREE_BACKGROUND'] as const) {
    it(`keeps ${role} eligible as background`, () => {
      expect(classifyDepth({ quality: ['BACKGROUND'], roles: [role], triangleEstimate: 300 }).tiers).toContain('BACKGROUND');
    });
  }
});

describe('canonical, scale and budget extras', () => {
  it('does not generate a recipe for incompatible or exact styles', () => {
    expect(buildHarmonizationRecipe(assessStyleCompatibility({ realismLevel: 'REALISTIC', materialComplexity: 'HIGH', textureStyle: 'PBR_REALISTIC' }))).toBeNull();
    expect(buildHarmonizationRecipe(assessStyleCompatibility({ realismLevel: 'STORYBOOK', textureStyle: 'PAINTED' }))).toBeNull();
  });

  it('keeps recipe steps as plans only', () => {
    const recipe = buildHarmonizationRecipe(assessStyleCompatibility({ realismLevel: 'STYLIZED' }));
    expect(recipe?.steps).toEqual(
      expect.arrayContaining(['material simplification', 'storybook lighting treatment', 'vegetation density adjustment']),
    );
    expect(recipe?.recipeExecuted).toBe(false);
  });

  it('classifies prop, building and terrain scale categories without rescaling', () => {
    expect(analyzeScale({ dimensions: { x: 0.4, y: 0.4, z: 0.4 } }).probableScaleCategory).toBe('PROP');
    expect(analyzeScale({ dimensions: { x: 12, y: 8, z: 10 } }).probableScaleCategory).toBe('BUILDING');
    expect(analyzeScale({ dimensions: { x: 80, y: 40, z: 80 } }).probableScaleCategory).toBe('TERRAIN');
    expect(analyzeScale({ dimensions: { x: 12, y: 8, z: 10 } }).rescaled).toBe(false);
  });

  it('records origin offset and rotation without altering the source', () => {
    const transform = analyzeTransform({
      origin: { x: 4, y: 0, z: -2 },
      rotation: { x: 0, y: 90, z: 0 },
      boundingBoxOffset: { x: 1, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    });
    expect(transform.origin).toEqual({ x: 4, y: 0, z: -2 });
    expect(transform.rotation).toEqual({ x: 0, y: 90, z: 0 });
    expect(transform.unappliedScale).toBe(false);
    expect(transform.sourceAltered).toBe(false);
  });

  it('assigns VERY_HEAVY without claiming GPU performance', () => {
    const budget = analyzeBudget({ triangleEstimate: 400_000, textureBytes: 90 * 1024 * 1024, quality: 'HERO' });
    expect(budget.band).toBe('VERY_HEAVY');
    expect(budget.gpuPerformanceClaimed).toBe(false);
    expect(budget.textureMemoryEstimateBytes).toBe(90 * 1024 * 1024);
  });

  it('detects exact child geometry and texture hashes without collapsing kinds', () => {
    const report = detectDuplicates({
      sources: [makeReceipt({ sourceId: 'A' })],
      children: discoverLogicalAssets({
        sourceId: 'A',
        sourceSha256: 'aa'.repeat(32),
        hints: [
          { internalStableRef: 'table:1', assetKind: 'table' },
          { internalStableRef: 'chair:1', assetKind: 'chair' },
        ],
      }),
      geometryHashes: [
        { candidateId: 'c1', hash: 'gg'.repeat(32) },
        { candidateId: 'c2', hash: 'gg'.repeat(32) },
      ],
      textureHashes: [
        { ref: 'wood.png', sha256: 'tt'.repeat(32) },
        { ref: 'wood-copy.png', sha256: 'tt'.repeat(32) },
      ],
    });
    expect(report.exactChildGeometryGroups[0]?.candidateIds).toHaveLength(2);
    expect(report.exactTextureGroups[0]?.refs).toHaveLength(2);
    expect(report.logicalCanonicalGroups).toHaveLength(2);
  });

  it('keeps Gaffer, Starlight and Botaniq versions separately identifiable', () => {
    expect(versionIdentity(makeReceipt({ sourceId: 'G1', packageFamily: 'Gaffer', packageVersion: '3.1' }))).toBe('Gaffer::3.1');
    expect(versionIdentity(makeReceipt({ sourceId: 'G2', packageFamily: 'Gaffer', packageVersion: '4.0' }))).toBe('Gaffer::4.0');
    expect(versionIdentity(makeReceipt({ sourceId: 'S1', packageFamily: 'Physical Starlight', packageVersion: '2' }))).not.toBe(
      versionIdentity(makeReceipt({ sourceId: 'S2', packageFamily: 'Physical Starlight', packageVersion: '3' })),
    );
  });

  it('marks receipt-level duplicates as DUPLICATE, not primary', () => {
    const child = discoverLogicalAssets({
      sourceId: 'SRC_DUP',
      sourceSha256: 'ab'.repeat(32),
      hints: [{ internalStableRef: 'rock:1', assetKind: 'rock' }],
    })[0]!;
    expect(recommendCanonical({ receipt: makeReceipt({ sourceId: 'SRC_DUP', canonicalSourceRelation: 'DUPLICATE' }), child }).state).toBe(
      'DUPLICATE',
    );
  });
});

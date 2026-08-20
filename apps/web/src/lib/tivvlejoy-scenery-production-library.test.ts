import { describe, expect, it } from 'vitest';
import { syntheticRegistry } from './tivvlejoy-approved-asset-registry';
import {
  buildProductionLibrary,
  categoryFor,
  findApprovedAssets,
  findByFilename,
  genuineSemanticGaps,
  refreshLongevityFromLibrary,
  refreshWorldBuilderFromLibrary,
  sceneryVersionChangeImpact,
} from './tivvlejoy-real-scenery-inspection';

function approved(role: 'INTERIOR_SHELL' | 'TREE_HERO' | 'MOUNTAIN_BACKGROUND' | 'SKY', extra: Partial<Parameters<typeof buildProductionLibrary>[0][number]> = {}) {
  return {
    assetId: `AA_${role}`,
    assetVersion: 'v1',
    category: categoryFor({ approved: true, blocked: false, archival: false, quality: ['HERO'], roles: [role] }),
    semanticRoles: [role],
    archetypes: role === 'INTERIOR_SHELL' ? ['TAVERN'] : ['FOREST_PATH'],
    quality: ['HERO'] as Array<'HERO' | 'SUPPORTING' | 'BACKGROUND'>,
    sourceId: `SRC_${role}`,
    inspectionSha256: '55'.repeat(32),
    approvalSha256: '66'.repeat(32),
    worldBuilderEligible: true,
    ...extra,
  };
}

describe('TIVVLEJOY_SCENERY_PRODUCTION_LIBRARY_V1', () => {
  it('indexes approved assets without storing binaries', () => {
    const library = buildProductionLibrary([
      approved('INTERIOR_SHELL'),
      approved('TREE_HERO', { quality: ['SUPPORTING'], category: 'APPROVED_VEGETATION' }),
      {
        ...approved('SKY'),
        category: 'AWAITING_REVIEW',
        approvalSha256: null,
        worldBuilderEligible: false,
      },
    ]);
    expect(library.binaryFilesInGit).toBe(false);
    expect(library.indexes.byRole.get('INTERIOR_SHELL')).toHaveLength(1);
    expect(findApprovedAssets(library, { role: 'INTERIOR_SHELL', archetype: 'TAVERN', quality: 'HERO' })).toHaveLength(1);
    expect(findApprovedAssets(library, { role: 'SKY' })).toHaveLength(0);
    expect(() => findByFilename(library, 'Tavern.zip')).toThrow(/not a production resolver/);
  });

  it('refreshes World Builder capacities without changing resolver source', () => {
    const library = buildProductionLibrary([approved('INTERIOR_SHELL'), approved('MOUNTAIN_BACKGROUND'), approved('TREE_HERO')]);
    const refresh = refreshWorldBuilderFromLibrary(library);
    expect(refresh.interiorCapacity).toBe(1);
    expect(refresh.mountainCapacity).toBe(1);
    expect(refresh.vegetationCapacity).toBe(1);
    expect(refresh.resolverSourceChanged).toBe(false);
  });

  it('distinguishes synthetic planning from real approved library analysis', () => {
    const empty = refreshLongevityFromLibrary({ library: buildProductionLibrary([]), requestedEpisodeCount: 60 });
    expect(empty.analysisClass).toBe('SYNTHETIC_PLANNING_ANALYSIS');
    expect(empty.claimsProductionCapacityFromUnapproved).toBe(false);
    const real = refreshLongevityFromLibrary({
      library: buildProductionLibrary([approved('INTERIOR_SHELL')]),
      requestedEpisodeCount: 60,
    });
    expect(real.analysisClass).toBe('REAL_APPROVED_LIBRARY_ANALYSIS');
  });

  it('recommends specialty gaps only from planned story demand', () => {
    const library = buildProductionLibrary([approved('TREE_HERO')]);
    expect(genuineSemanticGaps({ plannedStoryRoles: ['CAVE_HERO', 'TREE_HERO'], library })).toEqual(['CAVE_HERO']);
    expect(genuineSemanticGaps({ plannedStoryRoles: ['random filename'], library })).toEqual([]);
  });

  it('invalidates only dependent scenery bindings on version change', () => {
    const impact = sceneryVersionChangeImpact({
      assetId: 'AA_TAVERN',
      previousVersion: 'v1',
      nextVersion: 'v2',
      dependentResolutions: ['res-1'],
      dependentSlots: ['slot-1'],
      dependentManifests: ['man-1'],
      dependentPackets: ['EP001'],
    });
    expect(impact.invalidatedEpisodePackets).toEqual(['EP001']);
    expect(impact.voicesInvalidated).toBe(false);
    expect(impact.unrelatedCharacterAnimationInvalidated).toBe(false);
    expect(impact.unrelatedSceneryInvalidated).toBe(false);
    expect(sceneryVersionChangeImpact({
      assetId: 'AA_TAVERN',
      previousVersion: 'v1',
      nextVersion: 'v1',
      dependentResolutions: ['res-1'],
      dependentSlots: [],
      dependentManifests: [],
      dependentPackets: [],
    }).invalidatedRegistryResolutions).toEqual([]);
  });

  it('does not make unapproved assets World Builder eligible', () => {
    const library = buildProductionLibrary([
      { ...approved('INTERIOR_SHELL'), approvalSha256: null, worldBuilderEligible: false, category: 'AWAITING_REVIEW' },
    ]);
    expect(findApprovedAssets(library, { role: 'INTERIOR_SHELL' })).toHaveLength(0);
    expect(refreshWorldBuilderFromLibrary(library).interiorCapacity).toBe(0);
  });

  it('keeps the existing PR #80 registry resolver filename-independent', () => {
    const registry = syntheticRegistry();
    expect(registry.filenameSelectionAllowed).toBe(false);
    expect(registry.mutableLatestAllowed).toBe(false);
  });
});

describe('library category and search matrix', () => {
  const roles = ['INTERIOR_SHELL', 'TREE_HERO', 'MOUNTAIN_BACKGROUND', 'SKY', 'STREET_PROP', 'GRASS', 'BUILDING_HERO'] as const;
  for (const role of roles) {
    it(`indexes and finds ${role} without filename selection`, () => {
      const record = approved(role === 'STREET_PROP' || role === 'GRASS' || role === 'BUILDING_HERO' ? 'TREE_HERO' : role, {
        assetId: `AA_${role}`,
        semanticRoles: [role],
        archetypes: ['village', 'tavern', 'forest'],
        quality: ['HERO', 'SUPPORTING', 'BACKGROUND'],
      });
      const library = buildProductionLibrary([record]);
      expect(findApprovedAssets(library, { role }).every((item) => item.semanticRoles.includes(role))).toBe(true);
      expect(library.indexes.byAssetId.has(`${record.assetId}:${record.assetVersion}`)).toBe(true);
    });
  }
  it('categorizes blocked, archival and awaiting review separately', () => {
    expect(categoryFor({ approved: false, blocked: true, archival: false, quality: [], roles: [] })).toBe('BLOCKED');
    expect(categoryFor({ approved: false, blocked: false, archival: true, quality: [], roles: [] })).toBe('ARCHIVAL');
    expect(categoryFor({ approved: false, blocked: false, archival: false, quality: [], roles: [] })).toBe('AWAITING_REVIEW');
    expect(categoryFor({ approved: true, blocked: false, archival: false, quality: ['BACKGROUND'], roles: ['BACKGROUND_FILL'] })).toBe('APPROVED_BACKGROUND');
  });

  it('categorizes hero, supporting, interior, vegetation, prop and sky families', () => {
    expect(categoryFor({ approved: true, blocked: false, archival: false, quality: ['HERO'], roles: ['BUILDING_HERO'] })).toBe('APPROVED_HERO');
    expect(categoryFor({ approved: true, blocked: false, archival: false, quality: ['SUPPORTING'], roles: ['BUILDING_SUPPORT'] })).toBe('APPROVED_SUPPORTING');
    expect(categoryFor({ approved: true, blocked: false, archival: false, quality: ['HERO'], roles: ['INTERIOR_PROP'] })).toBe('APPROVED_INTERIOR');
    expect(categoryFor({ approved: true, blocked: false, archival: false, quality: ['BACKGROUND'], roles: ['VINES'] })).toBe('APPROVED_VEGETATION');
    expect(categoryFor({ approved: true, blocked: false, archival: false, quality: ['SUPPORTING'], roles: ['SIGNAGE'] })).toBe('APPROVED_PROP');
    expect(categoryFor({ approved: true, blocked: false, archival: false, quality: ['BACKGROUND'], roles: ['SKY'] })).toBe('APPROVED_SKY');
  });

  it('refreshes hero, background and prop capacities from approved records only', () => {
    const library = buildProductionLibrary([
      approved('INTERIOR_SHELL'),
      approved('TREE_HERO'),
      approved('MOUNTAIN_BACKGROUND', { quality: ['BACKGROUND'] }),
      {
        ...approved('SKY'),
        semanticRoles: ['STREET_PROP'],
        category: 'APPROVED_PROP',
        approvalSha256: '66'.repeat(32),
      },
    ]);
    const refresh = refreshWorldBuilderFromLibrary(library);
    expect(refresh.heroLocationAvailability).toBeGreaterThan(0);
    expect(refresh.backgroundCapacity).toBeGreaterThan(0);
    expect(refresh.propCapacity).toBeGreaterThan(0);
    expect(refresh.resolverSourceChanged).toBe(false);
  });

  it('does not recommend specialty purchases from a missing filename', () => {
    const library = buildProductionLibrary([approved('TREE_HERO')]);
    expect(genuineSemanticGaps({ plannedStoryRoles: ['SuperVillage.zip', 'CASTLE_RUIN_HERO'], library })).toEqual([
      'CASTLE_RUIN_HERO',
    ]);
  });

  it('keeps specialty story roles closed unless planned demand exists', () => {
    const library = buildProductionLibrary([approved('TREE_HERO')]);
    expect(
      genuineSemanticGaps({
        plannedStoryRoles: ['CAVE_HERO', 'COASTAL_HERO', 'UNDERWATER_HERO', 'DESERT_HERO', 'SWAMP_HERO'],
        library,
      }),
    ).toEqual(['CAVE_HERO', 'COASTAL_HERO', 'UNDERWATER_HERO', 'DESERT_HERO', 'SWAMP_HERO']);
  });

  it('filters approved search by quality and refuses unapproved SKY', () => {
    const library = buildProductionLibrary([
      approved('INTERIOR_SHELL', { quality: ['HERO', 'SUPPORTING'] }),
      { ...approved('SKY'), approvalSha256: null, worldBuilderEligible: false, category: 'AWAITING_REVIEW' },
    ]);
    expect(findApprovedAssets(library, { role: 'INTERIOR_SHELL', quality: 'HERO' })).toHaveLength(1);
    expect(findApprovedAssets(library, { role: 'SKY' })).toHaveLength(0);
  });

  it('indexes 200 library records without filename selection', () => {
    const records = Array.from({ length: 200 }, (_, index) => ({
      ...approved('TREE_HERO'),
      assetId: `AA_SCALE_${index}`,
      sourceId: `SRC_SCALE_${index}`,
    }));
    const library = buildProductionLibrary(records);
    expect(library.indexes.byAssetId.size).toBe(200);
    expect(findApprovedAssets(library, { role: 'TREE_HERO' }).length).toBe(200);
    expect(() => findByFilename(library, 'x.zip')).toThrow(/not a production resolver/);
  });
});

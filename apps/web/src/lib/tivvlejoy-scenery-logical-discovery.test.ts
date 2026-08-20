import { describe, expect, it } from 'vitest';
import {
  classifyArchetypes,
  classifySemanticRoles,
  discoverLogicalAssets,
  discoverLogicalAssetsFromInventory,
  inferAssetKind,
  makeLogicalHints,
} from './tivvlejoy-real-scenery-inspection';

describe('TIVVLEJOY_SCENERY_LOGICAL_ASSET_DISCOVERY_V1', () => {
  it('does not treat one ZIP as one asset', () => {
    const children = discoverLogicalAssets({
      sourceId: 'SRC_TAVERN',
      sourceSha256: 'aa'.repeat(32),
      hints: [
        { internalStableRef: 'interior_shell:tavern', assetKind: 'interior_shell', displayName: 'Tavern room' },
        { internalStableRef: 'table:01', assetKind: 'table', displayName: 'Oak table' },
        { internalStableRef: 'chair:01', assetKind: 'chair', displayName: 'Stool' },
        { internalStableRef: 'barrel:01', assetKind: 'barrel', displayName: 'Barrel' },
      ],
    });
    expect(children).toHaveLength(4);
    expect(new Set(children.map((item) => item.assetCandidateId)).size).toBe(4);
    expect(children.every((item) => item.selectableApprovedAsset === false)).toBe(true);
    expect(children.every((item) => item.discoveryIsNotApproval)).toBe(true);
    expect(children.every((item) => item.sourceId === 'SRC_TAVERN')).toBe(true);
  });

  it('builds stable IDs from source identity and internal refs, not filenames', () => {
    const first = discoverLogicalAssets({
      sourceId: 'SRC_A',
      sourceSha256: 'bb'.repeat(32),
      hints: [{ internalStableRef: 'building:bakery', assetKind: 'building' }],
    });
    const second = discoverLogicalAssets({
      sourceId: 'SRC_A',
      sourceSha256: 'bb'.repeat(32),
      hints: [{ internalStableRef: 'building:bakery', assetKind: 'building' }],
    });
    expect(first[0]?.assetCandidateId).toBe(second[0]?.assetCandidateId);
    expect(first[0]?.assetCandidateId).not.toContain('.zip');
    expect(first[0]?.candidateDependencySha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('discovers kinds from object inventory without using filename as production ID', () => {
    const children = discoverLogicalAssetsFromInventory({
      sourceId: 'SRC_VILLAGE',
      sourceSha256: 'cc'.repeat(32),
      objectNames: ['BakeryHero', 'PathCobble', 'StreetLantern', 'BackgroundTree'],
      descriptions: ['village bakery street'],
    });
    expect(children.length).toBeGreaterThan(1);
    expect(children.every((item) => item.assetCandidateId.startsWith('cand:'))).toBe(true);
    expect(inferAssetKind({ name: 'MountainRidge' })).toBe('mountain');
    expect(inferAssetKind({ name: 'HDRI_Sunset.hdr' })).toBe('hdri');
  });

  it('maps discovered assets to PR #80 semantic roles with explicit evidence', () => {
    const tavern = classifySemanticRoles({
      kind: 'interior_shell',
      evidence: {
        geometryObjectNames: ['TavernInteriorShell'],
        materialCues: ['wood', 'plaster'],
        sourceDescriptions: ['cozy tavern interior'],
        filenameHint: 'SuperTavern.zip',
      },
    });
    expect(tavern.roles).toContain('INTERIOR_SHELL');
    expect(tavern.filenameOnly).toBe(false);
    expect(tavern.evidence.some((item) => item.startsWith('metadata:') || item.startsWith('kind:'))).toBe(true);
    const mountain = classifySemanticRoles({
      kind: 'mountain',
      evidence: { geometryObjectNames: ['DistantMountainSkyline'], sourceDescriptions: ['low detail mountain'] },
    });
    expect(mountain.roles).toContain('MOUNTAIN_BACKGROUND');
  });

  it('maps World Builder archetypes with confidence', () => {
    const tavern = classifyArchetypes({
      kind: 'interior_shell',
      roles: ['INTERIOR_SHELL'],
      evidence: { sourceDescriptions: ['tavern'] },
    });
    expect(tavern.archetypes.some((item) => item.id === 'tavern' && item.confidence === 'HIGH')).toBe(true);
    const forest = classifyArchetypes({
      kind: 'tree',
      roles: ['TREE_HERO', 'GRASS'],
      evidence: { sourceDescriptions: ['forest path'] },
    });
    expect(forest.archetypes.some((item) => item.id === 'forest')).toBe(true);
  });

  it('scales to thousands of logical children with stable unique IDs', () => {
    const children = discoverLogicalAssets({
      sourceId: 'SRC_SCALE',
      sourceSha256: 'dd'.repeat(32),
      hints: makeLogicalHints(2500, 'SRC_SCALE'),
    });
    expect(children).toHaveLength(2500);
    expect(new Set(children.map((item) => item.assetCandidateId)).size).toBe(2500);
  });
});

describe('semantic role coverage', () => {
  const cases: Array<{ name: string; kind: Parameters<typeof classifySemanticRoles>[0]['kind']; objects: string[]; role: string }> = [
    { name: 'building hero', kind: 'building', objects: ['BakeryHero'], role: 'BUILDING_HERO' },
    { name: 'support building', kind: 'building', objects: ['OutbuildingShed'], role: 'BUILDING_SUPPORT' },
    { name: 'interior prop', kind: 'chair', objects: ['TavernChair'], role: 'INTERIOR_PROP' },
    { name: 'tree hero', kind: 'tree', objects: ['HeroOak'], role: 'TREE_HERO' },
    { name: 'grass', kind: 'vegetation', objects: ['MeadowGrass'], role: 'GRASS' },
    { name: 'flowers', kind: 'vegetation', objects: ['WildFlowers'], role: 'FLOWERS' },
    { name: 'shrubs', kind: 'vegetation', objects: ['PathShrub'], role: 'SHRUBS' },
    { name: 'ground cover', kind: 'vegetation', objects: ['MossGroundCover'], role: 'GROUND_COVER' },
    { name: 'path', kind: 'path', objects: ['VillagePath'], role: 'PATH' },
    { name: 'rock', kind: 'rock', objects: ['RiverRock'], role: 'ROCK' },
    { name: 'water', kind: 'water', objects: ['RiverWater'], role: 'WATER' },
    { name: 'sky', kind: 'sky', objects: ['StorySky'], role: 'SKY' },
    { name: 'signage', kind: 'signage', objects: ['BakerySign'], role: 'SIGNAGE' },
    { name: 'street prop', kind: 'street_prop', objects: ['StreetLantern'], role: 'STREET_PROP' },
    { name: 'story prop', kind: 'furniture', objects: ['StoryMapProp'], role: 'STORY_PROP' },
  ];
  for (const item of cases) {
    it(`classifies ${item.name} from metadata, not filename identity`, () => {
      const result = classifySemanticRoles({
        kind: item.kind,
        evidence: { geometryObjectNames: item.objects, sourceDescriptions: item.objects },
      });
      expect(result.roles).toContain(item.role);
      expect(result.filenameOnly).toBe(false);
    });
  }
});

import { describe, expect, it } from 'vitest';
import { classifyArchetypes, classifySemanticRoles } from './tivvlejoy-real-scenery-inspection';

describe('TIVVLEJOY_SCENERY_SEMANTIC_CLASSIFICATION_V1', () => {
  it('requires explicit evidence and refuses filename-only identity', () => {
    const result = classifySemanticRoles({
      kind: 'unknown',
      evidence: { filenameHint: 'totally-a-castle.zip' },
    });
    expect(result.filenameOnly).toBe(false);
    expect(result.evidence).toContain('filename_hint_ignored_as_sole_identity');
  });

  it('maps mountain, tavern, forest and sky families from object metadata', () => {
    expect(
      classifySemanticRoles({
        kind: 'mountain',
        evidence: { geometryObjectNames: ['HeroMountainPeak'] },
      }).roles,
    ).toContain('MOUNTAIN_HERO');
    expect(
      classifyArchetypes({
        kind: 'mountain',
        roles: ['MOUNTAIN_HERO'],
        evidence: { sourceDescriptions: ['alpine mountain'] },
      }).archetypes.some((item) => item.id === 'mountain'),
    ).toBe(true);
  });

  it('maps vines, reeds, understory and foreground frames from object metadata', () => {
    expect(
      classifySemanticRoles({
        kind: 'vegetation',
        evidence: { geometryObjectNames: ['IvyVines'] },
      }).roles,
    ).toContain('VINES');
    expect(
      classifySemanticRoles({
        kind: 'vegetation',
        evidence: { geometryObjectNames: ['RiverReeds'] },
      }).roles,
    ).toContain('REEDS');
    expect(
      classifySemanticRoles({
        kind: 'vegetation',
        evidence: { geometryObjectNames: ['FernUnderstory'] },
      }).roles,
    ).toContain('FOREST_UNDERSTORY');
    expect(
      classifySemanticRoles({
        kind: 'unknown',
        evidence: { geometryObjectNames: ['ForegroundFrameLeaves'] },
      }).roles,
    ).toContain('FOREGROUND_FRAME');
  });

  it('maps snow, river and interior archetypes from evidence, not filenames', () => {
    expect(
      classifyArchetypes({
        kind: 'terrain_piece',
        roles: ['TERRAIN_SURFACE'],
        evidence: { sourceDescriptions: ['snow ridge'] },
      }).archetypes.some((item) => item.id === 'snow'),
    ).toBe(true);
    expect(
      classifyArchetypes({
        kind: 'water',
        roles: ['WATER'],
        evidence: { sourceDescriptions: ['river bend'] },
      }).archetypes.some((item) => item.id === 'river'),
    ).toBe(true);
    expect(
      classifyArchetypes({
        kind: 'interior_shell',
        roles: ['INTERIOR_SHELL'],
        evidence: { sourceDescriptions: ['room'] },
      }).archetypes.some((item) => item.id === 'interior'),
    ).toBe(true);
  });

  it('records dimension evidence without using filename as identity', () => {
    const result = classifySemanticRoles({
      kind: 'building',
      evidence: { geometryObjectNames: ['BakeryHero'], dimensions: { x: 8, y: 6, z: 10 } },
    });
    expect(result.filenameOnly).toBe(false);
    expect(result.evidence.some((item) => item.startsWith('dimensions:'))).toBe(true);
  });
});

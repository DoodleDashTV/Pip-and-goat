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
});

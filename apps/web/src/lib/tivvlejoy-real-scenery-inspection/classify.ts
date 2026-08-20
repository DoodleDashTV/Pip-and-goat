import {
  PRODUCTION_SEMANTIC_ROLES,
  SEMANTIC_CLASSIFICATION_SCHEMA,
  WORLD_BUILDER_ARCHETYPES,
  type AssetKind,
  type DepthTier,
  type ProductionSemanticRole,
  type QualityTier,
  type WorldBuilderArchetype,
} from './types';

export type ClassificationEvidence = {
  geometryObjectNames?: string[];
  dimensions?: { x: number; y: number; z: number } | null;
  materialCues?: string[];
  hierarchy?: string[];
  manualMetadata?: string[];
  sourceDescriptions?: string[];
  filenameHint?: string;
};

export type SemanticClassification = {
  schemaVersion: typeof SEMANTIC_CLASSIFICATION_SCHEMA;
  roles: ProductionSemanticRole[];
  evidence: string[];
  filenameOnly: false;
};

export type ArchetypeCompatibility = {
  archetypes: Array<{ id: WorldBuilderArchetype | string; confidence: 'HIGH' | 'MEDIUM' | 'LOW' }>;
};

export type QualityClassification = {
  tiers: QualityTier[];
  heroRequiresHumanVisualApproval: true;
  reasons: string[];
};

export type DepthClassification = {
  tiers: DepthTier[];
  reasons: string[];
};

const ROLE_HINTS: Array<{ role: ProductionSemanticRole; pattern: RegExp }> = [
  { role: 'INTERIOR_SHELL', pattern: /interior.?shell|room.?shell|tavern.?interior|inn.?interior/i },
  { role: 'BUILDING_HERO', pattern: /bakery|tavern|cottage|hero.?building|shop.?front/i },
  { role: 'BUILDING_SUPPORT', pattern: /outbuilding|shed|support.?building/i },
  { role: 'INTERIOR_PROP', pattern: /table|chair|barrel|stool|shelf|mug|interior.?prop/i },
  { role: 'TREE_HERO', pattern: /hero.?tree|oak|pine.?hero/i },
  { role: 'TREE_SUPPORT', pattern: /support.?tree|mid.?tree/i },
  { role: 'TREE_BACKGROUND', pattern: /background.?tree|distant.?tree/i },
  { role: 'GRASS', pattern: /grass/i },
  { role: 'FLOWERS', pattern: /flower/i },
  { role: 'SHRUBS', pattern: /shrub|bush/i },
  { role: 'GROUND_COVER', pattern: /ground.?cover|moss/i },
  { role: 'FOREST_UNDERSTORY', pattern: /understory|fern/i },
  { role: 'VINES', pattern: /vine/i },
  { role: 'REEDS', pattern: /reed/i },
  { role: 'PATH', pattern: /path|road|cobble/i },
  { role: 'TERRAIN_SURFACE', pattern: /terrain|ground.?plane/i },
  { role: 'ROCK', pattern: /rock|boulder/i },
  { role: 'MOUNTAIN_HERO', pattern: /hero.?mountain|mountain.?hero/i },
  { role: 'MOUNTAIN_BACKGROUND', pattern: /mountain.?skyline|distant.?mountain|background.?mountain/i },
  { role: 'WATER', pattern: /water|river|lake/i },
  { role: 'SKY', pattern: /sky|hdri/i },
  { role: 'SIGNAGE', pattern: /sign/i },
  { role: 'STREET_PROP', pattern: /lantern|cart|fence|street.?prop/i },
  { role: 'STORY_PROP', pattern: /story.?prop|map|letter|key.?prop/i },
  { role: 'FOREGROUND_FRAME', pattern: /foreground.?frame|fg.?frame/i },
  { role: 'BACKGROUND_FILL', pattern: /background.?fill|skyline|distant/i },
];

const KIND_ROLES: Partial<Record<AssetKind, ProductionSemanticRole[]>> = {
  building: ['BUILDING_HERO', 'BUILDING_SUPPORT'],
  interior_shell: ['INTERIOR_SHELL'],
  tree: ['TREE_SUPPORT'],
  vegetation: ['GRASS', 'SHRUBS'],
  rock: ['ROCK'],
  barrel: ['INTERIOR_PROP', 'STORY_PROP'],
  table: ['INTERIOR_PROP'],
  chair: ['INTERIOR_PROP'],
  terrain_piece: ['TERRAIN_SURFACE'],
  mountain: ['MOUNTAIN_BACKGROUND'],
  sky: ['SKY'],
  hdri: ['SKY'],
  street_prop: ['STREET_PROP'],
  furniture: ['INTERIOR_PROP'],
  water: ['WATER'],
  path: ['PATH'],
  signage: ['SIGNAGE'],
};

export function classifySemanticRoles(input: {
  kind: AssetKind;
  evidence: ClassificationEvidence;
}): SemanticClassification {
  const haystack = [
    ...(input.evidence.geometryObjectNames ?? []),
    ...(input.evidence.materialCues ?? []),
    ...(input.evidence.hierarchy ?? []),
    ...(input.evidence.manualMetadata ?? []),
    ...(input.evidence.sourceDescriptions ?? []),
  ].join(' ');
  const roles = new Set<ProductionSemanticRole>();
  const evidence: string[] = [];
  for (const hint of ROLE_HINTS) {
    if (hint.pattern.test(haystack)) {
      roles.add(hint.role);
      evidence.push(`metadata:${hint.role}`);
    }
  }
  if (!roles.size) {
    for (const role of KIND_ROLES[input.kind] ?? []) {
      roles.add(role);
      evidence.push(`kind:${input.kind}`);
    }
  }
  if (input.evidence.filenameHint && !roles.size) {
    evidence.push('filename_hint_ignored_as_sole_identity');
  }
  if (input.evidence.dimensions) {
    evidence.push(
      `dimensions:${input.evidence.dimensions.x}x${input.evidence.dimensions.y}x${input.evidence.dimensions.z}`,
    );
  }
  return {
    schemaVersion: SEMANTIC_CLASSIFICATION_SCHEMA,
    roles: PRODUCTION_SEMANTIC_ROLES.filter((role) => roles.has(role)),
    evidence,
    filenameOnly: false,
  };
}

export function classifyArchetypes(input: {
  roles: readonly ProductionSemanticRole[];
  kind: AssetKind;
  evidence: ClassificationEvidence;
}): ArchetypeCompatibility {
  const haystack = [
    input.kind,
    ...input.roles,
    ...(input.evidence.sourceDescriptions ?? []),
    ...(input.evidence.manualMetadata ?? []),
  ]
    .join(' ')
    .toLowerCase();
  const found: ArchetypeCompatibility['archetypes'] = [];
  const push = (id: WorldBuilderArchetype | string, confidence: 'HIGH' | 'MEDIUM' | 'LOW') => {
    if (!found.some((item) => item.id === id)) found.push({ id, confidence });
  };
  if (/tavern/.test(haystack)) {
    push('tavern', 'HIGH');
    push('TAVERN_INTERIOR', input.roles.includes('INTERIOR_SHELL') ? 'HIGH' : 'MEDIUM');
  }
  if (/village|bakery|street/.test(haystack) || input.roles.includes('BUILDING_HERO')) {
    push('village', 'HIGH');
    push('main street', /street/.test(haystack) ? 'HIGH' : 'MEDIUM');
    push('bakery', /bakery/.test(haystack) ? 'HIGH' : 'LOW');
  }
  if (input.roles.some((role) => role.startsWith('TREE_') || role === 'GRASS' || role === 'FOREST_UNDERSTORY')) {
    push('forest', 'HIGH');
    push('FOREST_PATH', 'MEDIUM');
  }
  if (input.roles.some((role) => role.startsWith('MOUNTAIN_'))) {
    push('mountain', 'HIGH');
    push('MOUNTAIN_OVERLOOK', 'MEDIUM');
  }
  if (input.roles.includes('WATER')) push('river', 'MEDIUM');
  if (/snow/.test(haystack)) push('snow', 'HIGH');
  if (input.roles.includes('INTERIOR_SHELL') || input.kind === 'interior_shell') push('interior', 'HIGH');
  return { archetypes: found.filter((item) => WORLD_BUILDER_ARCHETYPES.includes(item.id as WorldBuilderArchetype) || true) };
}

export function classifyQuality(input: {
  triangleEstimate?: number | null;
  textureMax?: number | null;
  materialComplete?: boolean;
  technicallyClean?: boolean;
  dependenciesComplete?: boolean;
  style: 'EXACT' | 'HARMONIZABLE' | 'INCOMPATIBLE' | 'UNKNOWN';
  roles: readonly ProductionSemanticRole[];
}): QualityClassification {
  const reasons: string[] = [];
  const tiers = new Set<QualityTier>(['BACKGROUND']);
  const triangles = input.triangleEstimate ?? 0;
  const texture = input.textureMax ?? 0;
  if (input.dependenciesComplete !== false && input.style !== 'INCOMPATIBLE') {
    tiers.add('SUPPORTING');
    reasons.push('supporting:dependencies_and_style');
  }
  const heroish = input.roles.some((role) => role.endsWith('_HERO') || role === 'INTERIOR_SHELL');
  if (
    heroish &&
    input.dependenciesComplete &&
    input.materialComplete &&
    input.technicallyClean &&
    input.style !== 'INCOMPATIBLE' &&
    (triangles >= 5_000 || texture >= 1024)
  ) {
    tiers.add('HERO');
    reasons.push('hero:complexity_and_completeness');
  } else if (heroish) {
    reasons.push('hero:later_human_visual_approval_required');
  }
  if (triangles < 800 && texture < 512) {
    tiers.delete('HERO');
    reasons.push('low_detail_keeps_background_useful');
  }
  return {
    tiers: (['HERO', 'SUPPORTING', 'BACKGROUND'] as const).filter((tier) => tiers.has(tier)),
    heroRequiresHumanVisualApproval: true,
    reasons,
  };
}

export function classifyDepth(input: {
  quality: readonly QualityTier[];
  roles: readonly ProductionSemanticRole[];
  triangleEstimate?: number | null;
}): DepthClassification {
  const tiers = new Set<DepthTier>(['MIDGROUND']);
  const reasons: string[] = ['default_midground'];
  if (input.roles.includes('FOREGROUND_FRAME') || input.roles.includes('STORY_PROP')) {
    tiers.add('FOREGROUND');
    reasons.push('story_or_frame_foreground');
  }
  if (
    input.roles.includes('BACKGROUND_FILL') ||
    input.roles.includes('MOUNTAIN_BACKGROUND') ||
    input.roles.includes('SKY') ||
    input.roles.includes('TREE_BACKGROUND') ||
    (input.triangleEstimate != null && input.triangleEstimate < 800)
  ) {
    tiers.add('BACKGROUND');
    reasons.push('low_detail_or_skyline_background');
  }
  if (input.quality.includes('HERO') && !input.roles.includes('MOUNTAIN_BACKGROUND')) {
    tiers.add('FOREGROUND');
    tiers.add('MIDGROUND');
  }
  return { tiers: (['FOREGROUND', 'MIDGROUND', 'BACKGROUND'] as const).filter((tier) => tiers.has(tier)), reasons };
}

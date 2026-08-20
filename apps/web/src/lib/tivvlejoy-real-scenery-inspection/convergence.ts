export type PackConvergence = {
  pack: 'MOUNTAIN' | 'TAVERN' | 'VILLAGE' | 'FOREST' | 'SKY_HDRI' | 'WORLD_SHADERS' | 'BOTANIQ' | 'GAFFER' | 'PHYSICAL_STARLIGHT';
  inspected: boolean;
  activated: false;
  installed: false;
  redistributed: false;
  candidateRoles: string[];
  blocker: string | null;
  notes: string[];
};

export function convergeMountain(accessible: boolean): PackConvergence {
  return {
    pack: 'MOUNTAIN',
    inspected: accessible,
    activated: false,
    installed: false,
    redistributed: false,
    candidateRoles: ['MOUNTAIN_HERO', 'MOUNTAIN_BACKGROUND', 'ROCK', 'TERRAIN_SURFACE', 'BACKGROUND_FILL'],
    blocker: accessible ? null : 'SOURCE_NOT_AVAILABLE',
    notes: accessible
      ? ['Mountain variants compared without assuming they are duplicates.']
      : ['Exact blocker: private mountain source bytes were not materialized.'],
  };
}

export function convergeTavern(accessible: boolean): PackConvergence {
  return {
    pack: 'TAVERN',
    inspected: accessible,
    activated: false,
    installed: false,
    redistributed: false,
    candidateRoles: ['INTERIOR_SHELL', 'INTERIOR_PROP', 'BUILDING_HERO', 'BACKGROUND_FILL', 'STORY_PROP'],
    blocker: accessible ? null : 'SOURCE_NOT_AVAILABLE',
    notes: ['Tavern is not approved without human visual review.'],
  };
}

export function convergeVillage(hasTrustedEvidence: boolean): PackConvergence {
  return {
    pack: 'VILLAGE',
    inspected: hasTrustedEvidence,
    activated: false,
    installed: false,
    redistributed: false,
    candidateRoles: ['BUILDING_HERO', 'BUILDING_SUPPORT', 'PATH', 'STREET_PROP', 'BACKGROUND_FILL'],
    blocker: hasTrustedEvidence ? null : 'TRUSTED_EVIDENCE_MISSING',
    notes: ['Existing verified village metadata is reused; commercial bytes are not re-read unnecessarily.'],
  };
}

export function convergeForest(): PackConvergence {
  return {
    pack: 'FOREST',
    inspected: true,
    activated: false,
    installed: false,
    redistributed: false,
    candidateRoles: ['TREE_HERO', 'TREE_SUPPORT', 'TREE_BACKGROUND', 'GRASS', 'FLOWERS', 'SHRUBS', 'GROUND_COVER', 'BACKGROUND_FILL'],
    blocker: null,
    notes: ['Botaniq remains NOT_ACTIVATED. Native Blender remains the baseline.'],
  };
}

export function convergeSkyHdri(): PackConvergence {
  return {
    pack: 'SKY_HDRI',
    inspected: true,
    activated: false,
    installed: false,
    redistributed: false,
    candidateRoles: ['SKY', 'BACKGROUND_FILL'],
    blocker: null,
    notes: ['HDRI ownership is not permission to redistribute. rawRedistributionAllowed=false.'],
  };
}

export function convergeWorldShaders(): PackConvergence {
  return {
    pack: 'WORLD_SHADERS',
    inspected: true,
    activated: false,
    installed: false,
    redistributed: false,
    candidateRoles: ['MATERIAL_LIBRARY', 'PROCEDURAL_MATERIAL_SOURCE'],
    blocker: null,
    notes: ['Shader packages do not automatically become environment geometry. Execution stays disabled.'],
  };
}

export function convergeBotaniq(): PackConvergence {
  return {
    pack: 'BOTANIQ',
    inspected: true,
    activated: false,
    installed: false,
    redistributed: false,
    candidateRoles: [],
    blocker: null,
    notes: ['Botaniq Full 7.2.0 remains NOT_ACTIVATED. Geo-Scatter companion packs remain OPTIONAL_NOT_INTEGRATED.'],
  };
}

export function convergeGaffer(): PackConvergence {
  return {
    pack: 'GAFFER',
    inspected: true,
    activated: false,
    installed: false,
    redistributed: false,
    candidateRoles: [],
    blocker: null,
    notes: ['Gaffer remains INSTALL_LATER / OPTIONAL. Native lighting remains the required baseline.'],
  };
}

export function convergePhysicalStarlight(): PackConvergence {
  return {
    pack: 'PHYSICAL_STARLIGHT',
    inspected: true,
    activated: false,
    installed: false,
    redistributed: false,
    candidateRoles: [],
    blocker: null,
    notes: ['Physical Starlight remains optional. Native lighting remains baseline.'],
  };
}

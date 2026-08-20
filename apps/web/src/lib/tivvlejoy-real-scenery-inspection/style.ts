import { STYLE_COMPATIBILITY_SCHEMA, type StyleState } from './types';

export type StyleEvidence = {
  realismLevel?: 'STORYBOOK' | 'STYLIZED' | 'REALISTIC' | 'UNKNOWN';
  shapeLanguage?: 'SOFT' | 'HARD' | 'MIXED' | 'UNKNOWN';
  materialComplexity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  textureStyle?: 'PAINTED' | 'PBR_REALISTIC' | 'MIXED' | 'UNKNOWN';
  colorTreatment?: 'SATURATED' | 'NEUTRAL' | 'UNKNOWN';
  edgeSharpness?: 'SOFT' | 'HARD' | 'UNKNOWN';
  proportionExaggeration?: 'STORYBOOK' | 'REALISTIC' | 'UNKNOWN';
  visualDensity?: 'LIGHT' | 'NORMAL' | 'HEAVY' | 'UNKNOWN';
};

export type StyleReport = {
  schemaVersion: typeof STYLE_COMPATIBILITY_SCHEMA;
  state: StyleState;
  evidence: StyleEvidence;
  commercialMaterialModified: false;
};

export type HarmonizationRecipe = {
  recipeGenerated: true;
  recipeExecuted: false;
  steps: string[];
};

export function assessStyleCompatibility(evidence: StyleEvidence): StyleReport {
  const realistic =
    evidence.realismLevel === 'REALISTIC' ||
    evidence.textureStyle === 'PBR_REALISTIC' ||
    evidence.proportionExaggeration === 'REALISTIC';
  const storybook =
    evidence.realismLevel === 'STORYBOOK' ||
    evidence.proportionExaggeration === 'STORYBOOK' ||
    evidence.textureStyle === 'PAINTED';
  let state: StyleState = 'UNKNOWN';
  if (storybook && !realistic) state = 'EXACT';
  else if (realistic && evidence.materialComplexity === 'HIGH') state = 'INCOMPATIBLE';
  else if (realistic || evidence.realismLevel === 'STYLIZED' || evidence.textureStyle === 'MIXED') state = 'HARMONIZABLE';
  else if (storybook) state = 'EXACT';
  return {
    schemaVersion: STYLE_COMPATIBILITY_SCHEMA,
    state,
    evidence,
    commercialMaterialModified: false,
  };
}

export function buildHarmonizationRecipe(style: StyleReport): HarmonizationRecipe | null {
  if (style.state !== 'HARMONIZABLE') return null;
  return {
    recipeGenerated: true,
    recipeExecuted: false,
    steps: [
      'material simplification',
      'roughness normalization',
      'palette shaping',
      'specular reduction',
      'shape-softening modifier recommendations',
      'storybook lighting treatment',
      'outline/edge treatment if supported by existing art direction',
      'vegetation density adjustment',
    ],
  };
}

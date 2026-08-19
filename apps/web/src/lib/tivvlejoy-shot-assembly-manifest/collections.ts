export const COLLECTION_CHILDREN = [
  'CAMERAS',
  'CHARACTERS',
  'ENVIRONMENT',
  'STORY_PROPS',
  'DRESSING',
  'LIGHTS',
  'FX',
  'VALIDATION',
] as const;

export const CHARACTER_CHILDREN = ['PIP', 'GOAT'] as const;
export const ENVIRONMENT_CHILDREN = ['ARCHITECTURE', 'VEGETATION', 'GROUND', 'BACKGROUND'] as const;

export function collectionPlan(shotId: string) {
  const root = `TJ_SHOT_${shotId}`;
  return {
    root,
    shotRoot: root,
    children: {
      CAMERAS: `${root}/CAMERAS`,
      CHARACTERS: `${root}/CHARACTERS`,
      PIP: `${root}/CHARACTERS/PIP`,
      GOAT: `${root}/CHARACTERS/GOAT`,
      ENVIRONMENT: `${root}/ENVIRONMENT`,
      ARCHITECTURE: `${root}/ENVIRONMENT/ARCHITECTURE`,
      VEGETATION: `${root}/ENVIRONMENT/VEGETATION`,
      GROUND: `${root}/ENVIRONMENT/GROUND`,
      BACKGROUND: `${root}/ENVIRONMENT/BACKGROUND`,
      STORY_PROPS: `${root}/STORY_PROPS`,
      DRESSING: `${root}/DRESSING`,
      LIGHTS: `${root}/LIGHTS`,
      FX: `${root}/FX`,
      VALIDATION: `${root}/VALIDATION`,
    },
    blendFileCreated: false,
  };
}

export function instanceNames(shotId: string, role: string, index = 1, propId?: string) {
  return {
    cameraMain: `TJ_${shotId}_CAM_MAIN`,
    charPip: `TJ_${shotId}_CHAR_PIP`,
    charGoat: `TJ_${shotId}_CHAR_GOAT`,
    env: `TJ_${shotId}_ENV_${role}_${String(index).padStart(2, '0')}`,
    prop: `TJ_${shotId}_PROP_${propId ?? 'GENERIC'}`,
    lightKey: `TJ_${shotId}_LIGHT_KEY`,
    lightFill: `TJ_${shotId}_LIGHT_FILL`,
    lightRim: `TJ_${shotId}_LIGHT_RIM`,
    sourceRenamedDestructively: false,
  };
}

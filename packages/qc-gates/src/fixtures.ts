import type { LocalQcEvidence } from './types';

/** Happy-path evidence: real Pip/Goat motion, valid hierarchy, lighting, technical+visual. */
export function validProductionEvidence(): LocalQcEvidence {
  return {
    rigBindings: [
      {
        character: 'pip',
        hasArmature: true,
        deformationBinding: true,
        rigidPartBinding: true,
        fakeBinding: false,
        boundObjectCount: 4,
      },
      {
        character: 'goat',
        hasArmature: true,
        deformationBinding: false,
        rigidPartBinding: true,
        fakeBinding: false,
        boundObjectCount: 4,
      },
    ],
    pipMotion: {
      character: 'pip',
      rootTransformDelta: 0,
      boneChannelRange: 0.45,
      shapeKeyRange: 0.8,
      actionName: 'PIP_WAVE',
      actionAssigned: true,
      fcurves: [
        {
          dataPath: 'pose.bones["upper_arm_L"].rotation_euler',
          valueRange: 0.45,
          keyframeCount: 8,
          evaluated: true,
          rotationMode: 'XYZ',
          keyedRotationMode: 'XYZ',
        },
      ],
    },
    goatMotion: {
      character: 'goat',
      rootTransformDelta: 0.3,
      boneChannelRange: 0.2,
      shapeKeyRange: 0.5,
      actionName: 'GOAT_WALK',
      actionAssigned: true,
      fcurves: [
        {
          dataPath: 'pose.bones["root"].location',
          valueRange: 0.3,
          keyframeCount: 12,
          evaluated: true,
        },
      ],
    },
    cameraMotion: {
      transformDelta: 0.5,
      channelRange: 0.5,
      preset: 'PUSH_IN',
    },
    lights: [
      { name: 'DDP_KeySun', type: 'SUN', energy: 3, productionOwner: 'DDP' },
      { name: 'DDP_FillArea', type: 'AREA', energy: 50, productionOwner: 'DDP' },
    ],
    lightingState: { preset: 'MEADOW_DAY_SOFT' },
    hierarchy: [
      { name: 'Pip_Armature', type: 'ARMATURE', parentName: null, children: ['Pip_Character', 'Pip_Backpack'] },
      { name: 'Pip_Character', type: 'MESH', parentName: 'Pip_Armature' },
      { name: 'Pip_Backpack', type: 'MESH', parentName: 'Pip_Armature' },
      { name: 'Goat_Armature', type: 'ARMATURE', parentName: null, children: ['Goat_Character', 'Goat_Collar'] },
      { name: 'Goat_Character', type: 'MESH', parentName: 'Goat_Armature' },
      { name: 'Goat_Collar', type: 'MESH', parentName: 'Goat_Armature' },
      { name: 'Goat_Tag', type: 'MESH', parentName: 'Goat_Collar' },
      { name: 'AdventureMap', type: 'MESH', parentName: 'MapRoot', children: ['MapMark'] },
      { name: 'MapMark', type: 'MESH', parentName: 'AdventureMap' },
      { name: 'MapRoot', type: 'EMPTY', parentName: null, children: ['AdventureMap'] },
    ],
    sceneAssembly: {
      rolesPresent: { pip: true, goat: true, map: true, meadow: true, camera: true },
      placementsAppliedToWholeAsset: true,
      multiObjectAssetsIntact: true,
    },
    technicalRender: {
      outputExists: true,
      width: 1080,
      height: 1920,
      frameCount: 60,
      expectedFrameCount: 60,
      engine: 'EEVEE',
      corrupt: false,
      blackFrameRatio: 0,
    },
    visualQuality: {
      characterMotionVisible: true,
      lightingLooksProduction: true,
      hierarchyArtifactsVisible: false,
      cameraOnlyIllusion: false,
    },
    localVisualAcceptance: true,
  };
}

/**
 * Critical regression: Pip static, Goat static, camera moves.
 * TECHNICAL may pass; motion/visual/cloud readiness must fail.
 */
export function cameraOnlyStaticCharactersEvidence(): LocalQcEvidence {
  const base = validProductionEvidence();
  return {
    ...base,
    pipMotion: {
      character: 'pip',
      rootTransformDelta: 0,
      boneChannelRange: 0,
      shapeKeyRange: 0,
      actionName: null,
      actionAssigned: false,
      fcurves: [],
    },
    goatMotion: {
      character: 'goat',
      rootTransformDelta: 0,
      boneChannelRange: 0,
      shapeKeyRange: 0,
      actionName: null,
      actionAssigned: false,
      fcurves: [],
    },
    cameraMotion: {
      transformDelta: 1.2,
      channelRange: 1.2,
      preset: 'PUSH_IN',
    },
    visualQuality: {
      characterMotionVisible: false,
      lightingLooksProduction: true,
      hierarchyArtifactsVisible: false,
      cameraOnlyIllusion: true,
    },
    localVisualAcceptance: false,
  };
}

export function constantCurveEvidence(): LocalQcEvidence {
  const base = validProductionEvidence();
  return {
    ...base,
    pipMotion: {
      ...base.pipMotion,
      boneChannelRange: 0,
      shapeKeyRange: 0,
      rootTransformDelta: 0,
      actionAssigned: true,
      actionName: 'PIP_WAVE',
      fcurves: [
        {
          dataPath: 'pose.bones["upper_arm_L"].rotation_euler',
          valueRange: 0,
          keyframeCount: 5,
          evaluated: true,
          rotationMode: 'XYZ',
          keyedRotationMode: 'XYZ',
        },
      ],
    },
    visualQuality: {
      ...base.visualQuality,
      characterMotionVisible: false,
    },
    localVisualAcceptance: false,
  };
}

export function rotationMismatchEvidence(): LocalQcEvidence {
  const base = validProductionEvidence();
  return {
    ...base,
    pipMotion: {
      ...base.pipMotion,
      fcurves: [
        {
          dataPath: 'pose.bones["upper_arm_L"].rotation_euler',
          valueRange: 0.4,
          keyframeCount: 6,
          evaluated: true,
          rotationMode: 'XYZ',
          keyedRotationMode: 'QUATERNION',
        },
      ],
    },
    localVisualAcceptance: false,
  };
}

export function duplicateLightsEvidence(): LocalQcEvidence {
  const base = validProductionEvidence();
  return {
    ...base,
    lights: [
      { name: 'DDP_KeySun', type: 'SUN', energy: 3, productionOwner: 'DDP' },
      { name: 'DDP_KeySun.001', type: 'SUN', energy: 3, productionOwner: 'DDP' },
      { name: 'DDP_FillArea', type: 'AREA', energy: 50, productionOwner: 'DDP' },
    ],
    localVisualAcceptance: false,
  };
}

export function detachedMapMarkEvidence(): LocalQcEvidence {
  const base = validProductionEvidence();
  return {
    ...base,
    hierarchy: base.hierarchy.map((n) =>
      n.name === 'MapMark' ? { ...n, parentName: null } : n.name === 'AdventureMap' ? { ...n, children: [] } : n,
    ),
    sceneAssembly: {
      ...base.sceneAssembly,
      placementsAppliedToWholeAsset: false,
      multiObjectAssetsIntact: false,
      notes: ['MapMark detached after single-mesh placement'],
    },
    visualQuality: {
      ...base.visualQuality,
      hierarchyArtifactsVisible: true,
    },
    localVisualAcceptance: false,
  };
}

export function fakeRigBindingEvidence(): LocalQcEvidence {
  const base = validProductionEvidence();
  return {
    ...base,
    rigBindings: [
      {
        character: 'pip',
        hasArmature: true,
        deformationBinding: false,
        rigidPartBinding: false,
        fakeBinding: true,
        boundObjectCount: 0,
      },
      base.rigBindings[1]!,
    ],
    localVisualAcceptance: false,
  };
}

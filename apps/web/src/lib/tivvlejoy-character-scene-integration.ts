import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';

export const TIVVLEJOY_CHARACTER_SCENE_INTEGRATION_SCHEMA = 'TIVVLEJOY_CHARACTER_SCENE_INTEGRATION_V1' as const;
export type SceneCharacterId = 'CHAR_PIP_001' | 'CHAR_GOAT_001';

const CHARACTER_SPECS = {
  CHAR_PIP_001: {
    displayName: 'Pip',
    sourceCollection: 'TJ_CHAR_PIP',
    sceneCollection: 'TJ_EP001_PIP',
    actionPrefix: 'TJ_PIP_',
    relativeScale: 1,
    propAnchors: ['PROP_ATTACH','WING_L','WING_R'],
    requiredCanonicalControls: ['ROOT','MASTER','COG','BODY','CHEST','HEAD','NECK','EYE_L','EYE_R','EYE_AIM','BLINK_L','BLINK_R','BEAK_UPPER','BEAK_LOWER','WING_L','WING_R','LEG_IK_L','LEG_IK_R','FOOT_L','FOOT_R','TOE_L','TOE_R','HALLUX_L','HALLUX_R','PROP_ATTACH'],
  },
  CHAR_GOAT_001: {
    displayName: 'Goat',
    sourceCollection: 'TJ_CHAR_GOAT',
    sceneCollection: 'TJ_EP001_GOAT',
    actionPrefix: 'TJ_GOAT_',
    relativeScale: 1.5,
    propAnchors: ['PROP_ATTACH'],
    requiredCanonicalControls: ['ROOT','MASTER','COG','BODY','CHEST','HEAD','NECK','EYE_L','EYE_R','EYE_AIM','BLINK','JAW','MOUTH','LEG_IK_L','LEG_IK_R','HOOF_L','HOOF_R','PROP_ATTACH'],
  },
} as const;

export function compileCharacterSceneIntegration(characterId: SceneCharacterId) {
  const spec = CHARACTER_SPECS[characterId];
  const body = {
    schemaVersion: TIVVLEJOY_CHARACTER_SCENE_INTEGRATION_SCHEMA,
    episodeId: 'EP001' as const,
    characterId,
    ...spec,
    blenderVersion: '4.2' as const,
    fps: 30 as const,
    sceneUnits: { system: 'METRIC' as const, lengthUnit: 'METERS' as const, unitScale: 1 as const },
    sourcePolicy: {
      sourceBlendMountedReadOnly: true as const,
      sourceRigNeverAppendedDestructively: true as const,
      linkApprovedCharacterCollection: true as const,
      createSceneLibraryOverrideForAnimation: true as const,
      preserveSourceObjectAndBoneNames: true as const,
      animationTargetsCanonicalAdapterRoles: true as const,
    },
    transformPolicy: {
      sourceRootLocation: [0,0,0] as const,
      sourceRootRotationEulerDegrees: [0,0,0] as const,
      scenePlacementUsesMasterOrRootControlOnly: true as const,
      noMeshObjectTransformAnimation: true as const,
      noArmatureObjectScaleAnimation: true as const,
      relativeScaleLockedAfterAdmission: true as const,
    },
    animationPolicy: {
      oneActionPerShotPerCharacter: true as const,
      actionNaming: `${spec.actionPrefix}EP001_<SHOT_ID>`,
      nlaReservedForReusableCycles: true as const,
      reusableCycles: ['IDLE','WALK','RUN','BLINK_BASE'],
      facialAndDialogueActionsRemainShotLocal: true as const,
      noAnimationWrittenIntoSourceLibrary: true as const,
    },
    propPolicy: {
      episodeMapPropCollection: 'TJ_EP001_PROP_MAP' as const,
      propBindingUsesCanonicalAnchorRoles: true as const,
      parentInversePreserved: true as const,
      handoffBetweenCharactersRequiresExplicitConstraintSwitch: true as const,
      noDirectParentingToDeformingMesh: true as const,
    },
    cachePolicy: {
      workingSceneCachesSeparateFromSourceRig: true as const,
      bakeOnlyAfterShotAnimationApproval: true as const,
      cacheKeysBindCharacterPackageAndShotHash: true as const,
      staleCacheRejectedOnRigOrAdapterHashChange: true as const,
    },
    authority: {
      sourcePackageBound: false as const,
      sceneInstantiationPerformed: false as const,
      animationWritten: false as const,
      productionEnabled: false as const,
    },
  };
  return { ...body, sceneIntegrationSha256: sha256Canonical(body) };
}

export function compileEp001CharacterSceneIntegration() {
  const pip = compileCharacterSceneIntegration('CHAR_PIP_001');
  const goat = compileCharacterSceneIntegration('CHAR_GOAT_001');
  const body = {
    schemaVersion: 'TIVVLEJOY_EP001_CHARACTER_SCENE_INTEGRATION_V1' as const,
    episodeId: 'EP001' as const,
    pip,
    goat,
    pairPolicy: {
      goatToPipRelativeScale: 1.5 as const,
      sharedGroundPlaneContactRequired: true as const,
      characterInterpenetrationCheckRequired: true as const,
      eyeLineCompatibilityCheckRequired: true as const,
      propHandoffContinuityCheckRequired: true as const,
      cameraSafe9x16FramingCheckRequired: true as const,
    },
    executionState: 'READY_FOR_APPROVED_CHARACTER_PACKAGES' as const,
  };
  return { ...body, ep001CharacterSceneIntegrationSha256: sha256Canonical(body) };
}

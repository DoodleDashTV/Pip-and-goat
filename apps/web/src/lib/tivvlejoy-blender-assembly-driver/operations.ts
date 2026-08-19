import { collectionPlan, instanceNames, UNRESOLVED, UNRESOLVED_PRODUCTION_RIG } from '@/lib/tivvlejoy-shot-assembly-manifest';
import type { assembleShot } from '@/lib/tivvlejoy-shot-assembly-manifest';
import { botaniqProviderBoundary, characterProviderBoundary, resolveAssemblySlot } from './resolver';
import {
  BLENDER_OPERATION_GRAPH_SCHEMA,
  COLLECTION_ORDER,
  CUSTOM_METADATA_KEYS,
  LIGHT_ROLES,
  type AssetClass,
  type BlenderOperation,
  type IdempotencyMode,
  type OperationStage,
  type OperationStatus,
  type OperationType,
} from './types';

export type ShotAssemblyManifest = ReturnType<typeof assembleShot>;

export type PlanExtras = {
  storyPropStates?: Record<string, string>;
  notes?: string;
  displayLabel?: string;
};

function envCollection(role: string) {
  if (role.startsWith('BUILDING') || role === 'SIGNAGE') return 'ARCHITECTURE';
  if (['TREE_HERO', 'TREE_SUPPORT', 'TREE_BACKGROUND', 'GRASS', 'FLOWERS', 'SHRUBS'].includes(role)) return 'VEGETATION';
  if (['PATH', 'ROCK', 'WATER'].includes(role)) return 'GROUND';
  return 'BACKGROUND';
}

function op(
  shotId: string,
  stage: OperationStage,
  suffix: string,
  operationType: OperationType,
  target: string,
  parameters: Record<string, unknown>,
  input: {
    dependsOn: string[];
    required: boolean;
    status: OperationStatus;
    reason: string;
    assetClass?: AssetClass;
    idempotencyMode?: IdempotencyMode;
  },
): BlenderOperation {
  return {
    operationId: `OP_${stage.slice(0, 3)}_${suffix}`,
    operationType,
    dependsOn: input.dependsOn,
    shotId,
    stage,
    target,
    parameters,
    required: input.required,
    status: input.status,
    reason: input.reason,
    assetClass: input.assetClass,
    idempotencyMode: input.idempotencyMode ?? 'CREATE_IF_MISSING',
  };
}

export function collectionTargets(shotId: string) {
  const plan = collectionPlan(shotId);
  return {
    root: plan.root,
    ordered: COLLECTION_ORDER.map((name) => ({
      name,
      path: name === 'PIP' || name === 'GOAT' || ['ARCHITECTURE', 'VEGETATION', 'GROUND', 'BACKGROUND'].includes(name)
        ? plan.children[name]
        : plan.children[name as keyof typeof plan.children],
    })),
  };
}

export function buildOperationGraph(manifest: ShotAssemblyManifest, extras: PlanExtras = {}): BlenderOperation[] {
  const shotId = manifest.shotId;
  const names = instanceNames(shotId, manifest.location.presetId.toUpperCase());
  const collections = collectionTargets(shotId);
  const ops: BlenderOperation[] = [];

  ops.push(
    op(shotId, '001_VALIDATE_INPUT', 'VALIDATE_INPUT', 'VALIDATE_REQUIRED_OBJECTS', shotId, {
      assemblyDependencySha256: manifest.assemblyDependencySha256,
      shotDependencySha256: manifest.shotDependencySha256,
      unresolvedDependencies: manifest.unresolvedDependencies,
      hardBlockers: manifest.hardBlockers,
    }, {
      dependsOn: [],
      required: true,
      status: 'PLANNED',
      reason: 'Validate the shot assembly manifest before collection work',
      idempotencyMode: 'VERIFY_EXISTING',
    }),
  );

  const validateId = ops[0]!.operationId;
  ops.push(
    op(shotId, '010_CREATE_ROOT_COLLECTION', 'CREATE_ROOT', 'CREATE_COLLECTION', collections.root, {
      parent: null,
      sourceImmutable: true,
    }, {
      dependsOn: [validateId],
      required: true,
      status: 'PLANNED',
      reason: 'Create deterministic shot root collection',
      assetClass: 'SCENE_INSTANCE',
    }),
  );
  const rootId = ops[ops.length - 1]!.operationId;

  let previous = rootId;
  for (const item of collections.ordered) {
    const child = item.name === 'PIP' || item.name === 'GOAT' || ['ARCHITECTURE', 'VEGETATION', 'GROUND', 'BACKGROUND'].includes(item.name);
    const parent =
      item.name === 'PIP' || item.name === 'GOAT'
        ? `${collections.root}/CHARACTERS`
        : ['ARCHITECTURE', 'VEGETATION', 'GROUND', 'BACKGROUND'].includes(item.name)
          ? `${collections.root}/ENVIRONMENT`
          : collections.root;
    ops.push(
      op(
        shotId,
        '020_CREATE_SUBCOLLECTIONS',
        `COL_${item.name}`,
        child ? 'CREATE_CHILD_COLLECTION' : 'CREATE_COLLECTION',
        item.path,
        { name: item.name, parent },
        {
          dependsOn: [previous],
          required: true,
          status: 'PLANNED',
          reason: `Create ${item.name} collection`,
          assetClass: 'SCENE_INSTANCE',
        },
      ),
    );
    previous = ops[ops.length - 1]!.operationId;
  }

  const lastCollectionId = previous;
  const locationResolved = manifest.location.environmentVersion !== UNRESOLVED;
  ops.push(
    op(shotId, '030_INSTANCE_BASE_ENVIRONMENT', 'BASE_ENV', 'INSTANCE_ASSET', names.env, {
      locationPresetId: manifest.location.presetId,
      environmentVersion: manifest.location.environmentVersion,
      locationBlockId: manifest.location.locationBlockId,
      assetClass: 'SCENE_INSTANCE',
      sourceClass: 'SOURCE',
      sourceImmutable: true,
      linkMode: 'instance',
      sourceReceiptRefs: manifest.location.sourceReceiptRefs,
    }, {
      dependsOn: [lastCollectionId],
      required: true,
      status: locationResolved ? 'PLANNED' : 'BLOCKED_UNRESOLVED_DEPENDENCY',
      reason: locationResolved ? 'Instance shared location base without duplicating source' : 'Location version unresolved',
      assetClass: 'SCENE_INSTANCE',
      idempotencyMode: 'CREATE_IF_MISSING',
    }),
  );
  const baseEnvId = ops[ops.length - 1]!.operationId;

  if (manifest.location.locationDeltaId) {
    ops.push(
      op(shotId, '040_APPLY_LOCATION_DELTA', 'DELTA', 'APPLY_LOCATION_DELTA', manifest.location.locationDeltaId, {
        deltaId: manifest.location.locationDeltaId,
        baseEnvironmentVersion: manifest.location.environmentVersion,
        sourceImmutable: true,
        mutateBase: false,
      }, {
        dependsOn: [baseEnvId],
        required: true,
        status: 'PLANNED',
        reason: 'Apply episode dressing delta on an immutable base',
        assetClass: 'DERIVATIVE',
        idempotencyMode: 'REPLACE_DERIVATIVE_INSTANCE',
      }),
    );
  } else {
    ops.push(
      op(shotId, '040_APPLY_LOCATION_DELTA', 'DELTA', 'APPLY_LOCATION_DELTA', 'NONE', {
        deltaId: null,
        baseEnvironmentVersion: manifest.location.environmentVersion,
      }, {
        dependsOn: [baseEnvId],
        required: false,
        status: 'SKIPPED',
        reason: 'No location delta on this shot',
        assetClass: 'DERIVATIVE',
      }),
    );
  }
  const deltaId = ops[ops.length - 1]!.operationId;

  const envSlots = [...manifest.environmentAssets.slots].sort((a, b) => a.slotId.localeCompare(b.slotId));
  envSlots.forEach((slot, index) => {
    const resolved = resolveAssemblySlot(slot);
    const botaniq = slot.providerPreference === 'BOTANIQ_IF_APPROVED';
    const blocked = resolved.status === 'BLOCKED' || resolved.status === 'UNRESOLVED';
    const objectName = `TJ_${shotId}_ENV_${slot.semanticRole}_${String(index + 1).padStart(2, '0')}`;
    ops.push(
      op(shotId, '050_INSTANCE_ENVIRONMENT_ASSETS', `ENV_${slot.slotId}`, 'INSTANCE_ASSET', objectName, {
        slotId: slot.slotId,
        semanticRole: slot.semanticRole,
        qualityTier: slot.qualityTier,
        collection: envCollection(slot.semanticRole),
        resolver: resolved,
        botaniqProvider: botaniq ? botaniqProviderBoundary() : undefined,
        environmentVersion: manifest.location.environmentVersion,
        linkMode: 'instance',
        sourceImmutable: true,
      }, {
        dependsOn: [deltaId],
        required: slot.required,
        status: blocked ? 'BLOCKED_UNRESOLVED_DEPENDENCY' : 'PLANNED',
        reason: botaniq
          ? 'Botaniq remains NOT_ACTIVATED; native placeholder only'
          : blocked
            ? 'Environment source unresolved'
            : 'Synthetic scene instance, source not overwritten',
        assetClass: 'SCENE_INSTANCE',
        idempotencyMode: 'CREATE_IF_MISSING',
      }),
    );
  });
  const lastEnvId = ops.filter((item) => item.stage === '050_INSTANCE_ENVIRONMENT_ASSETS').at(-1)?.operationId ?? deltaId;

  const props = [...manifest.storyProps.slots].sort((a, b) => a.propId.localeCompare(b.propId));
  if (props.length === 0) {
    ops.push(
      op(shotId, '060_INSTANCE_STORY_PROPS', 'NONE', 'INSTANCE_STORY_PROP', 'NONE', {}, {
        dependsOn: [lastEnvId],
        required: false,
        status: 'SKIPPED',
        reason: 'No story props on this shot',
      }),
    );
  }
  props.forEach((slot) => {
    const state = extras.storyPropStates?.[slot.propId] ?? UNRESOLVED;
    ops.push(
      op(shotId, '060_INSTANCE_STORY_PROPS', `PROP_${slot.propId}`, 'INSTANCE_STORY_PROP', `TJ_${shotId}_PROP_${slot.propId}`, {
        propId: slot.propId,
        sourceVersion: slot.sourceVersion,
        state,
        resolver: resolveAssemblySlot({ propId: slot.propId, sourceReceiptRef: `SYN_${slot.propId}` }),
      }, {
        dependsOn: [lastEnvId],
        required: true,
        status: 'PLANNED',
        reason: 'Instance story prop as a scene instance',
        assetClass: 'SCENE_INSTANCE',
      }),
    );
  });
  const lastPropId = ops.filter((item) => item.stage === '060_INSTANCE_STORY_PROPS').at(-1)!.operationId;

  for (const character of manifest.characters.slots) {
    const visible = character.visibility;
    const provider = characterProviderBoundary(character.characterId);
    ops.push(
      op(
        shotId,
        '070_INSTANCE_CHARACTERS',
        `CHAR_${character.characterId}`,
        'INSTANCE_CHARACTER',
        character.characterId === 'PIP' ? names.charPip : names.charGoat,
        {
          characterId: character.characterId,
          rigVersion: character.rigVersion,
          characterAssetVersion: character.characterAssetVersion,
          visible,
          provider,
          resolver: resolveAssemblySlot({ characterId: character.characterId }),
        },
        {
          dependsOn: [lastPropId],
          required: visible,
          status: visible ? 'BLOCKED_UNRESOLVED_PRODUCTION_RIG' : 'SKIPPED',
          reason: visible ? 'Production rig unresolved' : `${character.characterId} not visible in this shot`,
          assetClass: 'SCENE_INSTANCE',
          idempotencyMode: 'REFUSE_SOURCE_OVERWRITE',
        },
      ),
    );
    ops.push(
      op(
        shotId,
        '070_INSTANCE_CHARACTERS',
        `ANIM_${character.characterId}`,
        'BIND_ANIMATION_REFERENCE',
        character.animationClipRef,
        { characterId: character.characterId, animationVersion: character.animationVersion },
        {
          dependsOn: [ops[ops.length - 1]!.operationId],
          required: false,
          status: visible ? 'BLOCKED_UNRESOLVED_PRODUCTION_RIG' : 'SKIPPED',
          reason: 'Animation binding waits for an approved rig receipt',
        },
      ),
    );
  }
  const lastCharId = ops.filter((item) => item.stage === '070_INSTANCE_CHARACTERS').at(-1)!.operationId;

  const cameraName = names.cameraMain;
  ops.push(
    op(shotId, '080_CREATE_AND_BIND_CAMERA', 'CREATE_CAM', 'CREATE_CAMERA', cameraName, {
      cameraTemplateId: manifest.camera.cameraTemplateId,
      collection: `${collections.root}/CAMERAS`,
    }, {
      dependsOn: [lastCharId],
      required: true,
      status: 'PLANNED',
      reason: 'Create the shot camera object',
      assetClass: 'SCENE_INSTANCE',
    }),
  );
  const createCamId = ops[ops.length - 1]!.operationId;
  ops.push(
    op(shotId, '080_CREATE_AND_BIND_CAMERA', 'CONFIGURE_CAM', 'CONFIGURE_CAMERA', cameraName, {
      cameraTemplateId: manifest.camera.cameraTemplateId,
      plannedLens: manifest.camera.plannedLens,
      plannedTransform: manifest.camera.plannedTransform,
      plannedMovement: manifest.camera.plannedMovement,
      focalTarget: manifest.camera.focalTarget,
      sensorFit: 'VERTICAL',
      sensorWidth: 36,
      resolutionX: 1080,
      resolutionY: 1920,
      aspectRatio: '9:16',
      clipStart: 0.1,
      clipEnd: 1000,
      safeHeadroomPolicy: manifest.camera.safeHeadroomPolicy,
      dialogueSafe: manifest.camera.dialogueSafe,
      rigDependentMeasurementStatus: manifest.camera.rigDependentMeasurementStatus,
      pipGoatPixelMeasurements: UNRESOLVED,
    }, {
      dependsOn: [createCamId],
      required: true,
      status: 'PLANNED',
      reason: 'Configure 9:16 camera without inventing rig measurements',
    }),
  );
  ops.push(
    op(shotId, '080_CREATE_AND_BIND_CAMERA', 'SET_ACTIVE', 'SET_ACTIVE_CAMERA', cameraName, {
      sceneCamera: cameraName,
    }, {
      dependsOn: [ops[ops.length - 1]!.operationId],
      required: true,
      status: 'PLANNED',
      reason: 'Bind the scene camera',
    }),
  );
  const lastCamId = ops[ops.length - 1]!.operationId;

  const lightNames = {
    KEY: names.lightKey,
    FILL: names.lightFill,
    RIM: names.lightRim,
    ENVIRONMENT: `TJ_${shotId}_LIGHT_ENV`,
  } as const;
  let lightPrev = lastCamId;
  for (const role of LIGHT_ROLES) {
    ops.push(
      op(shotId, '090_CREATE_AND_BIND_LIGHTING', `CREATE_${role}`, 'CREATE_LIGHT', lightNames[role], {
        role,
        lightingPresetId: manifest.lighting.lightingPresetId,
        pluginDependency: 'NONE',
        gaffer: 'OPTIONAL_PROVIDER_NOT_ACTIVATED',
        physicalStarlight: 'OPTIONAL_PROVIDER_NOT_ACTIVATED',
        addonImports: [],
      }, {
        dependsOn: [lightPrev],
        required: true,
        status: 'PLANNED',
        reason: `Create native ${role} light`,
        assetClass: 'SCENE_INSTANCE',
      }),
    );
    lightPrev = ops[ops.length - 1]!.operationId;
    ops.push(
      op(shotId, '090_CREATE_AND_BIND_LIGHTING', `CONFIGURE_${role}`, 'CONFIGURE_LIGHT', lightNames[role], {
        role,
        lightingPresetId: manifest.lighting.lightingPresetId,
        lightingProfileVersion: manifest.lighting.lightingProfileVersion,
        volumetricsAllowed: manifest.lighting.volumetricsAllowed,
        characterReadabilityRequired: manifest.lighting.characterReadabilityRequired,
        pluginDependency: 'NONE',
      }, {
        dependsOn: [lightPrev],
        required: true,
        status: 'PLANNED',
        reason: `Configure native ${role} light`,
      }),
    );
    lightPrev = ops[ops.length - 1]!.operationId;
  }

  ops.push(
    op(shotId, '100_APPLY_DRESSING', 'DRESSING', 'APPLY_DRESSING', `${collections.root}/DRESSING`, {
      baseLocationRef: manifest.dressing.baseLocationRef,
      deltaRef: manifest.dressing.deltaRef,
      deterministicSeed: manifest.dressing.deterministicSeed,
    }, {
      dependsOn: [lightPrev],
      required: true,
      status: 'PLANNED',
      reason: 'Apply deterministic dressing on the instance, not the source',
      assetClass: 'DERIVATIVE',
    }),
  );
  const dressingId = ops[ops.length - 1]!.operationId;

  ops.push(
    op(shotId, '110_APPLY_METADATA', 'METADATA', 'ATTACH_METADATA', collections.root, {
      keys: CUSTOM_METADATA_KEYS,
      values: {
        tj_shot_id: manifest.shotId,
        tj_episode_id: manifest.episodeId,
        tj_manifest_version: manifest.manifestVersion,
        tj_source_id: UNRESOLVED,
        tj_source_sha256: UNRESOLVED,
        tj_derivative_sha256: UNRESOLVED,
        tj_quality_tier: 'HERO',
        tj_semantic_role: 'SHOT_ROOT',
        tj_provenance_status: 'PLANNING',
        tj_dependency_sha256: manifest.assemblyDependencySha256,
      },
    }, {
      dependsOn: [dressingId],
      required: true,
      status: 'PLANNED',
      reason: 'Attach non-secret TivvleJoy metadata',
    }),
  );
  const metaId = ops[ops.length - 1]!.operationId;

  ops.push(
    op(shotId, '120_VALIDATE_REQUIRED_OBJECTS', 'TREE', 'VALIDATE_COLLECTION_TREE', collections.root, {
      expected: [collections.root, ...collections.ordered.map((item) => item.path)],
    }, {
      dependsOn: [metaId],
      required: true,
      status: 'PLANNED',
      reason: 'Validate collection names and order',
      idempotencyMode: 'VERIFY_EXISTING',
    }),
  );
  ops.push(
    op(shotId, '120_VALIDATE_REQUIRED_OBJECTS', 'OBJECTS', 'VALIDATE_REQUIRED_OBJECTS', shotId, {
      camera: cameraName,
      lights: Object.values(lightNames),
    }, {
      dependsOn: [ops[ops.length - 1]!.operationId],
      required: true,
      status: 'PLANNED',
      reason: 'Validate required scene objects exist by deterministic name',
      idempotencyMode: 'VERIFY_EXISTING',
    }),
  );
  ops.push(
    op(shotId, '120_VALIDATE_REQUIRED_OBJECTS', 'CAMERA', 'VALIDATE_CAMERA', cameraName, {
      cameraTemplateId: manifest.camera.cameraTemplateId,
    }, {
      dependsOn: [ops[ops.length - 1]!.operationId],
      required: true,
      status: 'PLANNED',
      reason: 'Validate camera binding',
      idempotencyMode: 'VERIFY_EXISTING',
    }),
  );
  ops.push(
    op(shotId, '120_VALIDATE_REQUIRED_OBJECTS', 'LIGHTING', 'VALIDATE_LIGHTING', names.lightKey, {
      lightingPresetId: manifest.lighting.lightingPresetId,
      pluginDependency: 'NONE',
    }, {
      dependsOn: [ops[ops.length - 1]!.operationId],
      required: true,
      status: 'PLANNED',
      reason: 'Validate native lighting',
      idempotencyMode: 'VERIFY_EXISTING',
    }),
  );
  ops.push(
    op(shotId, '130_VALIDATE_PROVENANCE', 'PROVENANCE', 'VALIDATE_PROVENANCE', shotId, {
      sourceImmutable: true,
      refuseSourceOverwrite: true,
    }, {
      dependsOn: [ops[ops.length - 1]!.operationId],
      required: true,
      status: 'PLANNED',
      reason: 'Confirm sources stay immutable',
      idempotencyMode: 'REFUSE_SOURCE_OVERWRITE',
    }),
  );
  ops.push(
    op(shotId, '140_VALIDATE_DEPENDENCY_HASH', 'HASH', 'VALIDATE_DEPENDENCY_HASH', shotId, {
      shotDependencySha256: manifest.shotDependencySha256,
      assemblyDependencySha256: manifest.assemblyDependencySha256,
    }, {
      dependsOn: [ops[ops.length - 1]!.operationId],
      required: true,
      status: 'PLANNED',
      reason: 'Validate planner and assembly hashes',
      idempotencyMode: 'VERIFY_EXISTING',
    }),
  );
  ops.push(
    op(shotId, '150_PREPARE_OUTPUT_SCENE', 'OUTPUT', 'PREPARE_OUTPUT_SCENE', collections.root, {
      outputWorkspace: UNRESOLVED,
      dryRun: true,
      executionAuthorized: false,
    }, {
      dependsOn: [ops[ops.length - 1]!.operationId],
      required: true,
      status: 'PLANNED',
      reason: 'Prepare output scene metadata only',
    }),
  );

  return ops;
}

export function operationGraphRecord(operations: BlenderOperation[]) {
  return {
    schemaVersion: BLENDER_OPERATION_GRAPH_SCHEMA,
    operations,
    operationIds: operations.map((item) => item.operationId),
    stages: [...new Set(operations.map((item) => item.stage))],
  };
}

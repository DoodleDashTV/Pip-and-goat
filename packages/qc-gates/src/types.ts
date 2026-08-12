import { z } from 'zod';

/** Objective local gates that must pass before paid cloud acceptance. */
export const QC_GATE_IDS = [
  'RIG_BINDING_VALID',
  'PIP_MOTION_VALID',
  'GOAT_MOTION_VALID',
  'ANIMATION_CHANNELS_VALID',
  'LIGHTING_STATE_VALID',
  'NO_DUPLICATE_LIGHTS',
  'ASSET_HIERARCHY_VALID',
  'SCENE_ASSEMBLY_VALID',
  'LOCAL_VISUAL_ACCEPTANCE',
  'TECHNICAL_RENDER_VALID',
  'VISUAL_QUALITY_VALID',
  'READY_FOR_CLOUD_ACCEPTANCE',
] as const;

export type QcGateId = (typeof QC_GATE_IDS)[number];

export type QcGateStatus = 'PASS' | 'FAIL' | 'BLOCKED';

export type QcGateResult = {
  id: QcGateId;
  status: QcGateStatus;
  reason: string;
  evidence?: Record<string, unknown>;
};

export type RotationMode = 'XYZ' | 'XZY' | 'YXZ' | 'YZX' | 'ZXY' | 'ZYX' | 'QUATERNION' | 'AXIS_ANGLE';

export type FCurveEvidence = {
  dataPath: string;
  arrayIndex?: number;
  /** Distinct keyframe values after sampling. Constant curves have range ≈ 0. */
  valueRange: number;
  keyframeCount: number;
  muted?: boolean;
  /** True when keys exist but the channel does not affect evaluated pose. */
  evaluated?: boolean;
  rotationMode?: RotationMode;
  keyedRotationMode?: RotationMode;
};

export type RigBindingEvidence = {
  character: 'pip' | 'goat' | string;
  hasArmature: boolean;
  /** Mesh has armature modifier with non-empty vertex groups (deformation rig). */
  deformationBinding: boolean;
  /** Accessories/meshes parented to armature or bones without requiring skin weights. */
  rigidPartBinding: boolean;
  /** Armature present but nothing is bound — fake/nonfunctional. */
  fakeBinding: boolean;
  boundObjectCount: number;
  notes?: string;
};

export type CharacterMotionEvidence = {
  character: 'pip' | 'goat';
  /** World/object transform delta across sampled frames (character root or armature). */
  rootTransformDelta: number;
  /** Max non-constant bone/channel range on the character (excludes camera). */
  boneChannelRange: number;
  /** Shape-key / facial channel range. */
  shapeKeyRange: number;
  /** Claimed action name, if any. */
  actionName?: string | null;
  /** True when an action is assigned. */
  actionAssigned: boolean;
  fcurves?: FCurveEvidence[];
};

export type CameraMotionEvidence = {
  transformDelta: number;
  channelRange: number;
  preset?: string | null;
};

export type LightEvidence = {
  name: string;
  type: string;
  energy?: number;
  /** Deterministic production ownership tag (e.g. productionOwner: 'DDP'). */
  productionOwner?: string | null;
};

export type HierarchyNodeEvidence = {
  name: string;
  type: string;
  parentName?: string | null;
  children?: string[];
};

export type SceneAssemblyEvidence = {
  rolesPresent: {
    pip: boolean;
    goat: boolean;
    map?: boolean;
    meadow?: boolean;
    camera: boolean;
  };
  placementsAppliedToWholeAsset: boolean;
  multiObjectAssetsIntact: boolean;
  notes?: string[];
};

export type TechnicalRenderEvidence = {
  outputExists: boolean;
  width?: number;
  height?: number;
  frameCount?: number;
  expectedFrameCount?: number;
  engine?: string;
  corrupt?: boolean;
  blackFrameRatio?: number;
};

export type VisualQualityEvidence = {
  /** Explicit reviewer/heuristic signal — never inferred from technical success alone. */
  characterMotionVisible: boolean;
  lightingLooksProduction: boolean;
  hierarchyArtifactsVisible: boolean;
  cameraOnlyIllusion?: boolean;
  notes?: string[];
};

export const LocalQcEvidenceSchema = z.object({
  rigBindings: z.array(
    z.object({
      character: z.string(),
      hasArmature: z.boolean(),
      deformationBinding: z.boolean(),
      rigidPartBinding: z.boolean(),
      fakeBinding: z.boolean(),
      boundObjectCount: z.number().int().nonnegative(),
      notes: z.string().optional(),
    }),
  ),
  pipMotion: z.object({
    character: z.literal('pip'),
    rootTransformDelta: z.number().nonnegative(),
    boneChannelRange: z.number().nonnegative(),
    shapeKeyRange: z.number().nonnegative(),
    actionName: z.string().nullable().optional(),
    actionAssigned: z.boolean(),
    fcurves: z
      .array(
        z.object({
          dataPath: z.string(),
          arrayIndex: z.number().optional(),
          valueRange: z.number().nonnegative(),
          keyframeCount: z.number().int().nonnegative(),
          muted: z.boolean().optional(),
          evaluated: z.boolean().optional(),
          rotationMode: z
            .enum(['XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX', 'QUATERNION', 'AXIS_ANGLE'])
            .optional(),
          keyedRotationMode: z
            .enum(['XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX', 'QUATERNION', 'AXIS_ANGLE'])
            .optional(),
        }),
      )
      .optional(),
  }),
  goatMotion: z.object({
    character: z.literal('goat'),
    rootTransformDelta: z.number().nonnegative(),
    boneChannelRange: z.number().nonnegative(),
    shapeKeyRange: z.number().nonnegative(),
    actionName: z.string().nullable().optional(),
    actionAssigned: z.boolean(),
    fcurves: z
      .array(
        z.object({
          dataPath: z.string(),
          arrayIndex: z.number().optional(),
          valueRange: z.number().nonnegative(),
          keyframeCount: z.number().int().nonnegative(),
          muted: z.boolean().optional(),
          evaluated: z.boolean().optional(),
          rotationMode: z
            .enum(['XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX', 'QUATERNION', 'AXIS_ANGLE'])
            .optional(),
          keyedRotationMode: z
            .enum(['XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX', 'QUATERNION', 'AXIS_ANGLE'])
            .optional(),
        }),
      )
      .optional(),
  }),
  cameraMotion: z.object({
    transformDelta: z.number().nonnegative(),
    channelRange: z.number().nonnegative(),
    preset: z.string().nullable().optional(),
  }),
  lights: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      energy: z.number().optional(),
      productionOwner: z.string().nullable().optional(),
    }),
  ),
  lightingState: z.record(z.unknown()).default({}),
  hierarchy: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      parentName: z.string().nullable().optional(),
      children: z.array(z.string()).optional(),
    }),
  ),
  sceneAssembly: z.object({
    rolesPresent: z.object({
      pip: z.boolean(),
      goat: z.boolean(),
      map: z.boolean().optional(),
      meadow: z.boolean().optional(),
      camera: z.boolean(),
    }),
    placementsAppliedToWholeAsset: z.boolean(),
    multiObjectAssetsIntact: z.boolean(),
    notes: z.array(z.string()).optional(),
  }),
  technicalRender: z.object({
    outputExists: z.boolean(),
    width: z.number().optional(),
    height: z.number().optional(),
    frameCount: z.number().optional(),
    expectedFrameCount: z.number().optional(),
    engine: z.string().optional(),
    corrupt: z.boolean().optional(),
    blackFrameRatio: z.number().optional(),
  }),
  visualQuality: z.object({
    characterMotionVisible: z.boolean(),
    lightingLooksProduction: z.boolean(),
    hierarchyArtifactsVisible: z.boolean(),
    cameraOnlyIllusion: z.boolean().optional(),
    notes: z.array(z.string()).optional(),
  }),
  localVisualAcceptance: z.boolean().optional(),
});

export type LocalQcEvidence = z.infer<typeof LocalQcEvidenceSchema>;

export type LocalQcReport = {
  gates: Record<QcGateId, QcGateResult>;
  readyForCloudAcceptance: boolean;
  failClosed: true;
  summary: {
    passed: number;
    failed: number;
    blocked: number;
  };
  defects: {
    agent1RiggingAnimation: string[];
    agent2LightingScene: string[];
  };
};

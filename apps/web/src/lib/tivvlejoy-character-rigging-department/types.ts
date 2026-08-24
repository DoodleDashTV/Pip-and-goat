export const DEPARTMENT_SCHEMA = 'TIVVLEJOY_CHARACTER_RIGGING_ANIMATION_DEPARTMENT_V1' as const;
export const CHARACTER_MANIFEST_SCHEMA = 'TIVVLEJOY_CHARACTER_BUILD_MANIFEST_V1' as const;
export const CHARACTER_BUILD_REPORT_SCHEMA = 'TIVVLEJOY_CHARACTER_BUILD_REPORT_V1' as const;

export const GOAT_RIG_VERSION = 'goat.rig.v1' as const;
export const GOAT_SKELETON_VERSION = 'goat.skeleton.v1' as const;
export const GOAT_FACE_RIG_VERSION = 'goat.face.v1' as const;
export const GOAT_VISEME_VERSION = 'goat.viseme.v1' as const;
export const GOAT_WEIGHT_VERSION = 'goat.weight.v1' as const;
export const GOAT_ANIMATION_VALIDATION_VERSION = 'goat.animation.validation.v1' as const;
export const GOAT_EXPORT_VERSION = 'goat.export.v1' as const;
export const PIP_FUTURE_MANIFEST_VERSION = 'pip.character.manifest.v1.deferred' as const;

export const CHARACTER_IDS = ['CHAR_GOAT_001', 'CHAR_PIP_001'] as const;
export type DepartmentCharacterId = (typeof CHARACTER_IDS)[number];

export const BUILD_STAGES = [
  'SOURCE_INTAKE',
  'SOURCE_HASH_LOCK',
  'BLENDER_VERSION_CHECK',
  'OBJECT_INVENTORY',
  'MATERIAL_INVENTORY',
  'TEXTURE_INVENTORY',
  'UV_VALIDATION',
  'TOPOLOGY_AUDIT',
  'SCALE_ORIENTATION_NORMALIZATION',
  'CHARACTER_SEMANTIC_MAPPING',
  'RIG_GUIDE_GENERATION',
  'SKELETON_BUILD',
  'CONTROL_RIG_BUILD',
  'INITIAL_SKIN_BIND',
  'WEIGHT_REFINEMENT',
  'FACIAL_SYSTEM_BUILD',
  'VISEME_SYSTEM_BUILD',
  'SECONDARY_CONTROLS',
  'CORRECTIVE_DEFORMATION_BUILD',
  'ACCESSORY_BINDING',
  'DEFORMATION_TESTS',
  'ANIMATION_TESTS',
  'PERFORMANCE_PROFILE',
  'RENDER_QA',
  'EXPORT_QA',
  'CHARACTER_MASTER_GATE',
] as const;
export type CharacterBuildStageId = (typeof BUILD_STAGES)[number];

export const STAGE_OUTCOMES = ['CREATED', 'REUSED', 'UPDATED', 'BLOCKED', 'FAILED'] as const;
export type StageOutcome = (typeof STAGE_OUTCOMES)[number];

export const GATE_STATES = [
  'NOT_EVALUATED',
  'BLOCKED',
  'BLOCKED_REAL_EXECUTION_REQUIRED',
  'NEEDS_REVISION',
  'READY_FOR_HUMAN_REVIEW',
  'HUMAN_APPROVED',
] as const;
export type CharacterGateState = (typeof GATE_STATES)[number];

export const ASSET_COPIES = ['SOURCE', 'WORKING', 'PRODUCTION'] as const;
export type AssetCopyClass = (typeof ASSET_COPIES)[number];

export const PERFORMANCE_TIERS = ['HERO_MASTER', 'PRODUCTION', 'BACKGROUND_LOD'] as const;
export type PerformanceTier = (typeof PERFORMANCE_TIERS)[number];

export const PRODUCTION_VISEMES = [
  'REST',
  'AI',
  'E',
  'O',
  'U',
  'MBP',
  'FV',
  'L',
  'TH',
  'WQ',
  'CHSH',
  'KG',
  'R',
] as const;
export type ProductionViseme = (typeof PRODUCTION_VISEMES)[number];

export const GOAT_EXPRESSIONS = [
  'happy',
  'excited',
  'curious',
  'surprised',
  'worried',
  'confused',
  'sad',
  'determined',
  'mischievous',
  'laughing',
] as const;
export type GoatExpression = (typeof GOAT_EXPRESSIONS)[number];

export const VALIDATION_CLIPS = [
  'neutral_idle',
  'blink_look_around',
  'head_turns',
  'smile_frown_emotion_transitions',
  'phoneme_viseme_sweep',
  'talking_performance',
  'walk_cycle',
  'run_cycle',
  'jump',
  'landing',
  'crouch',
  'reach',
  'grab_hold_pose',
  'wave',
  'point',
  'excited_reaction',
  'surprised_reaction',
  'sad_reaction',
  'laugh',
  'extreme_full_body_deformation',
] as const;
export type ValidationClipId = (typeof VALIDATION_CLIPS)[number];

export const DEFORMATION_POSES = [
  'neutral',
  'arms_up',
  'arms_forward',
  'arms_crossed',
  'elbows_max_flex',
  'wrist_extremes',
  'hip_flex',
  'knee_flex',
  'deep_crouch',
  'wide_stance',
  'one_leg_balance',
  'head_left',
  'head_right',
  'head_up',
  'head_down',
  'jaw_open',
  'blink',
  'smile',
  'frown',
  'combined_speaking_emotion',
] as const;
export type DeformationPoseId = (typeof DEFORMATION_POSES)[number];

export const STUDIO_BLENDER_PIN = {
  major: 4,
  minor: 2,
  patch: 2,
  label: '4.2.2',
  channel: 'LTS',
} as const;

export const ZERO_SIDE_EFFECTS = Object.freeze({
  blenderExecuted: false,
  gpuLaunched: false,
  paidCompute: false,
  runpodContacted: false,
  productionMutated: false,
  canonicalAssetOverwritten: false,
  commercialBytesRead: false,
  elevenLabsContacted: false,
  voiceIdentityMutated: false,
});
export type DepartmentSideEffects = typeof ZERO_SIDE_EFFECTS;

export type StageRecord = {
  stage: CharacterBuildStageId;
  outcome: StageOutcome;
  detail: string;
  inputSha256: string | null;
  outputRef: string | null;
  blocker: string | null;
};

export const TEXTURE_ROLES = [
  'Base Color',
  'Normal',
  'Roughness',
  'Metallic',
  'Alpha',
  'Emission',
  'Displacement',
] as const;
export type TextureRole = (typeof TEXTURE_ROLES)[number];

export const BLENDER_ASSEMBLY_PLAN_SCHEMA = 'TIVVLEJOY_BLENDER_ASSEMBLY_PLAN_V1' as const;
export const BLENDER_OPERATION_GRAPH_SCHEMA = 'TIVVLEJOY_BLENDER_OPERATION_GRAPH_V1' as const;
export const BLENDER_SCRIPT_SCHEMA = 'TIVVLEJOY_BLENDER_SCRIPT_V1' as const;
export const ASSET_RESOLVER_SCHEMA = 'TIVVLEJOY_ASSET_RESOLVER_V1' as const;
export const BOTANIQ_PROVIDER_SCHEMA = 'TIVVLEJOY_BOTANIQ_ASSET_PROVIDER_V1' as const;
export const ASSEMBLY_IDEMPOTENCY_SCHEMA = 'TIVVLEJOY_ASSEMBLY_IDEMPOTENCY_V1' as const;
export const ASSEMBLY_SIMULATION_RECEIPT_SCHEMA = 'TIVVLEJOY_ASSEMBLY_SIMULATION_RECEIPT_V1' as const;
export const BLENDER_SCRIPT_AUDIT_SCHEMA = 'TIVVLEJOY_BLENDER_SCRIPT_AUDIT_V1' as const;
export const BLENDER_ASSEMBLY_AUTHORIZATION_SCHEMA = 'TIVVLEJOY_BLENDER_ASSEMBLY_AUTHORIZATION_V1' as const;
export const BLENDER_ASSEMBLY_EXECUTION_REQUEST_SCHEMA = 'TIVVLEJOY_BLENDER_ASSEMBLY_EXECUTION_REQUEST_V1' as const;
export const BLENDER_PLAN_DIFF_SCHEMA = 'TIVVLEJOY_BLENDER_PLAN_DIFF_V1' as const;

export const BLENDER_TARGET_VERSION = '4.2.2' as const;
export const UNRESOLVED = 'UNRESOLVED' as const;
export const UNRESOLVED_PRODUCTION_RIG = 'UNRESOLVED_PRODUCTION_RIG' as const;

export const OPERATION_TYPES = [
  'CREATE_COLLECTION',
  'CREATE_CHILD_COLLECTION',
  'INSTANCE_ASSET',
  'PLACE_INSTANCE',
  'APPLY_INSTANCE_TRANSFORM',
  'CREATE_CAMERA',
  'CONFIGURE_CAMERA',
  'SET_ACTIVE_CAMERA',
  'CREATE_LIGHT',
  'CONFIGURE_LIGHT',
  'CREATE_EMPTY',
  'ATTACH_METADATA',
  'APPLY_LOCATION_DELTA',
  'INSTANCE_STORY_PROP',
  'INSTANCE_CHARACTER',
  'BIND_ANIMATION_REFERENCE',
  'APPLY_DRESSING',
  'VALIDATE_COLLECTION_TREE',
  'VALIDATE_REQUIRED_OBJECTS',
  'VALIDATE_CAMERA',
  'VALIDATE_LIGHTING',
  'VALIDATE_PROVENANCE',
  'VALIDATE_DEPENDENCY_HASH',
  'PREPARE_OUTPUT_SCENE',
] as const;
export type OperationType = (typeof OPERATION_TYPES)[number];

export const OPERATION_STAGES = [
  '001_VALIDATE_INPUT',
  '010_CREATE_ROOT_COLLECTION',
  '020_CREATE_SUBCOLLECTIONS',
  '030_INSTANCE_BASE_ENVIRONMENT',
  '040_APPLY_LOCATION_DELTA',
  '050_INSTANCE_ENVIRONMENT_ASSETS',
  '060_INSTANCE_STORY_PROPS',
  '070_INSTANCE_CHARACTERS',
  '080_CREATE_AND_BIND_CAMERA',
  '090_CREATE_AND_BIND_LIGHTING',
  '100_APPLY_DRESSING',
  '110_APPLY_METADATA',
  '120_VALIDATE_REQUIRED_OBJECTS',
  '130_VALIDATE_PROVENANCE',
  '140_VALIDATE_DEPENDENCY_HASH',
  '150_PREPARE_OUTPUT_SCENE',
] as const;
export type OperationStage = (typeof OPERATION_STAGES)[number];

export const OPERATION_STATUSES = [
  'PLANNED',
  'BLOCKED_UNRESOLVED_PRODUCTION_RIG',
  'BLOCKED_UNRESOLVED_DEPENDENCY',
  'SKIPPED',
] as const;
export type OperationStatus = (typeof OPERATION_STATUSES)[number];

export const DRY_RUN_RESULTS = [
  'DRY_RUN_VALID',
  'DRY_RUN_VALID_WITH_UNRESOLVED_ASSETS',
  'DRY_RUN_BLOCKED',
  'SCRIPT_AUDIT_FAILED',
] as const;
export type DryRunResult = (typeof DRY_RUN_RESULTS)[number];

export const IDEMPOTENCY_MODES = [
  'CREATE_IF_MISSING',
  'VERIFY_EXISTING',
  'REPLACE_DERIVATIVE_INSTANCE',
  'REFUSE_SOURCE_OVERWRITE',
] as const;
export type IdempotencyMode = (typeof IDEMPOTENCY_MODES)[number];

export const ASSET_CLASSES = ['SOURCE', 'DERIVATIVE', 'SCENE_INSTANCE'] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export const RESOLVER_STATUSES = ['RESOLVED_APPROVED', 'RESOLVED_RESTRICTED', 'UNRESOLVED', 'BLOCKED'] as const;
export type ResolverStatus = (typeof RESOLVER_STATUSES)[number];

export const COLLECTION_ORDER = [
  'CAMERAS',
  'CHARACTERS',
  'PIP',
  'GOAT',
  'ENVIRONMENT',
  'ARCHITECTURE',
  'VEGETATION',
  'GROUND',
  'BACKGROUND',
  'STORY_PROPS',
  'DRESSING',
  'LIGHTS',
  'FX',
  'VALIDATION',
] as const;

export const CUSTOM_METADATA_KEYS = [
  'tj_shot_id',
  'tj_episode_id',
  'tj_manifest_version',
  'tj_source_id',
  'tj_source_sha256',
  'tj_derivative_sha256',
  'tj_quality_tier',
  'tj_semantic_role',
  'tj_provenance_status',
  'tj_dependency_sha256',
] as const;

export const LIGHT_ROLES = ['KEY', 'FILL', 'RIM', 'ENVIRONMENT'] as const;

export type BlenderOperation = {
  operationId: string;
  operationType: OperationType;
  dependsOn: string[];
  shotId: string;
  stage: OperationStage;
  target: string;
  parameters: Record<string, unknown>;
  required: boolean;
  status: OperationStatus;
  reason: string;
  assetClass?: AssetClass;
  idempotencyMode: IdempotencyMode;
};

export type AssetResolverResult = {
  schemaVersion: typeof ASSET_RESOLVER_SCHEMA;
  status: ResolverStatus;
  sourceReceiptRef: string;
  sourceSha256: string;
  derivativeReceiptRef: string;
  derivativeSha256: string;
  approvedObjectName: string;
  approvedCollectionName: string;
  localMaterializationRef: string;
  provenanceStatus: string;
};

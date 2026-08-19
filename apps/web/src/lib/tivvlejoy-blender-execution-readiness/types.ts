export const EXECUTION_READINESS_SCHEMA = 'TIVVLEJOY_BLENDER_EXECUTION_READINESS_V1' as const;
export const ASSEMBLY_HASH_CHAIN_SCHEMA = 'TIVVLEJOY_ASSEMBLY_HASH_CHAIN_V1' as const;
export const EXECUTION_ASSET_RECEIPT_SCHEMA = 'TIVVLEJOY_EXECUTION_ASSET_RECEIPT_REQUIREMENT_V1' as const;
export const PURCHASED_TOOL_SOURCE_RECEIPT_SCHEMA = 'TIVVLEJOY_PURCHASED_TOOL_SOURCE_RECEIPT_V1' as const;
export const BOTANIQ_EXECUTION_READINESS_SCHEMA = 'TIVVLEJOY_BOTANIQ_EXECUTION_READINESS_V1' as const;
export const CHARACTER_EXECUTION_RECEIPT_SCHEMA = 'TIVVLEJOY_CHARACTER_EXECUTION_RECEIPT_V1' as const;
export const CHARACTER_CAPABILITY_SCHEMA = 'TIVVLEJOY_CHARACTER_CAPABILITY_REQUIREMENTS_V1' as const;
export const ASSET_MATERIALIZATION_SCHEMA = 'TIVVLEJOY_ASSET_MATERIALIZATION_RECEIPT_V1' as const;
export const BLENDER_RUNTIME_REQUIREMENT_SCHEMA = 'TIVVLEJOY_BLENDER_RUNTIME_REQUIREMENT_V1' as const;
export const BLENDER_WORKER_IDENTITY_SCHEMA = 'TIVVLEJOY_BLENDER_WORKER_IDENTITY_V1' as const;
export const BLENDER_EXECUTION_AUTHORIZATION_SCHEMA = 'TIVVLEJOY_BLENDER_EXECUTION_AUTHORIZATION_V1' as const;
export const BLENDER_EXECUTION_INTENT_SCHEMA = 'TIVVLEJOY_BLENDER_EXECUTION_INTENT_V1' as const;
export const EPISODE_EXECUTION_READINESS_SUMMARY_SCHEMA = 'TIVVLEJOY_EPISODE_EXECUTION_READINESS_SUMMARY_V1' as const;

export const UNRESOLVED = 'UNRESOLVED' as const;

export const READINESS_STATES = [
  'DRAFT',
  'VALIDATING_HASH_CHAIN',
  'VALIDATING_SCRIPT_AUDIT',
  'VALIDATING_ASSETS',
  'VALIDATING_CHARACTERS',
  'VALIDATING_PROVENANCE',
  'VALIDATING_BLENDER_VERSION',
  'VALIDATING_WORKER',
  'READY_FOR_EXECUTION_AUTHORIZATION',
  'BLOCKED_HASH_MISMATCH',
  'BLOCKED_SCRIPT_AUDIT',
  'BLOCKED_MISSING_ASSET',
  'BLOCKED_UNAPPROVED_ASSET',
  'BLOCKED_QUARANTINED_ASSET',
  'BLOCKED_PROVENANCE_UNKNOWN',
  'BLOCKED_MISSING_CHARACTER',
  'BLOCKED_MISSING_RIG',
  'BLOCKED_MISSING_ANIMATION',
  'BLOCKED_CHARACTER_VERSION_MISMATCH',
  'BLOCKED_BLENDER_VERSION',
  'BLOCKED_WORKER_IDENTITY',
  'BLOCKED_MATERIALIZATION',
  'BLOCKED_AUTHORIZATION',
  'BLOCKED_UNKNOWN',
] as const;
export type ReadinessState = (typeof READINESS_STATES)[number];

export const INVALID_ASSET_STATES = [
  'UNRESOLVED_SOURCE',
  'UNRESOLVED_VERSION',
  'UNRESOLVED_HASH',
  'UNRESOLVED_PROVENANCE',
  'BLOCKED_QUARANTINED',
  'BLOCKED_UNAPPROVED',
  'BLOCKED_HASH_MISMATCH',
  'BLOCKED_VERSION_MISMATCH',
] as const;

export const WORKER_CAPABILITIES = [
  'BLENDER_AVAILABLE',
  'PYTHON_SCRIPT_MODE',
  'LOCAL_WORKSPACE',
  'READ_ONLY_SOURCE_MOUNT',
  'DERIVATIVE_OUTPUT_PATH',
  'NO_NETWORK_EXECUTION_MODE',
  'LOG_REDACTION',
  'RECEIPT_OUTPUT',
] as const;
export type WorkerCapability = (typeof WORKER_CAPABILITIES)[number];

export const MUTABLE_WORKER_TAGS = ['latest', 'stable', 'production'] as const;

export const COST_CLASSES = ['LOCAL_ZERO_COST', 'REMOTE_ZERO_COST', 'PAID_GPU', 'UNSELECTED'] as const;
export type CostClass = (typeof COST_CLASSES)[number];

export const CHARACTER_CAPABILITIES = [
  'eye_control',
  'eyelids',
  'beak_or_mouth',
  'head',
  'neck',
  'wings_or_forelegs',
  'legs',
  'feet',
  'body',
  'facial_expression',
  'dialogue_capability',
] as const;
export type CharacterCapability = (typeof CHARACTER_CAPABILITIES)[number];

export type HashSet = {
  shotHash: string;
  assemblyHash: string;
  planHash: string;
  scriptHash: string;
};

export type ScriptAuditView = {
  safe: boolean;
  forbiddenTokensFound: string[];
  externalUrlsFound: string[];
  secretPatternsFound: string[];
  sourceOverwriteRisk: boolean;
  networkRisk: boolean;
  shellRisk: boolean;
};

export type ExecutionAssetRequirement = {
  schemaVersion: typeof EXECUTION_ASSET_RECEIPT_SCHEMA;
  slotId: string;
  required: boolean;
  sourceId: string;
  version: string;
  sha256: string;
  approvalStatus: string;
  provenanceStatus: string;
  sourceReceiptRef: string;
  derivativeReceiptRef: string;
  filenameOnlyApproval: false;
};

export type CharacterExecutionReceipt = {
  schemaVersion: typeof CHARACTER_EXECUTION_RECEIPT_SCHEMA;
  characterId: 'PIP' | 'GOAT';
  visible: boolean;
  speaking: boolean;
  characterAssetVersion: string;
  characterAssetSha256: string;
  rigVersion: string;
  rigSha256: string;
  animationVersion: string;
  animationSha256: string;
  approvedCharacterReceiptRef: string;
  approvedRigReceiptRef: string;
  approvedAnimationReceiptRef: string;
  compatibilityStatus: string;
  declaredCapabilities: CharacterCapability[];
};

export type MaterializationReceipt = {
  schemaVersion: typeof ASSET_MATERIALIZATION_SCHEMA;
  sourceReceiptRef: string;
  sourceSha256: string;
  derivativeReceiptRef: string;
  derivativeSha256: string;
  materializationRef: string;
  workspaceIsolation: string;
  readOnlySource: boolean;
  sourceOverwriteAllowed: false;
  temporary: boolean;
  expiresAt: string;
  verified: boolean;
};

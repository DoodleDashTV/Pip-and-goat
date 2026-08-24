export const CHARACTER_SOURCE_INTAKE_SCHEMA = 'TIVVLEJOY_GOAT_CHARACTER_SOURCE_INTAKE_AND_EXECUTION_BRIDGE_V1' as const;

export const GOAT_SOURCE_INTAKE_STATES = [
  'NOT_UPLOADED',
  'UPLOADING',
  'RESUMABLE',
  'VERIFYING',
  'HASH_VERIFIED',
  'SOURCE_LOCKED',
  'WORKING_COPY_PENDING',
  'WORKING_COPY_READY',
  'RIG_BUILD_READY',
  'BLOCKED',
  'FAILED',
] as const;
export type GoatSourceIntakeState = (typeof GOAT_SOURCE_INTAKE_STATES)[number];

export const GOAT_SOURCE_OBJECT_KEY =
  'tivvlejoy-assets/characters/CHAR_GOAT_001/source/Goat_FINN.zip' as const;

export const GOAT_SOURCE_RECEIPT_OBJECT_KEY =
  'tivvlejoy-assets/characters/CHAR_GOAT_001/source/Goat_FINN.receipt.json' as const;

export const GOAT_SOURCE_PREFIX = 'tivvlejoy-assets/characters/CHAR_GOAT_001' as const;
export const GOAT_SOURCE_SESSION_PREFIX =
  'tivvlejoy-assets/characters/CHAR_GOAT_001/source/sessions' as const;

export const ZERO_INTAKE_SIDE_EFFECTS = Object.freeze({
  paidGpuLaunched: false,
  runpodContacted: false,
  productionMutated: false,
  theatricalGateOpened: false,
  elevenLabsContacted: false,
  canonicalAssetOverwritten: false,
  sourceOverwritten: false,
  gitBinaryCommitted: false,
});

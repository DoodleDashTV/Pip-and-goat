/**
 * Pre-production subsystem versions.
 *
 * Hashed into every cache key this package emits. Bump the version in the same
 * commit as a behaviour change, or a later planner will reuse work it would not
 * have produced.
 *
 * This package is a parallel studio track. It is not DDP Steps 9–16 and does not
 * flip the theatrical gate.
 */
export const PREPRODUCTION_SCHEMA_VERSION = 'ddp-preproduction-bundle-v1' as const;

export const PREPRODUCTION_SUBSYSTEM_VERSIONS = {
  story: '1.0.0',
  continuity: '1.1.0',
  storyboard: '1.0.0',
  animatic: '1.0.0',
  shotplan: '1.0.0',
  library: '1.0.0',
  audio: '1.0.0',
  orchestration: '1.0.0',
  qc: '1.0.0',
  gates: '1.0.0',
  proxy: '1.0.0',
  workflow: '1.0.0',
  assembly: '1.1.0',
  launchSafety: '1.1.0',
  persist: '1.0.0',
  closedStages: '1.0.0',
  episode1: '1.2.0',
  canon: '1.0.0',
  cache: '1.1.0',
  recovery: '1.1.0',
  versioning: '1.0.0',
  dependencies: '1.0.0',
  profile: '1.0.0',
  provenance: '1.0.0',
  analytics: '1.0.0',
  storyBrain: '1.0.0',
  continuityDb: '1.0.0',
  retention: '1.0.0',
  storyboardCompiler: '1.0.0',
  animaticCompiler: '1.0.0',
  visualQc: '1.0.0',
  motionAudioQc: '1.0.0',
  autoRepair: '1.0.0',
  stepsClosed: '1.0.0',
  studioCompletion: '1.0.0',
  security: '1.0.0',
  access: '1.0.0',
  audit: '1.0.0',
  release: '1.0.0',
  ciGates: '1.0.0',
  backup: '1.0.0',
  vulnerability: '1.0.0',
  spend: '1.0.0',
  golden: '1.0.0',
} as const;

export type PreproductionSubsystemName = keyof typeof PREPRODUCTION_SUBSYSTEM_VERSIONS;

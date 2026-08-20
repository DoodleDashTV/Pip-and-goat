import { sha256Canonical } from './hash';
import { PRODUCTION_LOCK_SCHEMA, type FirstEpisodePreflight, type LockState } from './types';

export function compileProductionLock(input: {
  preflight: FirstEpisodePreflight;
  scriptHash: string;
  voiceReceipts: readonly string[];
  directorPackageHash: string | null;
  assetRegistrySnapshot: string | null;
  rigVersions: { pip: string | null; goat: string | null };
  animationManifests: readonly string[];
  shotSpecs: readonly string[];
  approvals: readonly string[];
}): {
  schemaVersion: typeof PRODUCTION_LOCK_SCHEMA;
  state: LockState;
  scriptHash: string;
  voiceReceipts: readonly string[];
  directorPackageHash: string | null;
  assetRegistrySnapshot: string | null;
  rigVersions: { pip: string | null; goat: string | null };
  animationManifests: readonly string[];
  shotSpecs: readonly string[];
  approvals: readonly string[];
  lockSha256: string;
} {
  const realReady = input.preflight.subsystems.every((item) => item.state === 'REAL_READY');
  const state: LockState = realReady && input.rigVersions.pip && input.rigVersions.goat && input.approvals.length > 0 ? 'LOCKABLE' : 'NOT_LOCKABLE';
  const body = {
    schemaVersion: PRODUCTION_LOCK_SCHEMA,
    state,
    scriptHash: input.scriptHash,
    voiceReceipts: input.voiceReceipts,
    directorPackageHash: input.directorPackageHash,
    assetRegistrySnapshot: input.assetRegistrySnapshot,
    rigVersions: input.rigVersions,
    animationManifests: input.animationManifests,
    shotSpecs: input.shotSpecs,
    approvals: input.approvals,
  };
  return { ...body, lockSha256: sha256Canonical(body) };
}

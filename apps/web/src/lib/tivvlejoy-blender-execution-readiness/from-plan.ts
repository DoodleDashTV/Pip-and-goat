import type { BlenderAssemblyPlan } from '@/lib/tivvlejoy-blender-assembly-driver';
import type { assembleShot } from '@/lib/tivvlejoy-shot-assembly-manifest';
import { UNRESOLVED as DRIVER_UNRESOLVED } from '@/lib/tivvlejoy-blender-assembly-driver';
import {
  ASSET_MATERIALIZATION_SCHEMA,
  CHARACTER_EXECUTION_RECEIPT_SCHEMA,
  EXECUTION_ASSET_RECEIPT_SCHEMA,
  UNRESOLVED,
  type CharacterCapability,
  type CharacterExecutionReceipt,
  type ExecutionAssetRequirement,
  type MaterializationReceipt,
} from './types';
import type { ExecutionReadinessInput } from './evaluate';

type ShotManifest = ReturnType<typeof assembleShot>;

const IMMUTABLE_WORKER = {
  workerKind: 'SYNTHETIC_BLENDER_WORKER',
  imageDigest: `sha256:${'ab'.repeat(32)}`,
  sourceCommit: 'a'.repeat(40),
  blenderVersion: '4.2.2',
  assemblyDriverVersion: 'TIVVLEJOY_BLENDER_ASSEMBLY_DRIVER_DRYRUN_V1',
  scriptAuditVersion: 'TIVVLEJOY_BLENDER_SCRIPT_AUDIT_V1',
  capabilities: [
    'BLENDER_AVAILABLE',
    'PYTHON_SCRIPT_MODE',
    'LOCAL_WORKSPACE',
    'READ_ONLY_SOURCE_MOUNT',
    'DERIVATIVE_OUTPUT_PATH',
    'NO_NETWORK_EXECUTION_MODE',
    'LOG_REDACTION',
    'RECEIPT_OUTPUT',
  ],
};

export function assetsFromManifest(manifest: ShotManifest): ExecutionAssetRequirement[] {
  return manifest.environmentAssets.slots.map((slot) => ({
    schemaVersion: EXECUTION_ASSET_RECEIPT_SCHEMA,
    slotId: slot.slotId,
    required: slot.required,
    sourceId: String(slot.sourceReceiptRef),
    version: String(slot.sourceVersion),
    sha256: String(slot.sourceSha256),
    approvalStatus: String(slot.dependencyStatus).startsWith('BLOCKED')
      ? slot.dependencyStatus === 'BLOCKED_QUARANTINED'
        ? 'quarantined'
        : 'unapproved'
      : String(slot.dependencyStatus).startsWith('RESOLVED')
        ? 'approved'
        : 'unapproved',
    provenanceStatus: String(slot.dependencyStatus),
    sourceReceiptRef: String(slot.sourceReceiptRef),
    derivativeReceiptRef: String(slot.derivativeReceiptRef ?? UNRESOLVED),
    filenameOnlyApproval: false as const,
  }));
}

export function charactersFromManifest(manifest: ShotManifest): CharacterExecutionReceipt[] {
  return manifest.characters.slots.map((slot) => ({
    schemaVersion: CHARACTER_EXECUTION_RECEIPT_SCHEMA,
    characterId: slot.characterId,
    visible: slot.visibility,
    speaking: slot.speaking,
    characterAssetVersion: String(slot.characterAssetVersion),
    characterAssetSha256: UNRESOLVED,
    rigVersion: String(slot.rigVersion),
    rigSha256: UNRESOLVED,
    animationVersion: String(slot.animationVersion),
    animationSha256: UNRESOLVED,
    approvedCharacterReceiptRef: UNRESOLVED,
    approvedRigReceiptRef: UNRESOLVED,
    approvedAnimationReceiptRef: UNRESOLVED,
    compatibilityStatus: DRIVER_UNRESOLVED,
    declaredCapabilities: [] as CharacterCapability[],
  }));
}

export function materializationsFromAssets(assets: ExecutionAssetRequirement[]): MaterializationReceipt[] {
  return assets.map((asset) => ({
    schemaVersion: ASSET_MATERIALIZATION_SCHEMA,
    sourceReceiptRef: asset.sourceReceiptRef,
    sourceSha256: asset.sha256,
    derivativeReceiptRef: asset.derivativeReceiptRef,
    derivativeSha256: UNRESOLVED,
    materializationRef: UNRESOLVED,
    workspaceIsolation: 'UNPERFORMED',
    readOnlySource: true,
    sourceOverwriteAllowed: false as const,
    temporary: true,
    expiresAt: UNRESOLVED,
    verified: false,
  }));
}

export function readinessInputFromPlan(plan: BlenderAssemblyPlan, manifest: ShotManifest): ExecutionReadinessInput {
  const assets = assetsFromManifest(manifest);
  const hashes = {
    shotHash: plan.shotDependencySha256,
    assemblyHash: plan.assemblyDependencySha256,
    planHash: plan.planDependencySha256,
    scriptHash: plan.script.scriptSha256,
  };
  return {
    shotId: plan.shotId,
    episodeId: plan.episodeId,
    observedHashes: hashes,
    expectedHashes: { ...hashes },
    assemblyManifestRef: `${plan.shotId}.manifest`,
    assemblyPlanRef: `${plan.shotId}.plan`,
    scriptRef: plan.executionRequest.scriptRef,
    scriptAuditRef: `${plan.shotId}.audit`,
    audit: {
      safe: plan.audit.safe,
      forbiddenTokensFound: [...plan.audit.forbiddenTokensFound],
      externalUrlsFound: [...plan.audit.externalUrlsFound],
      secretPatternsFound: [...plan.audit.secretPatternsFound],
      sourceOverwriteRisk: plan.audit.sourceOverwriteRisk,
      networkRisk: plan.audit.networkRisk,
      shellRisk: plan.audit.shellRisk,
    },
    assets,
    characters: charactersFromManifest(manifest),
    materializations: materializationsFromAssets(assets),
    blender: {
      requiredMajor: 4,
      requiredMinor: 2,
      testedVersion: '4.2.2',
      workerReportedVersion: '4.2.2',
    },
    worker: IMMUTABLE_WORKER,
    allowRestrictedAssets: false,
  };
}

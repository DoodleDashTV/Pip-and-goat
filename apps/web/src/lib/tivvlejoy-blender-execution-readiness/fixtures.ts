import { assembleShot, ep012AssemblyInputs } from '@/lib/tivvlejoy-shot-assembly-manifest';
import { dryRunEp012 } from '@/lib/tivvlejoy-blender-assembly-driver';
import { evaluateBlenderExecutionReadiness, summarizeEpisodeReadiness, type ExecutionReadinessInput } from './evaluate';
import { readinessInputFromPlan } from './from-plan';
import {
  ASSET_MATERIALIZATION_SCHEMA,
  CHARACTER_CAPABILITIES,
  CHARACTER_EXECUTION_RECEIPT_SCHEMA,
  EXECUTION_ASSET_RECEIPT_SCHEMA,
  PURCHASED_TOOL_SOURCE_RECEIPT_SCHEMA,
  UNRESOLVED,
} from './types';

const APPROVED_SHA = 'cd'.repeat(32);

function approvedAsset(slotId: string, restricted = false) {
  return {
    schemaVersion: EXECUTION_ASSET_RECEIPT_SCHEMA,
    slotId,
    required: true,
    sourceId: `SYN_${slotId}`,
    version: 'v1',
    sha256: APPROVED_SHA,
    approvalStatus: 'approved',
    provenanceStatus: restricted ? 'RESOLVED_RESTRICTED' : 'RESOLVED_APPROVED',
    sourceReceiptRef: `SYN_${slotId}`,
    derivativeReceiptRef: `SYN_DER_${slotId}`,
    filenameOnlyApproval: false as const,
  };
}

function verifiedMaterialization(sourceReceiptRef: string) {
  return {
    schemaVersion: ASSET_MATERIALIZATION_SCHEMA,
    sourceReceiptRef,
    sourceSha256: APPROVED_SHA,
    derivativeReceiptRef: `SYN_DER_${sourceReceiptRef}`,
    derivativeSha256: 'ef'.repeat(32),
    materializationRef: `SYNTHETIC://${sourceReceiptRef}`,
    workspaceIsolation: 'SYNTHETIC_WORKSPACE',
    readOnlySource: true,
    sourceOverwriteAllowed: false as const,
    temporary: true,
    expiresAt: 'UNSCHEDULED',
    verified: true,
  };
}

function approvedCharacter(characterId: 'PIP' | 'GOAT', speaking = true) {
  return {
    schemaVersion: CHARACTER_EXECUTION_RECEIPT_SCHEMA,
    characterId,
    visible: true,
    speaking,
    characterAssetVersion: 'char-v1',
    characterAssetSha256: APPROVED_SHA,
    rigVersion: 'rig-v1',
    rigSha256: APPROVED_SHA,
    animationVersion: speaking ? 'anim-v1' : UNRESOLVED,
    animationSha256: speaking ? APPROVED_SHA : UNRESOLVED,
    approvedCharacterReceiptRef: `REC_${characterId}_CHAR`,
    approvedRigReceiptRef: `REC_${characterId}_RIG`,
    approvedAnimationReceiptRef: speaking ? `REC_${characterId}_ANIM` : UNRESOLVED,
    compatibilityStatus: 'COMPATIBLE',
    declaredCapabilities: [...CHARACTER_CAPABILITIES],
  };
}

export function immutableWorkerFixture() {
  return {
    workerKind: 'SYNTHETIC_BLENDER_WORKER',
    imageDigest: `sha256:${'ab'.repeat(32)}`,
    sourceCommit: 'b'.repeat(40),
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
}

function safeAudit() {
  return {
    safe: true,
    forbiddenTokensFound: [],
    externalUrlsFound: [],
    secretPatternsFound: [],
    sourceOverwriteRisk: false,
    networkRisk: false,
    shellRisk: false,
  };
}

function hashes(suffix = '11') {
  const hex = suffix.repeat(32);
  return {
    shotHash: hex,
    assemblyHash: hex.replace(/1/g, '2'),
    planHash: hex.replace(/1/g, '3'),
    scriptHash: hex.replace(/1/g, '4'),
  };
}

export function readyExceptAuthInput(): ExecutionReadinessInput {
  const observed = hashes();
  return {
    shotId: 'SH_READY',
    episodeId: 'EP_SYN',
    observedHashes: observed,
    expectedHashes: { ...observed },
    assemblyManifestRef: 'SH_READY.manifest',
    assemblyPlanRef: 'SH_READY.plan',
    scriptRef: 'SH_READY.py',
    scriptAuditRef: 'SH_READY.audit',
    audit: safeAudit(),
    assets: [approvedAsset('HERO'), approvedAsset('SUPPORT')],
    characters: [approvedCharacter('PIP'), approvedCharacter('GOAT')],
    materializations: [verifiedMaterialization('SYN_HERO'), verifiedMaterialization('SYN_SUPPORT')],
    blender: { requiredMajor: 4, requiredMinor: 2, testedVersion: '4.2.2', workerReportedVersion: '4.2.2' },
    worker: immutableWorkerFixture(),
    allowRestrictedAssets: true,
  };
}

export function readinessFixtures() {
  const base = readyExceptAuthInput();
  const missingPip = {
    ...base,
    shotId: 'SH_PIP',
    characters: [
      { ...approvedCharacter('PIP'), approvedRigReceiptRef: UNRESOLVED, rigVersion: 'UNRESOLVED_PRODUCTION_RIG', rigSha256: UNRESOLVED },
      approvedCharacter('GOAT'),
    ],
  };
  const missingGoat = {
    ...base,
    shotId: 'SH_GOAT',
    characters: [
      approvedCharacter('PIP'),
      { ...approvedCharacter('GOAT'), approvedRigReceiptRef: UNRESOLVED, rigVersion: 'UNRESOLVED_PRODUCTION_RIG', rigSha256: UNRESOLVED },
    ],
  };
  return {
    syntheticSafe: base,
    shotHashMismatch: { ...base, observedHashes: { ...base.observedHashes, shotHash: 'aa'.repeat(32) } },
    assemblyHashMismatch: { ...base, observedHashes: { ...base.observedHashes, assemblyHash: 'aa'.repeat(32) } },
    planHashMismatch: { ...base, observedHashes: { ...base.observedHashes, planHash: 'aa'.repeat(32) } },
    scriptHashMismatch: { ...base, observedHashes: { ...base.observedHashes, scriptHash: 'aa'.repeat(32) } },
    unsafeScript: {
      ...base,
      audit: {
        safe: false,
        forbiddenTokensFound: ['subprocess'],
        externalUrlsFound: [],
        secretPatternsFound: [],
        sourceOverwriteRisk: false,
        networkRisk: false,
        shellRisk: true,
      },
    },
    missingVegetation: {
      ...base,
      assets: [
        approvedAsset('HERO'),
        {
          ...approvedAsset('TREES'),
          sourceId: UNRESOLVED,
          sourceReceiptRef: UNRESOLVED,
          provenanceStatus: 'UNRESOLVED_SOURCE',
        },
      ],
    },
    quarantined: {
      ...base,
      assets: [approvedAsset('HERO'), { ...approvedAsset('PATH'), approvalStatus: 'quarantined', provenanceStatus: 'BLOCKED_QUARANTINED' }],
    },
    unknownProvenance: {
      ...base,
      assets: [approvedAsset('HERO'), { ...approvedAsset('SKY'), provenanceStatus: 'UNRESOLVED_PROVENANCE' }],
    },
    missingPipRig: missingPip,
    missingGoatRig: missingGoat,
    incompatibleBlender: {
      ...base,
      blender: { requiredMajor: 4, requiredMinor: 2, testedVersion: '4.2.2', workerReportedVersion: '3.6.0' },
    },
    mutableWorker: { ...base, worker: { ...immutableWorkerFixture(), tag: 'latest' } },
    missingMaterialization: { ...base, materializations: [] },
    readyExceptAuth: base,
  };
}

export function purchasedBotaniqUploadFixture() {
  return {
    schemaVersion: PURCHASED_TOOL_SOURCE_RECEIPT_SCHEMA,
    sourceId: 'BOTANIQ_UPLOAD_001',
    displayName: 'Botaniq archive (upload only)',
    version: 'upload',
    role: 'botaniq_vegetation',
    activation: 'stored',
    originalFilename: 'botaniq.zip',
    byteSize: 12,
    objectKey: 'uploads/botaniq.zip',
    stored: true,
    clientSha256: APPROVED_SHA,
    hashVerification: 'client-only',
    rawRedistributionAllowed: false,
    sourceImmutable: true,
  };
}

export function evaluateEp012Readiness() {
  const dryRun = dryRunEp012();
  const inputs = ep012AssemblyInputs();
  const receipts = dryRun.plans.map((plan, index) => {
    const manifest = assembleShot(inputs[index]!);
    return evaluateBlenderExecutionReadiness(readinessInputFromPlan(plan, manifest));
  });
  return {
    episodeId: dryRun.episodeId,
    title: dryRun.title,
    dryRun,
    receipts,
    summary: summarizeEpisodeReadiness(dryRun.episodeId, receipts),
    safety: {
      blenderExecuted: false,
      generatedPythonExecuted: false,
      subprocessExecuted: false,
      runpodContacted: false,
      authorizationIssued: false,
      purchasedAssetsTouched: false,
    },
  };
}

export function evaluateFixtureSet() {
  const fixtures = readinessFixtures();
  return Object.fromEntries(
    Object.entries(fixtures).map(([key, input]) => [key, evaluateBlenderExecutionReadiness(input)]),
  );
}


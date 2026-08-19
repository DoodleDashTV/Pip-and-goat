import { sha256Canonical } from '@/lib/tivvlejoy-storybook-environment';
import { validateHashChain } from './hash-chain';
import {
  BLENDER_EXECUTION_AUTHORIZATION_SCHEMA,
  BLENDER_EXECUTION_INTENT_SCHEMA,
  BLENDER_RUNTIME_REQUIREMENT_SCHEMA,
  BLENDER_WORKER_IDENTITY_SCHEMA,
  BOTANIQ_EXECUTION_READINESS_SCHEMA,
  CHARACTER_CAPABILITY_SCHEMA,
  EPISODE_EXECUTION_READINESS_SUMMARY_SCHEMA,
  EXECUTION_READINESS_SCHEMA,
  INVALID_ASSET_STATES,
  MUTABLE_WORKER_TAGS,
  UNRESOLVED,
  WORKER_CAPABILITIES,
  type CharacterCapability,
  type CharacterExecutionReceipt,
  type CostClass,
  type ExecutionAssetRequirement,
  type HashSet,
  type MaterializationReceipt,
  type ReadinessState,
  type ScriptAuditView,
} from './types';

export type WorkerIdentityInput = {
  workerKind: string;
  imageDigest: string;
  sourceCommit: string;
  blenderVersion: string;
  assemblyDriverVersion: string;
  scriptAuditVersion: string;
  tag?: string;
  capabilities: string[];
};

export type BlenderRuntimeInput = {
  requiredMajor: number;
  requiredMinor: number;
  testedVersion: string;
  workerReportedVersion: string;
};

export type ExecutionReadinessInput = {
  shotId: string;
  episodeId: string;
  observedHashes: HashSet;
  expectedHashes: HashSet;
  assemblyManifestRef: string;
  assemblyPlanRef: string;
  scriptRef: string;
  scriptAuditRef: string;
  audit: ScriptAuditView;
  assets: ExecutionAssetRequirement[];
  characters: CharacterExecutionReceipt[];
  materializations: MaterializationReceipt[];
  blender: BlenderRuntimeInput;
  worker: WorkerIdentityInput;
  allowRestrictedAssets?: boolean;
  notes?: string;
};

function hashWorkerIdentity(worker: WorkerIdentityInput) {
  return sha256Canonical({
    workerKind: worker.workerKind,
    imageDigest: worker.imageDigest,
    sourceCommit: worker.sourceCommit,
    blenderVersion: worker.blenderVersion,
    assemblyDriverVersion: worker.assemblyDriverVersion,
    scriptAuditVersion: worker.scriptAuditVersion,
  });
}

export function unissuedExecutionAuthorization(input: {
  shotId: string;
  assemblyDependencySha256: string;
  planDependencySha256: string;
  scriptSha256: string;
  workerIdentityHash: string;
}) {
  return {
    schemaVersion: BLENDER_EXECUTION_AUTHORIZATION_SCHEMA,
    issued: false as const,
    shotId: input.shotId,
    assemblyDependencySha256: input.assemblyDependencySha256,
    planDependencySha256: input.planDependencySha256,
    scriptSha256: input.scriptSha256,
    workerIdentityHash: input.workerIdentityHash,
    allowCommercialSources: false as const,
    allowCharacterAssets: false as const,
    costClass: 'UNSELECTED' as CostClass,
    expiresAt: UNRESOLVED,
    singleUse: true as const,
    issuedBy: 'UNISSUED',
  };
}

export function executionIntent(input: {
  shotId: string;
  readinessReceiptRef: string;
  assemblyManifestRef: string;
  planRef: string;
  scriptRef: string;
  workerRequirementRef: string;
}) {
  return {
    schemaVersion: BLENDER_EXECUTION_INTENT_SCHEMA,
    shotId: input.shotId,
    readinessReceiptRef: input.readinessReceiptRef,
    assemblyManifestRef: input.assemblyManifestRef,
    planRef: input.planRef,
    scriptRef: input.scriptRef,
    workerRequirementRef: input.workerRequirementRef,
    authorizationRequired: true as const,
    authorizationIssued: false as const,
    executionRequested: false as const,
  };
}

export function botaniqExecutionReadiness() {
  return {
    schemaVersion: BOTANIQ_EXECUTION_READINESS_SCHEMA,
    provider: 'BOTANIQ' as const,
    uploadedStatus: 'UNKNOWN_OR_EXTERNAL' as const,
    assetCatalogApproved: false as const,
    sourceReadAuthorized: false as const,
    derivativeApproved: false as const,
    executionReady: false as const,
    inspected: false as const,
    geoScatterIntegrated: false as const,
  };
}

export function requiredCapabilitiesForShot(character: Pick<CharacterExecutionReceipt, 'characterId' | 'visible' | 'speaking'>): CharacterCapability[] {
  if (!character.visible) return [];
  const base: CharacterCapability[] = ['head', 'neck', 'body', 'legs', 'feet', 'wings_or_forelegs', 'eye_control', 'eyelids', 'beak_or_mouth'];
  if (character.speaking) base.push('facial_expression', 'dialogue_capability');
  return base;
}

export function evaluateBlenderVersion(input: BlenderRuntimeInput) {
  const reported = input.workerReportedVersion;
  let compatibility: 'COMPATIBLE' | 'UNKNOWN' | 'INCOMPATIBLE' = 'UNKNOWN';
  if (!reported || reported === UNRESOLVED) compatibility = 'UNKNOWN';
  else {
    const match = /^(\d+)\.(\d+)/.exec(reported);
    if (!match) compatibility = 'UNKNOWN';
    else {
      const major = Number(match[1]);
      const minor = Number(match[2]);
      compatibility =
        major === input.requiredMajor && minor === input.requiredMinor ? 'COMPATIBLE' : 'INCOMPATIBLE';
    }
  }
  return {
    schemaVersion: BLENDER_RUNTIME_REQUIREMENT_SCHEMA,
    requiredMajor: input.requiredMajor,
    requiredMinor: input.requiredMinor,
    testedVersion: input.testedVersion,
    workerReportedVersion: reported,
    compatibility,
    workerContacted: false as const,
  };
}

export function evaluateWorkerIdentity(worker: WorkerIdentityInput) {
  const mutable = Boolean(worker.tag && (MUTABLE_WORKER_TAGS as readonly string[]).includes(worker.tag));
  const digestOk = /^sha256:[0-9a-f]{64}$/.test(worker.imageDigest);
  const commitOk = /^[0-9a-f]{40}$/.test(worker.sourceCommit);
  const capabilitiesOk = WORKER_CAPABILITIES.every((item) => worker.capabilities.includes(item));
  return {
    schemaVersion: BLENDER_WORKER_IDENTITY_SCHEMA,
    ...worker,
    capabilityHash: sha256Canonical([...worker.capabilities].sort()),
    workerIdentityHash: hashWorkerIdentity(worker),
    mutableTag: mutable,
    valid: !mutable && digestOk && commitOk && capabilitiesOk,
    providerContacted: false as const,
  };
}

function assetBlock(assets: ExecutionAssetRequirement[], allowRestricted: boolean): { state: ReadinessState; reasons: string[] } {
  const reasons: string[] = [];
  let state: ReadinessState | null = null;
  for (const asset of assets.filter((item) => item.required)) {
    if (asset.filenameOnlyApproval) {
      reasons.push(`${asset.slotId}: filename-only approval refused`);
      state ??= 'BLOCKED_UNAPPROVED_ASSET';
    }
    if (asset.approvalStatus === 'quarantined' || asset.provenanceStatus === 'BLOCKED_QUARANTINED') {
      reasons.push(`${asset.slotId}: quarantined`);
      state ??= 'BLOCKED_QUARANTINED_ASSET';
      continue;
    }
    if (asset.approvalStatus === 'unapproved' || asset.provenanceStatus === 'BLOCKED_UNAPPROVED') {
      reasons.push(`${asset.slotId}: unapproved`);
      state ??= 'BLOCKED_UNAPPROVED_ASSET';
      continue;
    }
    if (
      !asset.sourceReceiptRef ||
      asset.sourceReceiptRef === UNRESOLVED ||
      asset.provenanceStatus === 'UNRESOLVED_SOURCE' ||
      !asset.sourceId ||
      asset.sourceId === UNRESOLVED
    ) {
      reasons.push(`${asset.slotId}: missing source`);
      state ??= 'BLOCKED_MISSING_ASSET';
      continue;
    }
    if (!asset.version || asset.version === UNRESOLVED || asset.provenanceStatus === 'UNRESOLVED_VERSION') {
      reasons.push(`${asset.slotId}: missing version`);
      state ??= 'BLOCKED_MISSING_ASSET';
      continue;
    }
    if (!asset.sha256 || asset.sha256 === UNRESOLVED || asset.provenanceStatus === 'UNRESOLVED_HASH') {
      reasons.push(`${asset.slotId}: missing hash`);
      state ??= 'BLOCKED_MISSING_ASSET';
      continue;
    }
    if (asset.provenanceStatus === 'RESOLVED_RESTRICTED' && !allowRestricted) {
      reasons.push(`${asset.slotId}: restricted without explicit policy`);
      state ??= 'BLOCKED_UNAPPROVED_ASSET';
    }
    if ((INVALID_ASSET_STATES as readonly string[]).includes(asset.provenanceStatus) && asset.provenanceStatus !== 'UNRESOLVED_PROVENANCE') {
      reasons.push(`${asset.slotId}: ${asset.provenanceStatus}`);
      state ??= asset.provenanceStatus === 'BLOCKED_QUARANTINED' ? 'BLOCKED_QUARANTINED_ASSET' : 'BLOCKED_UNAPPROVED_ASSET';
    }
  }
  return { state: state ?? 'VALIDATING_ASSETS', reasons };
}

function characterBlock(characters: CharacterExecutionReceipt[]): { state: ReadinessState; reasons: string[] } {
  const reasons: string[] = [];
  let state: ReadinessState | null = null;
  for (const character of characters.filter((item) => item.visible)) {
    const required = requiredCapabilitiesForShot(character);
    const missingCaps = required.filter((item) => !character.declaredCapabilities.includes(item));
    if (missingCaps.length) {
      reasons.push(`${character.characterId}: missing capabilities ${missingCaps.join(',')}`);
      state ??= 'BLOCKED_MISSING_CHARACTER';
    }
    if (!character.approvedCharacterReceiptRef || character.approvedCharacterReceiptRef === UNRESOLVED) {
      reasons.push(`${character.characterId}: missing character receipt`);
      state ??= 'BLOCKED_MISSING_CHARACTER';
    }
    if (
      !character.approvedRigReceiptRef ||
      character.approvedRigReceiptRef === UNRESOLVED ||
      character.rigVersion === UNRESOLVED ||
      character.rigVersion === 'UNRESOLVED_PRODUCTION_RIG' ||
      !character.rigSha256 ||
      character.rigSha256 === UNRESOLVED
    ) {
      reasons.push(`${character.characterId}: missing rig`);
      state ??= 'BLOCKED_MISSING_RIG';
    }
    if (
      character.speaking &&
      (!character.approvedAnimationReceiptRef ||
        character.approvedAnimationReceiptRef === UNRESOLVED ||
        character.animationVersion === UNRESOLVED ||
        character.animationSha256 === UNRESOLVED)
    ) {
      reasons.push(`${character.characterId}: missing animation`);
      state ??= 'BLOCKED_MISSING_ANIMATION';
    }
    if (character.compatibilityStatus === 'VERSION_MISMATCH') {
      reasons.push(`${character.characterId}: version mismatch`);
      state ??= 'BLOCKED_CHARACTER_VERSION_MISMATCH';
    }
  }
  return { state: state ?? 'VALIDATING_CHARACTERS', reasons };
}

function provenanceBlock(assets: ExecutionAssetRequirement[]): { state: ReadinessState; reasons: string[] } {
  const unknown = assets.filter(
    (item) => item.required && (item.provenanceStatus === 'UNRESOLVED_PROVENANCE' || item.provenanceStatus === UNRESOLVED),
  );
  return {
    state: unknown.length ? 'BLOCKED_PROVENANCE_UNKNOWN' : 'VALIDATING_PROVENANCE',
    reasons: unknown.map((item) => `${item.slotId}: provenance unknown`),
  };
}

function materializationBlock(
  assets: ExecutionAssetRequirement[],
  materializations: MaterializationReceipt[],
): { state: ReadinessState; reasons: string[] } {
  const reasons: string[] = [];
  for (const asset of assets.filter((item) => item.required)) {
    const receipt = materializations.find((item) => item.sourceReceiptRef === asset.sourceReceiptRef);
    if (!receipt || !receipt.verified || receipt.materializationRef === UNRESOLVED) {
      reasons.push(`${asset.slotId}: materialization not verified`);
    } else if (receipt.sourceOverwriteAllowed) {
      reasons.push(`${asset.slotId}: source overwrite not allowed`);
    }
  }
  return {
    state: reasons.length ? 'BLOCKED_MATERIALIZATION' : 'VALIDATING_ASSETS',
    reasons,
  };
}

export function evaluateBlenderExecutionReadiness(input: ExecutionReadinessInput) {
  const blockingReasons: string[] = [];
  let readinessState: ReadinessState = 'DRAFT';

  readinessState = 'VALIDATING_HASH_CHAIN';
  const hashChain = validateHashChain(input.observedHashes, input.expectedHashes);
  if (!hashChain.allExact) {
    readinessState = 'BLOCKED_HASH_MISMATCH';
    blockingReasons.push(`hash mismatches: ${hashChain.mismatches.join(',')}`);
  }

  if (readinessState === 'VALIDATING_HASH_CHAIN') {
    readinessState = 'VALIDATING_SCRIPT_AUDIT';
    const auditOk =
      input.audit.safe &&
      input.audit.forbiddenTokensFound.length === 0 &&
      input.audit.externalUrlsFound.length === 0 &&
      input.audit.secretPatternsFound.length === 0 &&
      !input.audit.sourceOverwriteRisk &&
      !input.audit.networkRisk &&
      !input.audit.shellRisk;
    if (!auditOk) {
      readinessState = 'BLOCKED_SCRIPT_AUDIT';
      blockingReasons.push('script audit failed');
    }
  }

  const assets = assetBlock(input.assets, input.allowRestrictedAssets === true);
  if (readinessState === 'VALIDATING_SCRIPT_AUDIT') {
    readinessState = 'VALIDATING_ASSETS';
    if (assets.reasons.length) {
      readinessState = assets.state === 'VALIDATING_ASSETS' ? 'BLOCKED_UNKNOWN' : assets.state;
      blockingReasons.push(...assets.reasons);
    }
  } else if (assets.reasons.length) {
    blockingReasons.push(...assets.reasons);
  }

  const characters = characterBlock(input.characters);
  if (readinessState === 'VALIDATING_ASSETS') {
    readinessState = 'VALIDATING_CHARACTERS';
    if (characters.reasons.length) {
      readinessState = characters.state === 'VALIDATING_CHARACTERS' ? 'BLOCKED_UNKNOWN' : characters.state;
      blockingReasons.push(...characters.reasons);
    }
  } else if (characters.reasons.length) {
    blockingReasons.push(...characters.reasons);
  }

  const provenance = provenanceBlock(input.assets);
  if (readinessState === 'VALIDATING_CHARACTERS') {
    readinessState = 'VALIDATING_PROVENANCE';
    if (provenance.reasons.length) {
      readinessState = 'BLOCKED_PROVENANCE_UNKNOWN';
      blockingReasons.push(...provenance.reasons);
    }
  } else if (provenance.reasons.length) {
    blockingReasons.push(...provenance.reasons);
  }

  const materialization = materializationBlock(input.assets, input.materializations);
  if (readinessState === 'VALIDATING_PROVENANCE') {
    if (materialization.reasons.length) {
      readinessState = 'BLOCKED_MATERIALIZATION';
      blockingReasons.push(...materialization.reasons);
    }
  } else if (materialization.reasons.length) {
    blockingReasons.push(...materialization.reasons);
  }

  const blender = evaluateBlenderVersion(input.blender);
  if (readinessState === 'VALIDATING_PROVENANCE') {
    readinessState = 'VALIDATING_BLENDER_VERSION';
    if (blender.compatibility !== 'COMPATIBLE') {
      readinessState = 'BLOCKED_BLENDER_VERSION';
      blockingReasons.push(`blender ${blender.compatibility}`);
    }
  }

  const worker = evaluateWorkerIdentity(input.worker);
  if (readinessState === 'VALIDATING_BLENDER_VERSION') {
    readinessState = 'VALIDATING_WORKER';
    if (!worker.valid) {
      readinessState = 'BLOCKED_WORKER_IDENTITY';
      blockingReasons.push(worker.mutableTag ? 'mutable worker tag' : 'worker identity incomplete');
    }
  }

  if (readinessState === 'VALIDATING_WORKER') {
    readinessState = 'READY_FOR_EXECUTION_AUTHORIZATION';
  }

  const authorization = unissuedExecutionAuthorization({
    shotId: input.shotId,
    assemblyDependencySha256: input.observedHashes.assemblyHash,
    planDependencySha256: input.observedHashes.planHash,
    scriptSha256: input.observedHashes.scriptHash,
    workerIdentityHash: worker.workerIdentityHash,
  });
  const receiptRef = `${input.shotId}.readiness`;
  const intent = executionIntent({
    shotId: input.shotId,
    readinessReceiptRef: receiptRef,
    assemblyManifestRef: input.assemblyManifestRef,
    planRef: input.assemblyPlanRef,
    scriptRef: input.scriptRef,
    workerRequirementRef: worker.workerIdentityHash,
  });

  const receipt = {
    schemaVersion: EXECUTION_READINESS_SCHEMA,
    shotId: input.shotId,
    episodeId: input.episodeId,
    shotDependencySha256: input.observedHashes.shotHash,
    assemblyDependencySha256: input.observedHashes.assemblyHash,
    planDependencySha256: input.observedHashes.planHash,
    scriptSha256: input.observedHashes.scriptHash,
    assemblyManifestRef: input.assemblyManifestRef,
    assemblyPlanRef: input.assemblyPlanRef,
    scriptRef: input.scriptRef,
    scriptAuditRef: input.scriptAuditRef,
    assetResolutionSummary: {
      required: input.assets.filter((item) => item.required).length,
      blocked: assets.reasons.length,
    },
    characterResolutionSummary: {
      required: input.characters.filter((item) => item.visible).length,
      blocked: characters.reasons.length,
    },
    provenanceSummary: { unknown: provenance.reasons.length },
    workerReadiness: worker.valid,
    blenderCompatibility: blender.compatibility,
    scriptSafety: input.audit.safe,
    dependencyValidation: hashChain.allExact,
    readinessState,
    blockingReasons,
    executionAuthorizationRequired: true as const,
    executionAuthorizationIssued: false as const,
    blenderExecuted: false as const,
    providerContacted: false as const,
    gpuLaunched: false as const,
    paidCompute: false as const,
    executionCostClass: 'UNSELECTED' as CostClass,
    hashChain,
    botaniq: botaniqExecutionReadiness(),
    nativeLighting: {
      pluginDependency: 'NONE' as const,
      gaffer: 'OPTIONAL_PROVIDER_NOT_ACTIVATED' as const,
      physicalStarlight: 'OPTIONAL_PROVIDER_NOT_ACTIVATED' as const,
    },
    blender,
    worker,
    authorization,
    intent,
    capabilityRequirements: {
      schemaVersion: CHARACTER_CAPABILITY_SCHEMA,
      byCharacter: input.characters.map((item) => ({
        characterId: item.characterId,
        required: requiredCapabilitiesForShot(item),
      })),
    },
    notes: input.notes,
  };

  return {
    ...receipt,
    receiptSha256: sha256Canonical({
      schemaVersion: receipt.schemaVersion,
      shotId: receipt.shotId,
      episodeId: receipt.episodeId,
      hashes: input.observedHashes,
      expected: input.expectedHashes,
      readinessState,
      blockingReasons,
      audit: input.audit,
      assets: input.assets,
      characters: input.characters,
      materializations: input.materializations,
      blender: input.blender,
      worker: {
        workerKind: input.worker.workerKind,
        imageDigest: input.worker.imageDigest,
        sourceCommit: input.worker.sourceCommit,
        blenderVersion: input.worker.blenderVersion,
        assemblyDriverVersion: input.worker.assemblyDriverVersion,
        scriptAuditVersion: input.worker.scriptAuditVersion,
        tag: input.worker.tag,
        capabilities: input.worker.capabilities,
      },
      allowRestrictedAssets: input.allowRestrictedAssets === true,
    }),
  };
}

export type ExecutionReadinessReceipt = ReturnType<typeof evaluateBlenderExecutionReadiness>;

export function summarizeEpisodeReadiness(episodeId: string, receipts: ExecutionReadinessReceipt[]) {
  const blocked = receipts.filter((item) => item.readinessState.startsWith('BLOCKED_'));
  const by = (prefix: string) => receipts.filter((item) => item.readinessState.startsWith(prefix)).length;
  return {
    schemaVersion: EPISODE_EXECUTION_READINESS_SUMMARY_SCHEMA,
    episodeId,
    shotCount: receipts.length,
    readyForAuthorizationCount: receipts.filter((item) => item.readinessState === 'READY_FOR_EXECUTION_AUTHORIZATION').length,
    blockedShotCount: blocked.length,
    blockedByAssets:
      by('BLOCKED_MISSING_ASSET') + by('BLOCKED_UNAPPROVED_ASSET') + by('BLOCKED_QUARANTINED_ASSET'),
    blockedByCharacters:
      by('BLOCKED_MISSING_CHARACTER') +
      by('BLOCKED_MISSING_RIG') +
      by('BLOCKED_MISSING_ANIMATION') +
      by('BLOCKED_CHARACTER_VERSION_MISMATCH'),
    blockedByProvenance: by('BLOCKED_PROVENANCE_UNKNOWN'),
    blockedByHash: by('BLOCKED_HASH_MISMATCH'),
    blockedByScript: by('BLOCKED_SCRIPT_AUDIT'),
    blockedByWorker: by('BLOCKED_WORKER_IDENTITY') + by('BLOCKED_BLENDER_VERSION'),
    blockedByMaterialization: by('BLOCKED_MATERIALIZATION'),
    authorizationIssuedCount: 0,
    executionStartedCount: 0,
    blenderExecutedCount: 0,
  };
}

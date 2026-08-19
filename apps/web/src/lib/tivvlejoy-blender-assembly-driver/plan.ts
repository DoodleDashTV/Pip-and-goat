import { sha256Canonical } from '@/lib/tivvlejoy-storybook-environment';
import { UNRESOLVED } from '@/lib/tivvlejoy-shot-assembly-manifest';
import { auditBlenderScript, sha256Text } from './audit';
import { buildOperationGraph, collectionTargets, operationGraphRecord, type PlanExtras, type ShotAssemblyManifest } from './operations';
import { generateBlenderScript } from './script';
import { simulateAssembly } from './simulator';
import {
  BLENDER_ASSEMBLY_AUTHORIZATION_SCHEMA,
  BLENDER_ASSEMBLY_EXECUTION_REQUEST_SCHEMA,
  BLENDER_ASSEMBLY_PLAN_SCHEMA,
  BLENDER_PLAN_DIFF_SCHEMA,
  BLENDER_TARGET_VERSION,
  type BlenderOperation,
} from './types';

export function hashAssemblyPlan(input: {
  shotId: string;
  episodeId: string;
  shotDependencySha256: string;
  assemblyDependencySha256: string;
  blenderTargetVersion: string;
  operations: Array<Pick<BlenderOperation, 'operationId' | 'operationType' | 'dependsOn' | 'target' | 'parameters' | 'required' | 'status'>>;
  collectionNames: string[];
}) {
  return sha256Canonical({
    schemaVersion: BLENDER_ASSEMBLY_PLAN_SCHEMA,
    shotId: input.shotId,
    episodeId: input.episodeId,
    shotDependencySha256: input.shotDependencySha256,
    assemblyDependencySha256: input.assemblyDependencySha256,
    blenderTargetVersion: input.blenderTargetVersion,
    operations: input.operations.map((item) => ({
      operationId: item.operationId,
      operationType: item.operationType,
      dependsOn: item.dependsOn,
      target: item.target,
      parameters: item.parameters,
      required: item.required,
      status: item.status,
    })),
    collectionNames: input.collectionNames,
  });
}

export function unissuedAuthorization(input: {
  shotId: string;
  assemblyDependencySha256: string;
  planDependencySha256: string;
}) {
  return {
    schemaVersion: BLENDER_ASSEMBLY_AUTHORIZATION_SCHEMA,
    issued: false as const,
    shotId: input.shotId,
    assemblyDependencySha256: input.assemblyDependencySha256,
    planDependencySha256: input.planDependencySha256,
    allowCommercialSources: false as const,
    allowCharacterAssets: false as const,
    expiresAt: UNRESOLVED,
    issuedBy: 'UNISSUED',
  };
}

export function executionRequest(input: {
  shotId: string;
  scriptSha256: string;
  assemblyDependencySha256: string;
  planDependencySha256: string;
}) {
  return {
    schemaVersion: BLENDER_ASSEMBLY_EXECUTION_REQUEST_SCHEMA,
    shotId: input.shotId,
    scriptRef: `${input.shotId}.dryrun.py`,
    scriptSha256: input.scriptSha256,
    assemblyManifestRef: `${input.shotId}.manifest`,
    assemblyDependencySha256: input.assemblyDependencySha256,
    planDependencySha256: input.planDependencySha256,
    blenderVersion: BLENDER_TARGET_VERSION,
    workspaceRef: UNRESOLVED,
    authorizationRef: 'UNISSUED',
    dryRun: true as const,
    executionAuthorized: false as const,
  };
}

export function buildBlenderAssemblyPlan(manifest: ShotAssemblyManifest, extras: PlanExtras = {}) {
  const operations = buildOperationGraph(manifest, extras);
  const collections = collectionTargets(manifest.shotId);
  const collectionNames = [collections.root, ...collections.ordered.map((item) => item.path)];
  const planDependencySha256 = hashAssemblyPlan({
    shotId: manifest.shotId,
    episodeId: manifest.episodeId,
    shotDependencySha256: manifest.shotDependencySha256,
    assemblyDependencySha256: manifest.assemblyDependencySha256,
    blenderTargetVersion: BLENDER_TARGET_VERSION,
    operations,
    collectionNames,
  });
  const script = generateBlenderScript({ manifest, operations, planDependencySha256 });
  const audit = auditBlenderScript(script, manifest.shotId);
  const scriptSha256 = sha256Text(script);
  const authorization = unissuedAuthorization({
    shotId: manifest.shotId,
    assemblyDependencySha256: manifest.assemblyDependencySha256,
    planDependencySha256,
  });
  const simulation = simulateAssembly({
    shotId: manifest.shotId,
    operations,
    planDependencySha256,
    auditSafe: audit.safe,
    assemblyBlocked: manifest.assemblyStatus === 'ASSEMBLY_BLOCKED',
  });
  const cameraOps = operations.filter((item) => item.stage === '080_CREATE_AND_BIND_CAMERA');
  const lightingOps = operations.filter((item) => item.stage === '090_CREATE_AND_BIND_LIGHTING');
  return {
    schemaVersion: BLENDER_ASSEMBLY_PLAN_SCHEMA,
    shotId: manifest.shotId,
    episodeId: manifest.episodeId,
    shotDependencySha256: manifest.shotDependencySha256,
    assemblyDependencySha256: manifest.assemblyDependencySha256,
    blenderTargetVersion: BLENDER_TARGET_VERSION,
    collectionPlan: { root: collections.root, ordered: collections.ordered },
    objectInstancePlan: operations.filter((item) => item.assetClass === 'SCENE_INSTANCE').map((item) => item.target),
    cameraPlan: cameraOps.map((item) => ({ operationId: item.operationId, target: item.target, parameters: item.parameters })),
    lightingPlan: lightingOps.map((item) => ({ operationId: item.operationId, target: item.target, parameters: item.parameters })),
    characterPlan: operations.filter((item) => item.operationType === 'INSTANCE_CHARACTER'),
    environmentPlan: operations.filter((item) => item.stage === '050_INSTANCE_ENVIRONMENT_ASSETS'),
    storyPropPlan: operations.filter((item) => item.operationType === 'INSTANCE_STORY_PROP'),
    dressingPlan: operations.filter((item) => item.operationType === 'APPLY_DRESSING'),
    validationPlan: operations.filter((item) => item.operationType.startsWith('VALIDATE')),
    orderedOperations: operations,
    operationGraph: operationGraphRecord(operations),
    unresolvedDependencies: manifest.unresolvedDependencies,
    hardBlockers: manifest.hardBlockers,
    planDependencySha256,
    script: {
      schemaVersion: 'TIVVLEJOY_BLENDER_SCRIPT_V1',
      source: script,
      scriptSha256,
    },
    audit,
    simulation,
    authorization,
    executionRequest: executionRequest({
      shotId: manifest.shotId,
      scriptSha256,
      assemblyDependencySha256: manifest.assemblyDependencySha256,
      planDependencySha256,
    }),
    notes: extras.notes,
    displayLabel: extras.displayLabel,
    executionAuthorized: false as const,
    blenderExecuted: false as const,
    safety: {
      blenderExecuted: false as const,
      subprocessExecuted: false as const,
      networkProviderContacted: false as const,
      runpodContacted: false as const,
      gpuLaunched: false as const,
      paidCompute: false as const,
      botaniqProcessed: false as const,
      commercialBytesRead: false as const,
    },
  };
}

export type BlenderAssemblyPlan = ReturnType<typeof buildBlenderAssemblyPlan>;

function canonOp(operation: BlenderOperation) {
  return JSON.stringify({
    operationId: operation.operationId,
    operationType: operation.operationType,
    target: operation.target,
    parameters: operation.parameters,
    status: operation.status,
  });
}

export function diffBlenderPlans(previous: BlenderAssemblyPlan, next: BlenderAssemblyPlan) {
  const prevMap = new Map(previous.orderedOperations.map((item) => [item.operationId, item]));
  const nextMap = new Map(next.orderedOperations.map((item) => [item.operationId, item]));
  const unchangedOperations: string[] = [];
  const addedOperations: string[] = [];
  const removedOperations: string[] = [];
  const changedOperations: string[] = [];
  for (const [id, operation] of nextMap) {
    const prior = prevMap.get(id);
    if (!prior) addedOperations.push(id);
    else if (canonOp(prior) === canonOp(operation)) unchangedOperations.push(id);
    else changedOperations.push(id);
  }
  for (const id of prevMap.keys()) {
    if (!nextMap.has(id)) removedOperations.push(id);
  }
  const assemblyChanged = changedOperations.length + addedOperations.length + removedOperations.length > 0;
  const realReassembly = next.characterPlan.some((item) => item.status === 'PLANNED') && assemblyChanged;
  return {
    schemaVersion: BLENDER_PLAN_DIFF_SCHEMA,
    affectedShot: next.shotId,
    unchangedOperations,
    addedOperations,
    removedOperations,
    changedOperations,
    requiresPreviewReassembly: assemblyChanged,
    requiresRealReassembly: realReassembly,
    visualApprovalBecomesStale: assemblyChanged,
  };
}

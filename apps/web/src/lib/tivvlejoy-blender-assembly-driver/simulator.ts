import {
  ASSEMBLY_IDEMPOTENCY_SCHEMA,
  ASSEMBLY_SIMULATION_RECEIPT_SCHEMA,
  IDEMPOTENCY_MODES,
  type BlenderOperation,
  type DryRunResult,
} from './types';

export function idempotencyContract() {
  return {
    schemaVersion: ASSEMBLY_IDEMPOTENCY_SCHEMA,
    modes: IDEMPOTENCY_MODES,
    executed: false as const,
    secondPassDuplicates: 0,
    refuseSourceOverwrite: true as const,
  };
}

export function simulateAssembly(input: {
  shotId: string;
  operations: BlenderOperation[];
  planDependencySha256: string;
  auditSafe: boolean;
  assemblyBlocked: boolean;
}) {
  const collections = new Set<string>();
  const objects = new Set<string>();
  let completedOperations = 0;
  let blockedOperations = 0;
  let skippedOperations = 0;
  let unresolvedCharacterCount = 0;
  let unresolvedEnvironmentCount = 0;

  const apply = (pass: 1 | 2) => {
    let createdThisPass = 0;
    for (const operation of input.operations) {
      if (operation.status === 'SKIPPED') {
        if (pass === 1) {
          skippedOperations += 1;
          if (
            operation.operationType === 'INSTANCE_CHARACTER' &&
            operation.parameters.rigVersion === 'UNRESOLVED_PRODUCTION_RIG'
          ) {
            unresolvedCharacterCount += 1;
          }
        }
        continue;
      }
      if (operation.status.startsWith('BLOCKED')) {
        if (pass === 1) {
          blockedOperations += 1;
          if (operation.operationType === 'INSTANCE_CHARACTER') unresolvedCharacterCount += 1;
          if (operation.operationType === 'INSTANCE_ASSET' && operation.stage === '050_INSTANCE_ENVIRONMENT_ASSETS') {
            unresolvedEnvironmentCount += 1;
          }
        }
        continue;
      }
      if (
        operation.operationType === 'CREATE_COLLECTION' ||
        operation.operationType === 'CREATE_CHILD_COLLECTION'
      ) {
        if (!collections.has(operation.target)) {
          collections.add(operation.target);
          createdThisPass += 1;
        }
      }
      if (
        operation.operationType === 'CREATE_CAMERA' ||
        operation.operationType === 'CREATE_LIGHT' ||
        operation.operationType === 'CREATE_EMPTY' ||
        ((operation.operationType === 'INSTANCE_ASSET' || operation.operationType === 'INSTANCE_STORY_PROP') &&
          operation.status === 'PLANNED')
      ) {
        if (!objects.has(operation.target)) {
          objects.add(operation.target);
          createdThisPass += 1;
        }
      }
      if (pass === 1) completedOperations += 1;
    }
    return createdThisPass;
  };

  apply(1);
  const secondPassCreated = apply(2);

  let simulationResult: DryRunResult = 'DRY_RUN_VALID';
  if (!input.auditSafe) simulationResult = 'SCRIPT_AUDIT_FAILED';
  else if (input.assemblyBlocked) simulationResult = 'DRY_RUN_BLOCKED';
  else if (unresolvedCharacterCount > 0 || unresolvedEnvironmentCount > 0) {
    simulationResult = 'DRY_RUN_VALID_WITH_UNRESOLVED_ASSETS';
  }

  return {
    schemaVersion: ASSEMBLY_SIMULATION_RECEIPT_SCHEMA,
    shotId: input.shotId,
    operationCount: input.operations.length,
    completedOperations,
    blockedOperations,
    skippedOperations,
    collectionCount: collections.size,
    plannedObjectCount: objects.size,
    unresolvedCharacterCount,
    unresolvedEnvironmentCount,
    simulationResult,
    planDependencySha256: input.planDependencySha256,
    blenderExecuted: false as const,
    secondPassDuplicates: secondPassCreated,
    idempotency: idempotencyContract(),
  };
}

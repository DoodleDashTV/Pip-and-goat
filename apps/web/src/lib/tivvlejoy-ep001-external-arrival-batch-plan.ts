import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001ExternalArrivalIntakePlan } from '@/lib/tivvlejoy-ep001-external-arrival-intake-plan';
import type { ExternalArrivalCandidate } from '@/lib/tivvlejoy-ep001-external-arrival-receipt';

export const EP001_EXTERNAL_ARRIVAL_BATCH_PLAN_SCHEMA =
  'TIVVLEJOY_EP001_EXTERNAL_ARRIVAL_BATCH_PLAN_V1' as const;

export function compileEp001ExternalArrivalBatchPlan(
  inputs: readonly ExternalArrivalCandidate[],
  now = new Date(),
) {
  if (inputs.length === 0) throw new Error('EP001_EXTERNAL_ARRIVAL_BATCH_EMPTY');
  const plans = inputs.map((input) => compileEp001ExternalArrivalIntakePlan(input, now));
  const triggerIds = plans.map((plan) => plan.triggerId);
  const duplicateTriggerIds = [...new Set(triggerIds.filter((id, index) => triggerIds.indexOf(id) !== index))];
  if (duplicateTriggerIds.length > 0) {
    throw new Error(`DUPLICATE_EP001_EXTERNAL_TRIGGER_IN_BATCH:${duplicateTriggerIds.join(',')}`);
  }

  const receiptHashes = plans.map((plan) => plan.arrivalReceiptSha256);
  const duplicateReceiptHashes = [...new Set(receiptHashes.filter((hash, index) => receiptHashes.indexOf(hash) !== index))];
  if (duplicateReceiptHashes.length > 0) {
    throw new Error(`DUPLICATE_EP001_EXTERNAL_RECEIPT_IN_BATCH:${duplicateReceiptHashes.join(',')}`);
  }

  const safeActions = plans.flatMap((plan) => plan.safeActions);
  const body = {
    schemaVersion: EP001_EXTERNAL_ARRIVAL_BATCH_PLAN_SCHEMA,
    episodeId: 'EP001' as const,
    state: 'PARALLEL_ZERO_COST_INTAKE_PLANS_PREPARED' as const,
    plans,
    safeActions,
    metrics: {
      inputCount: inputs.length,
      uniqueTriggerCount: new Set(triggerIds).size,
      uniqueReceiptCount: new Set(receiptHashes).size,
      safeActionCount: safeActions.length,
    },
    authority: {
      arrivalsPersisted: false as const,
      admissionGranted: false as const,
      humanApprovalGranted: false as const,
      paidExecutionAuthorized: false as const,
      productionWritesAllowed: false as const,
    },
    safety: {
      providerCalls: 0 as const,
      blenderLaunched: false as const,
      paidRequests: 0 as const,
      productionMutations: 0 as const,
    },
  };

  return { ...body, externalArrivalBatchPlanSha256: sha256Canonical(body) };
}

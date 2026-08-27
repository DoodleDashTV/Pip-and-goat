import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001AutonomousReadinessController } from '@/lib/tivvlejoy-ep001-autonomous-readiness-controller';
import {
  compileEp001ExternalArrivalReceipt,
  validateEp001ExternalArrivalReceiptFreshness,
  type ExternalArrivalCandidate,
} from '@/lib/tivvlejoy-ep001-external-arrival-receipt';

export const EP001_EXTERNAL_ARRIVAL_INTAKE_PLAN_SCHEMA =
  'TIVVLEJOY_EP001_EXTERNAL_ARRIVAL_INTAKE_PLAN_V1' as const;

function resolveTriggerId(input: ExternalArrivalCandidate) {
  if (input.arrivalType === 'RIG') {
    return input.candidate.characterId === 'CHAR_PIP_001'
      ? 'PIP_RIG_ARRIVES'
      : 'GOAT_RIG_ARRIVES';
  }
  if (input.arrivalType === 'SCENERY_LICENSE') return 'SCENERY_LICENSE_EVIDENCE_ARRIVES';
  if (input.arrivalType === 'HUMAN_DECISION') return 'HUMAN_DECISION_RECEIPT_ARRIVES';
  return input.candidate.scope === 'EP001_VOICE_GENERATION'
    ? 'VOICE_PAID_AUTHORIZATION_ARRIVES'
    : 'FINAL_RENDER_AUTHORIZATION_ARRIVES';
}

export function compileEp001ExternalArrivalIntakePlan(
  input: ExternalArrivalCandidate,
  now = new Date(),
) {
  const receipt = compileEp001ExternalArrivalReceipt(input, now);
  const freshness = validateEp001ExternalArrivalReceiptFreshness(receipt);
  if (!freshness.current) throw new Error('STALE_EP001_EXTERNAL_ARRIVAL_RECEIPT');

  const triggerId = resolveTriggerId(input);
  const controller = compileEp001AutonomousReadinessController({ observedTriggerIds: [triggerId] });
  const safeActions = controller.safeAutomaticActionQueue.filter((item) => item.triggerId === triggerId);

  const body = {
    schemaVersion: EP001_EXTERNAL_ARRIVAL_INTAKE_PLAN_SCHEMA,
    episodeId: 'EP001' as const,
    triggerId,
    arrivalReceiptSha256: receipt.arrivalReceiptSha256,
    externalArrivalTriggerMatrixSha256: receipt.externalArrivalTriggerMatrixSha256,
    state: 'SAFE_ZERO_COST_INTAKE_PLAN_PREPARED' as const,
    safeActions,
    blockedActions: controller.triggerStates.find((trigger) => trigger.triggerId === triggerId)?.blockedActions ?? [],
    authority: {
      arrivalPersisted: false as const,
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

  return { ...body, intakePlanSha256: sha256Canonical(body) };
}

export type Ep001ExternalArrivalIntakePlan = ReturnType<typeof compileEp001ExternalArrivalIntakePlan>;

import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001ExternalArrivalTriggerMatrix } from '@/lib/tivvlejoy-ep001-external-arrival-trigger-matrix';
import {
  validatePaidAuthorizationArrival,
  validateRigArrival,
  validateSceneryLicenseArrival,
  type PaidAuthorizationCandidate,
  type RigArrivalCandidate,
  type SceneryLicenseCandidate,
} from '@/lib/tivvlejoy-ep001-external-arrival-validators';
import {
  validateEp001HumanDecisionReceipt,
  type Ep001HumanDecisionReceiptInput,
} from '@/lib/tivvlejoy-ep001-human-decision-receipt';

export const EP001_EXTERNAL_ARRIVAL_RECEIPT_SCHEMA =
  'TIVVLEJOY_EP001_EXTERNAL_ARRIVAL_RECEIPT_V1' as const;

export type ExternalArrivalCandidate =
  | { arrivalType: 'RIG'; candidate: RigArrivalCandidate }
  | { arrivalType: 'SCENERY_LICENSE'; candidate: SceneryLicenseCandidate }
  | { arrivalType: 'PAID_AUTHORIZATION'; candidate: PaidAuthorizationCandidate }
  | { arrivalType: 'HUMAN_DECISION'; candidate: Ep001HumanDecisionReceiptInput };

export function compileEp001ExternalArrivalReceipt(
  input: ExternalArrivalCandidate,
  now = new Date(),
) {
  const matrix = compileEp001ExternalArrivalTriggerMatrix();

  let valid = false;
  let errors: string[] = [];
  if (input.arrivalType === 'RIG') {
    const validation = validateRigArrival(input.candidate);
    valid = validation.valid;
    errors = validation.errors;
  } else if (input.arrivalType === 'SCENERY_LICENSE') {
    const validation = validateSceneryLicenseArrival(input.candidate);
    valid = validation.valid;
    errors = validation.errors;
  } else if (input.arrivalType === 'PAID_AUTHORIZATION') {
    const validation = validatePaidAuthorizationArrival(input.candidate, now);
    valid = validation.valid;
    errors = validation.errors;
  } else {
    const validation = validateEp001HumanDecisionReceipt(input.candidate);
    valid = validation.structurallyValid;
    errors = validation.issues;
  }

  if (!valid) {
    throw new Error(`EXTERNAL_ARRIVAL_VALIDATION_FAILED:${errors.join(',')}`);
  }

  const body = {
    schemaVersion: EP001_EXTERNAL_ARRIVAL_RECEIPT_SCHEMA,
    episodeId: 'EP001' as const,
    externalArrivalTriggerMatrixSha256: matrix.externalArrivalTriggerMatrixSha256,
    arrivalType: input.arrivalType,
    candidate: input.candidate,
    validation: {
      valid: true as const,
      errors: [] as const,
    },
    receiptState: 'STRUCTURALLY_VALID_EXTERNAL_CANDIDATE' as const,
    authority: {
      arrivalObserved: false as const,
      admissionGranted: false as const,
      humanApprovalGranted: false as const,
      paidExecutionAuthorized: false as const,
      productionWritesAllowed: false as const,
    },
  };

  return { ...body, arrivalReceiptSha256: sha256Canonical(body) };
}

export type Ep001ExternalArrivalReceipt = ReturnType<typeof compileEp001ExternalArrivalReceipt>;

export function validateEp001ExternalArrivalReceiptFreshness(
  receipt: Pick<Ep001ExternalArrivalReceipt, 'externalArrivalTriggerMatrixSha256'>,
) {
  const matrix = compileEp001ExternalArrivalTriggerMatrix();
  const current = receipt.externalArrivalTriggerMatrixSha256 === matrix.externalArrivalTriggerMatrixSha256;
  return {
    current,
    expectedExternalArrivalTriggerMatrixSha256: matrix.externalArrivalTriggerMatrixSha256,
    suppliedExternalArrivalTriggerMatrixSha256: receipt.externalArrivalTriggerMatrixSha256,
    admissionGranted: false as const,
    paidExecutionAuthorized: false as const,
  };
}

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const PRODUCTION_READINESS_SCHEMA = 'TIVVLEJOY_PRODUCTION_READINESS_V1';
export const PRODUCTION_READINESS_FILENAME = 'PRODUCTION_READINESS_V1.json';

export type ProductionReadinessReceipt = {
  schema?: string;
  policySchema?: string;
  productionReady?: boolean;
  paidFinalAllowed?: boolean;
  stages?: string[];
  blockers?: string[];
  fallbackCount?: number;
  humanVisualApproved?: boolean;
  motionTemporalApproved?: boolean;
  workerParityOk?: boolean;
};

export type QualityGuardrailCheck = {
  ok: boolean;
  path: string;
  receipt: ProductionReadinessReceipt | null;
  blockers: string[];
};

export function productionReadinessPath(repoRoot: string): string {
  return path.join(
    repoRoot,
    'artifacts',
    'tivvlejoy-scenery-showcase-30s',
    PRODUCTION_READINESS_FILENAME,
  );
}

export function loadProductionReadinessReceipt(repoRoot: string): QualityGuardrailCheck {
  const receiptPath = productionReadinessPath(repoRoot);
  const blockers: string[] = [];
  if (!existsSync(receiptPath)) {
    return {
      ok: false,
      path: receiptPath,
      receipt: null,
      blockers: ['QUALITY_GUARDRAIL_RECEIPT_MISSING'],
    };
  }

  let receipt: ProductionReadinessReceipt;
  try {
    receipt = JSON.parse(readFileSync(receiptPath, 'utf8')) as ProductionReadinessReceipt;
  } catch {
    return {
      ok: false,
      path: receiptPath,
      receipt: null,
      blockers: ['QUALITY_GUARDRAIL_RECEIPT_INVALID_JSON'],
    };
  }

  if (receipt.schema !== PRODUCTION_READINESS_SCHEMA) blockers.push('QUALITY_GUARDRAIL_SCHEMA_INVALID');
  if (receipt.productionReady !== true) blockers.push('QUALITY_GUARDRAIL_PRODUCTION_NOT_READY');
  if (receipt.paidFinalAllowed !== true) blockers.push('QUALITY_GUARDRAIL_PAID_FINAL_NOT_ALLOWED');
  if (receipt.humanVisualApproved !== true) blockers.push('QUALITY_GUARDRAIL_HUMAN_VISUAL_APPROVAL_MISSING');
  if (receipt.motionTemporalApproved !== true) blockers.push('QUALITY_GUARDRAIL_TEMPORAL_APPROVAL_MISSING');
  if (receipt.workerParityOk !== true) blockers.push('QUALITY_GUARDRAIL_WORKER_PARITY_MISSING');
  if (!Array.isArray(receipt.stages) || !receipt.stages.includes('PRODUCTION_READY')) blockers.push('QUALITY_GUARDRAIL_STAGE_NOT_PRODUCTION_READY');
  if (Number(receipt.fallbackCount || 0) !== 0) blockers.push('QUALITY_GUARDRAIL_FALLBACK_PRESENT');
  if (Array.isArray(receipt.blockers) && receipt.blockers.length > 0) blockers.push('QUALITY_GUARDRAIL_RECEIPT_HAS_BLOCKERS');

  return {
    ok: blockers.length === 0,
    path: receiptPath,
    receipt,
    blockers,
  };
}

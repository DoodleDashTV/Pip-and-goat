import { sha256Canonical } from './hash';
import { BACKEND_IDENTITY_SCHEMA, type BackendIdentityRecord } from './types';

export const PROVEN_TEMPLATE_ID = '34a9iknfuc';
export const PROVEN_TEMPLATE_NAME = 'TivvleJoy Blender Worker - b53fcbf5';
export const PROVEN_WORKER_IMAGE_DIGEST =
  'sha256:b53fcbf5fc973ad8e1e5f1e240f58d12885143e11494a3871f579c6fb351faed';
export const HISTORICAL_ATTEMPT_1_TEMPLATE_ID = 'rc8eyeqhn2';
export const HISTORICAL_ATTEMPT_1_TEMPLATE_NAME = 'TivvleJoy Blender Worker - d791981a';
export const HISTORICAL_ATTEMPT_1_WORKER_IMAGE_DIGEST =
  'sha256:d791981a4ed530214dcf96cb76593ad6e849c9e408672df36db102a52cdc1b25';
export const MUTABLE_IMAGE_TAGS = Object.freeze(['latest', 'stable', 'production']);

export const PINNED_GPU_TYPE = 'NVIDIA GeForce RTX 4090';
export const PINNED_CLOUD_TYPE = 'SECURE';
export const PINNED_GPU_COUNT = 1;
export const MAX_HOURLY_USD = 0.75;
export const MAX_RUNTIME_MINUTES = 20;
export const MAX_COMPUTE_USD = 0.25;
export const REQUIRED_BLENDER_VERSION = '4.2.3';

export const PAID_GPU_ENABLED = false;
export const POD_CREATION_ENABLED = false;
export const REAL_NETWORK_MUTATION_ENABLED = false;
export const REMOTE_BLENDER_EXECUTION_ENABLED = false;

export const PROVEN_BACKEND_IDENTITY: BackendIdentityRecord = Object.freeze({
  schemaVersion: BACKEND_IDENTITY_SCHEMA,
  templateId: PROVEN_TEMPLATE_ID,
  templateName: PROVEN_TEMPLATE_NAME,
  workerImageDigest: PROVEN_WORKER_IMAGE_DIGEST,
  templateReceiptHash: '',
  provenance: 'TEMPLATE_READY',
  provenAttempt: 'PAID_SMOKE_TEST_PASS',
  historicalAttempt1TemplateId: HISTORICAL_ATTEMPT_1_TEMPLATE_ID,
  mutableTagsRefused: MUTABLE_IMAGE_TAGS,
});

export const PROVEN_TEMPLATE_RECEIPT_HASH = sha256Canonical({
  templateId: PROVEN_TEMPLATE_ID,
  templateName: PROVEN_TEMPLATE_NAME,
  workerImageDigest: PROVEN_WORKER_IMAGE_DIGEST,
  provenance: 'TEMPLATE_READY',
  provenAttempt: 'PAID_SMOKE_TEST_PASS',
});

export const CURRENT_BACKEND_IDENTITY: BackendIdentityRecord = Object.freeze({
  ...PROVEN_BACKEND_IDENTITY,
  templateReceiptHash: PROVEN_TEMPLATE_RECEIPT_HASH,
});

export function imageUsesMutableTag(image: string): boolean {
  const lowered = String(image || '').toLowerCase();
  return MUTABLE_IMAGE_TAGS.some(
    (tag) => lowered.endsWith(`:${tag}`) || lowered.includes(`:${tag}@`) || lowered.includes(`/${tag}`),
  );
}

export function backendIdentityMatches(input: {
  templateId?: string;
  templateName?: string;
  workerImageDigest?: string;
  templateReceiptHash?: string;
}): { ok: true } | { ok: false; reason: string } {
  if (input.templateId === HISTORICAL_ATTEMPT_1_TEMPLATE_ID) {
    return { ok: false, reason: 'Historical attempt #1 template cannot satisfy current readiness.' };
  }
  if (input.templateId !== PROVEN_TEMPLATE_ID) {
    return { ok: false, reason: `Template ID is not the proven backend ${PROVEN_TEMPLATE_ID}.` };
  }
  if (input.templateName && input.templateName !== PROVEN_TEMPLATE_NAME) {
    return { ok: false, reason: 'Template name is not the proven b53fcbf5 worker identity.' };
  }
  if (input.workerImageDigest !== PROVEN_WORKER_IMAGE_DIGEST) {
    return { ok: false, reason: 'Worker image digest is not the proven immutable digest.' };
  }
  if (imageUsesMutableTag(input.workerImageDigest || '')) {
    return { ok: false, reason: 'Mutable tags such as latest/stable/production are refused.' };
  }
  if (input.templateReceiptHash && input.templateReceiptHash !== PROVEN_TEMPLATE_RECEIPT_HASH) {
    return { ok: false, reason: 'Trusted template receipt hash does not match the proven backend.' };
  }
  return { ok: true };
}

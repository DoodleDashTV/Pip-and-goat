/**
 * Sanitized TivvleJoy RunPod template creation receipts.
 *
 * Two immutable generations are recorded:
 *   historical paid-smoke attempt #1 — rc8eyeqhn2 / d791981a
 *   current worker generation — b53fcbf5 / newly created template
 *
 * A receipt may prove omitted GET fields only for the SAME generation.
 * Never contains API keys, Authorization headers, R2 credentials,
 * GitHub tokens, Vercel tokens, or any other secret.
 */

import { createHash } from 'node:crypto';

import {
  REQUIRED_IMAGE_NAME,
  SUGGESTED_CONTAINER_DISK_GB,
  SUGGESTED_TEMPLATE_NAME,
  SUGGESTED_VOLUME_IN_GB,
} from './tivvlejoy-runpod-template-readiness.mjs';

export const PAID_SMOKE_ATTEMPT_1_TEMPLATE_ID = 'rc8eyeqhn2';
export const PAID_SMOKE_ATTEMPT_1_TEMPLATE_NAME = 'TivvleJoy Blender Worker - d791981a';
export const PAID_SMOKE_ATTEMPT_1_WORKER_IMAGE =
  'ghcr.io/doodledashtv/ddp-runpod-blender@sha256:d791981a4ed530214dcf96cb76593ad6e849c9e408672df36db102a52cdc1b25'; // pragma: allowlist secret
export const PAID_SMOKE_ATTEMPT_1_WORKER_IMAGE_DIGEST =
  'sha256:d791981a4ed530214dcf96cb76593ad6e849c9e408672df36db102a52cdc1b25';

export const HISTORICAL_ATTEMPT_1_TEMPLATE_ID = PAID_SMOKE_ATTEMPT_1_TEMPLATE_ID;
export const HISTORICAL_ATTEMPT_1_TEMPLATE_NAME = PAID_SMOKE_ATTEMPT_1_TEMPLATE_NAME;
export const HISTORICAL_ATTEMPT_1_IMAGE_NAME = PAID_SMOKE_ATTEMPT_1_WORKER_IMAGE;

export const TRUSTED_CREATE_HTTP_STATUS = 201;

export const FORBIDDEN_RECEIPT_KEYS = Object.freeze([
  'RUNPOD_API_KEY',
  'Authorization',
  'authorization',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'OBJECT_STORAGE_ACCESS_KEY_ID',
  'OBJECT_STORAGE_SECRET_ACCESS_KEY',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'VERCEL_TOKEN',
  'LAUNCH_TIVVLEJOY_GPU',
  'PAID_APPROVAL_PHRASE',
]);

export function buildSanitizedExpectedCreatePayload({
  imageName = REQUIRED_IMAGE_NAME,
  name = SUGGESTED_TEMPLATE_NAME,
} = {}) {
  return {
    category: 'NVIDIA',
    containerDiskInGb: SUGGESTED_CONTAINER_DISK_GB,
    dockerEntrypoint: [],
    dockerStartCmd: [],
    env: {},
    imageName,
    isPublic: false,
    isServerless: false,
    name,
    ports: [],
    volumeInGb: SUGGESTED_VOLUME_IN_GB,
    volumeMountPath: '',
  };
}

export function buildSanitizedHistoricalAttempt1CreatePayload() {
  return buildSanitizedExpectedCreatePayload({
    imageName: HISTORICAL_ATTEMPT_1_IMAGE_NAME,
    name: HISTORICAL_ATTEMPT_1_TEMPLATE_NAME,
  });
}

export function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashSanitizedCreatePayload(payload = buildSanitizedExpectedCreatePayload()) {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

export const HISTORICAL_ATTEMPT_1_PAYLOAD_HASH = hashSanitizedCreatePayload(
  buildSanitizedHistoricalAttempt1CreatePayload(),
);

function freezeReceipt(receipt) {
  return Object.freeze({
    ...receipt,
    requestedEnv: Object.freeze({ ...(receipt.requestedEnv || {}) }),
    requestedPorts: Object.freeze([...(receipt.requestedPorts || [])]),
    requestedDockerEntrypoint: Object.freeze([...(receipt.requestedDockerEntrypoint || [])]),
    requestedDockerStartCmd: Object.freeze([...(receipt.requestedDockerStartCmd || [])]),
  });
}

export function buildSanitizedTrustedReceipt({
  templateId,
  name = SUGGESTED_TEMPLATE_NAME,
  imageName = REQUIRED_IMAGE_NAME,
  createHttpStatus = TRUSTED_CREATE_HTTP_STATUS,
  generation = 'CURRENT_B53FCBF5',
} = {}) {
  return freezeReceipt({
    generation,
    templateId,
    name,
    imageName,
    createHttpStatus,
    requestedIsPublic: false,
    requestedIsServerless: false,
    requestedVolumeInGb: 0,
    requestedVolumeMountPath: '',
    requestedEnv: {},
    requestedPorts: [],
    requestedDockerEntrypoint: [],
    requestedDockerStartCmd: [],
    requestedContainerDiskInGb: SUGGESTED_CONTAINER_DISK_GB,
    requestedCategory: 'NVIDIA',
    sanitizedCreatePayloadHash: hashSanitizedCreatePayload(
      buildSanitizedExpectedCreatePayload({ imageName, name }),
    ),
  });
}

export const TIVVLEJOY_HISTORICAL_ATTEMPT_1_TEMPLATE_CREATION_RECEIPT = buildSanitizedTrustedReceipt({
  templateId: HISTORICAL_ATTEMPT_1_TEMPLATE_ID,
  name: HISTORICAL_ATTEMPT_1_TEMPLATE_NAME,
  imageName: HISTORICAL_ATTEMPT_1_IMAGE_NAME,
  generation: 'PAID_SMOKE_ATTEMPT_1',
});

/**
 * Current-generation receipt. Template ID is filled after the one allowed
 * POST /v1/templates (or read-only recovery of an already-compatible template).
 */
export const TRUSTED_TEMPLATE_ID = '34a9iknfuc';

export const TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT = buildSanitizedTrustedReceipt({
  templateId: TRUSTED_TEMPLATE_ID,
  name: SUGGESTED_TEMPLATE_NAME,
  imageName: REQUIRED_IMAGE_NAME,
  generation: 'CURRENT_B53FCBF5',
});

function collectKeys(value, keys = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return keys;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      keys.push(key);
      collectKeys(nested, keys);
    }
  }
  return keys;
}

export function receiptContainsForbiddenKeys(receipt) {
  return collectKeys(receipt).some((key) => FORBIDDEN_RECEIPT_KEYS.includes(key));
}

function receiptHasRequiredShape(receipt) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return false;
  if (receiptContainsForbiddenKeys(receipt)) return false;
  if (typeof receipt.templateId !== 'string' || receipt.templateId.trim().length === 0) return false;
  if (receipt.createHttpStatus !== TRUSTED_CREATE_HTTP_STATUS) return false;
  if (receipt.requestedIsPublic !== false) return false;
  if (receipt.requestedIsServerless !== false) return false;
  if (receipt.requestedVolumeInGb !== 0) return false;
  if (receipt.requestedVolumeMountPath !== '') return false;
  if (receipt.requestedContainerDiskInGb !== SUGGESTED_CONTAINER_DISK_GB) return false;
  if (receipt.requestedCategory !== 'NVIDIA') return false;
  if (!receipt.requestedEnv || Object.keys(receipt.requestedEnv).length !== 0) return false;
  if (!Array.isArray(receipt.requestedPorts) || receipt.requestedPorts.length !== 0) return false;
  if (!Array.isArray(receipt.requestedDockerEntrypoint) || receipt.requestedDockerEntrypoint.length !== 0) {
    return false;
  }
  if (!Array.isArray(receipt.requestedDockerStartCmd) || receipt.requestedDockerStartCmd.length !== 0) {
    return false;
  }
  return true;
}

export function receiptIsTrustedCurrentGeneration(receipt) {
  if (!receiptHasRequiredShape(receipt)) return false;
  if (receipt.name !== SUGGESTED_TEMPLATE_NAME) return false;
  if (receipt.imageName !== REQUIRED_IMAGE_NAME) return false;
  if (receipt.sanitizedCreatePayloadHash !== hashSanitizedCreatePayload()) return false;
  return true;
}

export function receiptIsTrustedCurrent(receipt) {
  return receiptIsTrustedCurrentGeneration(receipt) && receipt.templateId === TRUSTED_TEMPLATE_ID;
}

export function receiptIsTrustedHistoricalAttempt1(receipt) {
  if (!receiptHasRequiredShape(receipt)) return false;
  if (receipt.templateId !== HISTORICAL_ATTEMPT_1_TEMPLATE_ID) return false;
  if (receipt.name !== HISTORICAL_ATTEMPT_1_TEMPLATE_NAME) return false;
  if (receipt.imageName !== HISTORICAL_ATTEMPT_1_IMAGE_NAME) return false;
  if (receipt.sanitizedCreatePayloadHash !== HISTORICAL_ATTEMPT_1_PAYLOAD_HASH) return false;
  return true;
}

export function receiptIsTrusted(receipt) {
  return receiptIsTrustedCurrentGeneration(receipt) || receiptIsTrustedHistoricalAttempt1(receipt);
}

export function receiptMatchesTemplate(template, receipt = TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT) {
  if (!receiptIsTrusted(receipt)) return false;
  if (!template || typeof template !== 'object' || Array.isArray(template)) return false;
  return (
    template.id === receipt.templateId &&
    template.name === receipt.name &&
    template.imageName === receipt.imageName
  );
}

export function selectReceiptForTemplate(template) {
  if (receiptMatchesTemplate(template, TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT)) {
    return TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT;
  }
  if (receiptMatchesTemplate(template, TIVVLEJOY_HISTORICAL_ATTEMPT_1_TEMPLATE_CREATION_RECEIPT)) {
    return TIVVLEJOY_HISTORICAL_ATTEMPT_1_TEMPLATE_CREATION_RECEIPT;
  }
  return null;
}

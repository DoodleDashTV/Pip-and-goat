/**
 * Sanitized TivvleJoy RunPod template creation receipt.
 *
 * Public identifiers and requested create-contract values only.
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

export const TRUSTED_TEMPLATE_ID = 'rc8eyeqhn2';
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

export function buildSanitizedExpectedCreatePayload() {
  return {
    category: 'NVIDIA',
    containerDiskInGb: SUGGESTED_CONTAINER_DISK_GB,
    dockerEntrypoint: [],
    dockerStartCmd: [],
    env: {},
    imageName: REQUIRED_IMAGE_NAME,
    isPublic: false,
    isServerless: false,
    name: SUGGESTED_TEMPLATE_NAME,
    ports: [],
    volumeInGb: SUGGESTED_VOLUME_IN_GB,
    volumeMountPath: '',
  };
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

export const TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT = Object.freeze({
  templateId: TRUSTED_TEMPLATE_ID,
  name: SUGGESTED_TEMPLATE_NAME,
  imageName: REQUIRED_IMAGE_NAME,
  createHttpStatus: TRUSTED_CREATE_HTTP_STATUS,
  requestedIsPublic: false,
  requestedIsServerless: false,
  requestedVolumeInGb: 0,
  requestedVolumeMountPath: '',
  requestedEnv: Object.freeze({}),
  requestedPorts: Object.freeze([]),
  requestedDockerEntrypoint: Object.freeze([]),
  requestedDockerStartCmd: Object.freeze([]),
  requestedContainerDiskInGb: SUGGESTED_CONTAINER_DISK_GB,
  requestedCategory: 'NVIDIA',
  sanitizedCreatePayloadHash: hashSanitizedCreatePayload(),
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

export function receiptIsTrusted(receipt) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return false;
  if (receiptContainsForbiddenKeys(receipt)) return false;
  if (receipt.templateId !== TRUSTED_TEMPLATE_ID) return false;
  if (receipt.name !== SUGGESTED_TEMPLATE_NAME) return false;
  if (receipt.imageName !== REQUIRED_IMAGE_NAME) return false;
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
  if (receipt.sanitizedCreatePayloadHash !== hashSanitizedCreatePayload()) return false;
  return true;
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

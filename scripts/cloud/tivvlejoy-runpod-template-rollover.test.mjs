import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  REQUIRED_IMAGE_DIGEST,
  REQUIRED_IMAGE_NAME,
  REQUIRED_RENDER_CODE_SHA256,
  REQUIRED_SOURCE_COMMIT,
  SUGGESTED_TEMPLATE_NAME,
  assessTemplateCompatibility,
} from './tivvlejoy-runpod-template-readiness.mjs';
import {
  HISTORICAL_ATTEMPT_1_IMAGE_NAME,
  HISTORICAL_ATTEMPT_1_TEMPLATE_ID,
  HISTORICAL_ATTEMPT_1_TEMPLATE_NAME,
  TIVVLEJOY_HISTORICAL_ATTEMPT_1_TEMPLATE_CREATION_RECEIPT,
  TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT,
  TRUSTED_TEMPLATE_ID,
  buildSanitizedExpectedCreatePayload,
  hashSanitizedCreatePayload,
  receiptContainsForbiddenKeys,
  receiptIsTrusted,
  receiptIsTrustedCurrent,
  receiptIsTrustedHistoricalAttempt1,
  receiptMatchesTemplate,
} from './tivvlejoy-runpod-template-creation-receipt.mjs';
import { assessTemplateCompatibilityWithProvenance } from './tivvlejoy-runpod-template-normalization.mjs';
import {
  CREATE_MODE,
  HISTORICAL_CREATE_PHRASE,
  REQUIRED_CREATE_PHRASE,
  buildCreateTemplatePayload,
  createTemplateGuarded,
  evaluateCreateGate,
  validateCreateTemplatePayload,
} from './tivvlejoy-runpod-template-create.mjs';
import {
  APPROVED_TEMPLATE_BINDING,
  APPROVED_TEMPLATE_ID,
  APPROVED_TEMPLATE_NAME,
  PAID_GPU_ENABLED,
  PAID_SMOKE_ATTEMPT_1_TEMPLATE_BINDING,
  POD_CREATION_ENABLED,
  resolveApprovedTemplateBinding,
} from './tivvlejoy-runpod-template-binding.mjs';
import {
  APPROVED_LAUNCH_INTENT_SHA256,
  PAID_GPU_ENABLED as LIFECYCLE_PAID_GPU_ENABLED,
  PAID_SMOKE_ATTEMPT_1_LAUNCH_INTENT_SHA256,
  POD_CREATION_ENABLED as LIFECYCLE_POD_CREATION_ENABLED,
} from './tivvlejoy-runpod-lifecycle.mjs';
import {
  PAID_GPU_ENABLED as SMOKE_PAID_GPU_ENABLED,
  POD_CREATION_ENABLED as SMOKE_POD_CREATION_ENABLED,
  REAL_NETWORK_MUTATION_ENABLED,
} from './tivvlejoy-runpod-one-pod-paid-smoke.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const common = readFileSync(path.join(repoRoot, 'scripts/cloud/acceptance-1080p/common.ts'), 'utf8');
const createSource = readFileSync(path.join(repoRoot, 'scripts/cloud/tivvlejoy-runpod-template-create.mjs'), 'utf8');

const FAKE_KEY = 'FAKE_RUNPOD_KEY_do_not_log';

function currentTemplate(overrides = {}) {
  return {
    id: TRUSTED_TEMPLATE_ID,
    name: SUGGESTED_TEMPLATE_NAME,
    imageName: REQUIRED_IMAGE_NAME,
    category: 'NVIDIA',
    isServerless: false,
    isPublic: false,
    dockerEntrypoint: [],
    dockerStartCmd: [],
    ports: [],
    env: {},
    containerDiskInGb: 50,
    volumeInGb: 0,
    volumeMountPath: '',
    ...overrides,
  };
}

function historicalTemplate(overrides = {}) {
  return {
    id: HISTORICAL_ATTEMPT_1_TEMPLATE_ID,
    name: HISTORICAL_ATTEMPT_1_TEMPLATE_NAME,
    imageName: HISTORICAL_ATTEMPT_1_IMAGE_NAME,
    category: 'NVIDIA',
    containerDiskInGb: 50,
    volumeMountPath: '/workspace',
    startSsh: true,
    startJupyter: true,
    ...overrides,
  };
}

function jsonResponse(status, body) {
  return {
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

describe('TivvleJoy worker template rollover', () => {
  it('1. pins the current required image to b53fcbf5', () => {
    assert.equal(REQUIRED_IMAGE_DIGEST, 'sha256:b53fcbf5fc973ad8e1e5f1e240f58d12885143e11494a3871f579c6fb351faed');
    assert.equal(REQUIRED_IMAGE_NAME.includes('b53fcbf5fc973ad8e1e5f1e240f58d12885143e11494a3871f579c6fb351faed'), true);
    assert.equal(REQUIRED_SOURCE_COMMIT, '1ea2cf58c9cfc015929d0a4ca63446898d59ba79');
    assert.equal(REQUIRED_RENDER_CODE_SHA256, '52dc742a3aee4cd7c1f141dcdfd45b9c81d6c073b205c3f8eda915adb9505ab5');
    assert.equal(SUGGESTED_TEMPLATE_NAME, 'TivvleJoy Blender Worker - b53fcbf5');
    assert.equal(common.includes(REQUIRED_IMAGE_DIGEST.replace('sha256:', '')), true);
  });

  it('2-3. keeps d791981a and rc8eyeqhn2 historical only', () => {
    assert.equal(HISTORICAL_ATTEMPT_1_TEMPLATE_ID, 'rc8eyeqhn2');
    assert.equal(HISTORICAL_ATTEMPT_1_IMAGE_NAME.includes('d791981a4ed530214dcf96cb76593ad6e849c9e408672df36db102a52cdc1b25'), true);
    assert.equal(REQUIRED_IMAGE_NAME.includes('d791981a4ed530214dcf96cb76593ad6e849c9e408672df36db102a52cdc1b25'), false);
    assert.equal(TRUSTED_TEMPLATE_ID !== 'rc8eyeqhn2', true);
    assert.equal(APPROVED_TEMPLATE_ID !== 'rc8eyeqhn2', true);
    assert.equal(assessTemplateCompatibility(historicalTemplate()).compatible, false);
    assert.equal(assessTemplateCompatibility(historicalTemplate()).reasons.includes('HISTORICAL_IMAGE_DIGEST'), true);
    assert.equal(PAID_SMOKE_ATTEMPT_1_TEMPLATE_BINDING.templateId, 'rc8eyeqhn2');
    assert.equal(PAID_SMOKE_ATTEMPT_1_TEMPLATE_BINDING.provenance, 'HISTORICAL_PAID_SMOKE_ATTEMPT_1');
  });

  it('4-6. isolates historical and current receipts', () => {
    assert.equal(receiptIsTrustedHistoricalAttempt1(TIVVLEJOY_HISTORICAL_ATTEMPT_1_TEMPLATE_CREATION_RECEIPT), true);
    assert.equal(receiptIsTrusted(TIVVLEJOY_HISTORICAL_ATTEMPT_1_TEMPLATE_CREATION_RECEIPT), true);
    assert.equal(receiptMatchesTemplate(historicalTemplate(), TIVVLEJOY_HISTORICAL_ATTEMPT_1_TEMPLATE_CREATION_RECEIPT), true);
    assert.equal(receiptIsTrustedCurrent(TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT), true);
    assert.equal(receiptMatchesTemplate(currentTemplate(), TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT), true);
    assert.equal(receiptMatchesTemplate(historicalTemplate(), TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT), false);
    assert.equal(receiptMatchesTemplate(currentTemplate(), TIVVLEJOY_HISTORICAL_ATTEMPT_1_TEMPLATE_CREATION_RECEIPT), false);
    assert.equal(
      assessTemplateCompatibilityWithProvenance(historicalTemplate(), {
        receipt: TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT,
      }).compatible,
      false,
    );
    assert.equal(
      assessTemplateCompatibilityWithProvenance(currentTemplate({ isPublic: undefined }), {
        receipt: TIVVLEJOY_HISTORICAL_ATTEMPT_1_TEMPLATE_CREATION_RECEIPT,
      }).normalizationApplied,
      false,
    );
  });

  it('7-8. accepts only CREATE_TIVVLEJOY_TEMPLATE_B53FCBF5', () => {
    assert.equal(REQUIRED_CREATE_PHRASE, 'CREATE_TIVVLEJOY_TEMPLATE_B53FCBF5');
    assert.equal(evaluateCreateGate({ mode: CREATE_MODE, phrase: REQUIRED_CREATE_PHRASE }).ok, true);
    assert.equal(evaluateCreateGate({ mode: CREATE_MODE, phrase: HISTORICAL_CREATE_PHRASE }).ok, false);
  });

  it('9-11. posts at most once and never retries an ambiguous create', async () => {
    const created = currentTemplate({ id: 'tplnew001' });
    let posts = 0;
    const createdOnce = await createTemplateGuarded({
      mode: CREATE_MODE,
      phrase: REQUIRED_CREATE_PHRASE,
      env: { RUNPOD_API_KEY: FAKE_KEY },
      fetchFn: async (url, opts = {}) => {
        const method = String(opts.method || 'GET').toUpperCase();
        if (method === 'POST') {
          posts += 1;
          return jsonResponse(201, created);
        }
        if (String(url).includes(created.id)) return jsonResponse(200, created);
        return jsonResponse(200, posts === 0 ? [historicalTemplate()] : [historicalTemplate(), created]);
      },
    });
    assert.equal(createdOnce.code, 'CREATED');
    assert.equal(posts, 1);

    const already = await createTemplateGuarded({
      mode: CREATE_MODE,
      phrase: REQUIRED_CREATE_PHRASE,
      env: { RUNPOD_API_KEY: FAKE_KEY },
      fetchFn: async (url, opts = {}) => {
        assert.notEqual(String(opts.method || 'GET').toUpperCase(), 'POST');
        return jsonResponse(200, [created]);
      },
    });
    assert.equal(already.code, 'ALREADY_READY');
    assert.equal(already.postCount, 0);

    let uncertainPosts = 0;
    const uncertain = await createTemplateGuarded({
      mode: CREATE_MODE,
      phrase: REQUIRED_CREATE_PHRASE,
      env: { RUNPOD_API_KEY: FAKE_KEY },
      fetchFn: async (url, opts = {}) => {
        if (String(opts.method || 'GET').toUpperCase() === 'POST') {
          uncertainPosts += 1;
          return jsonResponse(503, { error: 'upstream' });
        }
        return jsonResponse(200, []);
      },
    });
    assert.equal(uncertain.recoveryRequired, true);
    assert.equal(uncertainPosts, 1);
    assert.equal(uncertain.postCount, 1);
  });

  it('12-17. keeps the current create contract private, empty, and non-persistent', () => {
    const payload = buildCreateTemplatePayload();
    assert.equal(validateCreateTemplatePayload(payload).ok, true);
    assert.equal(payload.isPublic, false);
    assert.equal(payload.isServerless, false);
    assert.deepEqual(payload.env, {});
    assert.deepEqual(payload.ports, []);
    assert.deepEqual(payload.dockerEntrypoint, []);
    assert.deepEqual(payload.dockerStartCmd, []);
    assert.equal(payload.volumeInGb, 0);
    assert.equal(payload.volumeMountPath, '');
    assert.equal(payload.category, 'NVIDIA');
    assert.equal(validateCreateTemplatePayload({ ...payload, isPublic: true }).reasons.includes('PUBLIC'), true);
    assert.equal(validateCreateTemplatePayload({ ...payload, isServerless: true }).reasons.includes('SERVERLESS'), true);
    assert.equal(
      validateCreateTemplatePayload({
        ...payload,
        imageName: REQUIRED_IMAGE_NAME.replace(/@sha256:[0-9a-f]{64}$/, ':latest'),
      }).reasons.includes('MUTABLE_IMAGE_TAG'),
      true,
    );
    assert.equal(validateCreateTemplatePayload({ ...payload, category: 'CPU' }).reasons.includes('CATEGORY_NOT_NVIDIA'), true);
  });

  it('18-21. binds only the current template and launch identity', () => {
    const bound = resolveApprovedTemplateBinding({
      templateId: APPROVED_TEMPLATE_ID,
      env: { RUNPOD_RENDER_TEMPLATE_ID: APPROVED_TEMPLATE_ID },
    });
    assert.equal(bound.ok, true);
    assert.equal(bound.templateId, TRUSTED_TEMPLATE_ID);
    assert.equal(APPROVED_TEMPLATE_BINDING.templateId, TRUSTED_TEMPLATE_ID);
    assert.equal(APPROVED_TEMPLATE_BINDING.imageName, REQUIRED_IMAGE_NAME);
    assert.equal(APPROVED_TEMPLATE_NAME, SUGGESTED_TEMPLATE_NAME);
    assert.equal(resolveApprovedTemplateBinding({ templateId: 'rc8eyeqhn2' }).ok, false);
    assert.equal(APPROVED_TEMPLATE_ID, '34a9iknfuc');
    assert.equal(
      APPROVED_LAUNCH_INTENT_SHA256,
      '92b252b4c725cdf127bdbc19210c398f6220b6cef14f6080ea06b5e79826367f',
    );
    assert.equal(
      PAID_SMOKE_ATTEMPT_1_LAUNCH_INTENT_SHA256,
      '71b73dd63e9432c68f2ea24a9232936f628cfd5cf5f1492ec6da1cddff1d29fc',
    );
    assert.equal(hashSanitizedCreatePayload(), TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT.sanitizedCreatePayloadHash);
    assert.equal(
      hashSanitizedCreatePayload(buildSanitizedExpectedCreatePayload()),
      TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT.sanitizedCreatePayloadHash,
    );
  });

  it('22-26. keeps launcher secrets out and paid mutation disabled', () => {
    const payload = buildCreateTemplatePayload();
    assert.equal('RUNPOD_RENDER_TEMPLATE_ID' in payload.env, false);
    assert.equal('RUNPOD_API_KEY' in payload.env, false);
    assert.equal(PAID_GPU_ENABLED, false);
    assert.equal(POD_CREATION_ENABLED, false);
    assert.equal(LIFECYCLE_PAID_GPU_ENABLED, false);
    assert.equal(LIFECYCLE_POD_CREATION_ENABLED, false);
    assert.equal(SMOKE_PAID_GPU_ENABLED, false);
    assert.equal(SMOKE_POD_CREATION_ENABLED, false);
    assert.equal(REAL_NETWORK_MUTATION_ENABLED, false);
    assert.equal(receiptContainsForbiddenKeys(TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT), false);
    assert.equal(receiptContainsForbiddenKeys(TIVVLEJOY_HISTORICAL_ATTEMPT_1_TEMPLATE_CREATION_RECEIPT), false);
    assert.equal(createSource.includes('method: \'PATCH\''), false);
    assert.equal(createSource.includes("method: 'DELETE'"), false);
    assert.equal(JSON.stringify(TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT).includes('RUNPOD_API_KEY'), false);
  });
});

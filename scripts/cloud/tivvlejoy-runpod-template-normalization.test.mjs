import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  REQUIRED_IMAGE_NAME,
  REST_PODS_URL,
  REST_TEMPLATES_URL,
  SUGGESTED_TEMPLATE_NAME,
  assessTemplateCompatibility,
  createReadOnlyTemplateTripwire,
  formatSanitizedAudit,
} from './tivvlejoy-runpod-template-readiness.mjs';
import {
  FORBIDDEN_RECEIPT_KEYS,
  TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT,
  TRUSTED_TEMPLATE_ID,
  buildSanitizedExpectedCreatePayload,
  hashSanitizedCreatePayload,
  receiptContainsForbiddenKeys,
  receiptIsTrusted,
  receiptMatchesTemplate,
} from './tivvlejoy-runpod-template-creation-receipt.mjs';
import {
  applySemanticNormalization,
  assessServiceDefaultRisks,
  assessTemplateCompatibilityWithProvenance,
  assertNoNormalizedMutation,
  auditNormalizedTemplateReadiness,
  collectServiceDefaultObservations,
  evaluateNormalizationEligibility,
} from './tivvlejoy-runpod-template-normalization.mjs';
import {
  CREATE_MODE,
  REQUIRED_CREATE_PHRASE,
  createTemplateGuarded,
} from './tivvlejoy-runpod-template-create.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(path.join(repoRoot, '.github/workflows/tivvlejoy-runpod-template-normalization.yml'), 'utf8');
const docs = readFileSync(path.join(repoRoot, 'docs/runpod-template-normalization.md'), 'utf8');
const moduleSource = readFileSync(path.join(repoRoot, 'scripts/cloud/tivvlejoy-runpod-template-normalization.mjs'), 'utf8');
const receiptSource = readFileSync(path.join(repoRoot, 'scripts/cloud/tivvlejoy-runpod-template-creation-receipt.mjs'), 'utf8');

const FAKE_API_KEY = 'FAKE_RUNPOD_KEY_value_do_not_log';
const FAKE_R2_SECRET = 'FAKE_R2_SECRET_value_do_not_log';

function fullyPopulatedTemplate(overrides = {}) {
  return {
    id: 'tplcompat01',
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

function runpodNormalizedShape(overrides = {}) {
  return {
    category: 'NVIDIA',
    containerDiskInGb: 50,
    containerRegistryAuthId: '',
    id: TRUSTED_TEMPLATE_ID,
    imageName: REQUIRED_IMAGE_NAME,
    name: SUGGESTED_TEMPLATE_NAME,
    readme: 'TivvleJoy single-shot Blender 4.2.3 RunPod worker.',
    startJupyter: true,
    startSsh: true,
    volumeMountPath: '/workspace',
    ...overrides,
  };
}

function jsonResponse(status, body) {
  return {
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

describe('A. fully populated compatible response', () => {
  it('passes without needing provenance', () => {
    const result = assessTemplateCompatibilityWithProvenance(fullyPopulatedTemplate());
    assert.equal(result.compatible, true);
    assert.deepEqual(result.reasons, []);
    assert.equal(result.provenanceMatched, false);
    assert.equal(result.normalizationApplied, false);
    assert.equal(assessTemplateCompatibility(fullyPopulatedTemplate()).compatible, true);
  });
});

describe('B. real RunPod-normalized shape for rc8eyeqhn2', () => {
  it('passes only with the trusted creation receipt', () => {
    const result = assessTemplateCompatibilityWithProvenance(runpodNormalizedShape());
    assert.equal(result.compatible, true);
    assert.equal(result.provenanceMatched, true);
    assert.equal(result.normalizationApplied, true);
    assert.equal(result.summary.isPublic, false);
    assert.equal(result.summary.isServerless, false);
    assert.equal(result.summary.volumeInGb, 0);
    assert.equal(result.summary.volumeMountPath, '/workspace');
    assert.equal(result.summary.persistentVolumeRequired, false);
    assert.deepEqual(result.summary.ports, []);
    assert.deepEqual(result.summary.dockerEntrypoint, []);
    assert.deepEqual(result.summary.dockerStartCmd, []);
    assert.deepEqual(result.summary.envKeyNames, []);
    assert.equal(result.summary.startSsh, true);
    assert.equal(result.summary.startJupyter, true);
    assert.equal(
      result.observations.some((item) => item.field === 'startSsh' && item.source === 'runpod-default'),
      true,
    );
    assert.equal(
      result.observations.some((item) => item.field === 'startJupyter' && item.source === 'runpod-default'),
      true,
    );
  });
});

describe('C. missing fields without trusted provenance', () => {
  it('fails closed and does not treat missing booleans as false', () => {
    const raw = runpodNormalizedShape({ id: 'other-template' });
    const strict = assessTemplateCompatibility(raw);
    const semantic = assessTemplateCompatibilityWithProvenance(raw);
    assert.equal(strict.compatible, false);
    assert.equal(strict.reasons.includes('PUBLIC'), true);
    assert.equal(strict.reasons.includes('SERVERLESS'), true);
    assert.equal(semantic.compatible, false);
    assert.equal(semantic.reasons.includes('PUBLIC'), true);
    assert.equal(semantic.reasons.includes('SERVERLESS'), true);
    assert.equal(semantic.reasons.includes('PROVENANCE_REQUIRED'), true);
    assert.equal(semantic.reasons.includes('VOLUME_UNPROVEN'), true);
    assert.equal(semantic.normalizationApplied, false);
    assert.equal(semantic.provenanceMatched, false);
  });
});

describe('D. missing fields with matching trusted provenance', () => {
  it('normalizes the omitted contract fields and passes', () => {
    const eligibility = evaluateNormalizationEligibility(runpodNormalizedShape());
    assert.equal(eligibility.eligible, true);
    const applied = applySemanticNormalization(runpodNormalizedShape(), TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT);
    assert.equal(applied.template.isPublic, false);
    assert.equal(applied.template.isServerless, false);
    assert.equal(applied.template.volumeInGb, 0);
    const result = assessTemplateCompatibilityWithProvenance(runpodNormalizedShape());
    assert.equal(result.compatible, true);
    assert.equal(result.reasons.includes('PUBLIC'), false);
    assert.equal(result.reasons.includes('SERVERLESS'), false);
  });
});

describe('E. explicit isPublic=true', () => {
  it('fails even when the receipt identity matches', () => {
    const result = assessTemplateCompatibilityWithProvenance(
      runpodNormalizedShape({ isPublic: true, isServerless: false, volumeInGb: 0 }),
    );
    assert.equal(result.compatible, false);
    assert.equal(result.reasons.includes('PUBLIC'), true);
  });
});

describe('F. explicit isServerless=true', () => {
  it('fails even when the receipt identity matches', () => {
    const result = assessTemplateCompatibilityWithProvenance(
      runpodNormalizedShape({ isPublic: false, isServerless: true, volumeInGb: 0 }),
    );
    assert.equal(result.compatible, false);
    assert.equal(result.reasons.includes('SERVERLESS'), true);
  });
});

describe('G. wrong image', () => {
  it('fails for a different digest', () => {
    const imageName = REQUIRED_IMAGE_NAME.replace(/sha256:[0-9a-f]{64}/, `sha256:${'a'.repeat(64)}`);
    const result = assessTemplateCompatibilityWithProvenance(runpodNormalizedShape({ imageName }));
    assert.equal(result.compatible, false);
    assert.equal(result.reasons.includes('IMAGE_MISMATCH'), true);
    assert.equal(result.normalizationApplied, false);
  });
});

describe('H. mutable image', () => {
  it('fails for a mutable tag', () => {
    const imageName = REQUIRED_IMAGE_NAME.replace(/@sha256:[0-9a-f]{64}$/, ':latest');
    const result = assessTemplateCompatibilityWithProvenance(fullyPopulatedTemplate({ imageName }));
    assert.equal(result.compatible, false);
    assert.equal(result.reasons.includes('MUTABLE_IMAGE_TAG'), true);
  });
});

describe('I. non-empty ports', () => {
  it('fails and does not normalize', () => {
    const result = assessTemplateCompatibilityWithProvenance(
      runpodNormalizedShape({ ports: ['3000/http'], isPublic: false, isServerless: false, volumeInGb: 0 }),
    );
    assert.equal(result.compatible, false);
    assert.equal(result.reasons.includes('PORTS_PRESENT'), true);
    assert.equal(result.normalizationApplied, false);
  });
});

describe('J. forbidden ports', () => {
  it('fails SSH, Jupyter, and web UI ports', () => {
    for (const port of ['22/tcp', '8888/http', '8080/http']) {
      const result = assessTemplateCompatibilityWithProvenance(
        fullyPopulatedTemplate({ ports: [port], startSsh: port === '22/tcp', startJupyter: port === '8888/http' }),
      );
      assert.equal(result.compatible, false, port);
      assert.equal(result.reasons.includes('FORBIDDEN_PORT'), true, port);
    }
  });
});

describe('K. non-empty env', () => {
  it('fails for unexpected template env', () => {
    const result = assessTemplateCompatibilityWithProvenance(
      runpodNormalizedShape({ env: { RENDER_NOTE: 'no' }, isPublic: false, isServerless: false, volumeInGb: 0 }),
    );
    assert.equal(result.compatible, false);
    assert.equal(result.reasons.includes('TEMPLATE_ENV_PRESENT'), true);
  });
});

describe('L. forbidden secret env key', () => {
  it('fails and never echoes the secret', () => {
    const result = assessTemplateCompatibilityWithProvenance(
      fullyPopulatedTemplate({
        env: { RUNPOD_API_KEY: FAKE_API_KEY, R2_SECRET_ACCESS_KEY: FAKE_R2_SECRET },
      }),
    );
    assert.equal(result.compatible, false);
    assert.equal(result.reasons.includes('FORBIDDEN_TEMPLATE_ENV'), true);
    assert.equal(JSON.stringify(result).includes(FAKE_API_KEY), false);
    assert.equal(JSON.stringify(result).includes(FAKE_R2_SECRET), false);
    assert.equal(formatSanitizedAudit({ summaries: [result.summary], observations: result.observations }).includes(FAKE_R2_SECRET), false);
  });
});

describe('M. startSsh/startJupyter observations without exposure', () => {
  it('records RunPod defaults and does not mark them unsafe', () => {
    const result = assessTemplateCompatibilityWithProvenance(runpodNormalizedShape());
    assert.equal(result.compatible, true);
    assert.equal(result.reasons.includes('START_SSH_EXPOSED'), false);
    assert.equal(result.reasons.includes('START_JUPYTER_EXPOSED'), false);
    const observed = collectServiceDefaultObservations(runpodNormalizedShape());
    assert.equal(observed.length, 2);
    assert.equal(JSON.stringify(result.summary).includes('startSsh'), true);
    assert.equal(JSON.stringify(result.summary).includes('startJupyter'), true);
  });
});

describe('N. startSsh/startJupyter with exposed startup configuration', () => {
  it('fails when defaults are combined with ports or start commands', () => {
    const sshPort = assessTemplateCompatibilityWithProvenance(
      fullyPopulatedTemplate({ startSsh: true, ports: ['22/tcp'] }),
    );
    assert.equal(sshPort.reasons.includes('START_SSH_EXPOSED'), true);
    assert.equal(sshPort.compatible, false);

    const jupyterPort = assessTemplateCompatibilityWithProvenance(
      fullyPopulatedTemplate({ startJupyter: true, ports: ['8888/http'] }),
    );
    assert.equal(jupyterPort.reasons.includes('START_JUPYTER_EXPOSED'), true);
    assert.equal(jupyterPort.compatible, false);

    const sshCmd = assessTemplateCompatibilityWithProvenance(
      fullyPopulatedTemplate({ startSsh: true, dockerStartCmd: ['sshd', '-D'] }),
    );
    assert.equal(sshCmd.reasons.includes('START_SSH_COMMAND'), true);
    assert.equal(sshCmd.compatible, false);

    const jupyterCmd = assessTemplateCompatibilityWithProvenance(
      fullyPopulatedTemplate({ startJupyter: true, dockerStartCmd: ['jupyter', 'notebook'] }),
    );
    assert.equal(jupyterCmd.reasons.includes('START_JUPYTER_COMMAND'), true);
    assert.equal(jupyterCmd.compatible, false);
    assert.equal(assessServiceDefaultRisks(fullyPopulatedTemplate({ startSsh: true })).length, 0);
  });
});

describe('O. volumeInGb absent + /workspace + trusted volumeInGb=0', () => {
  it('normalizes to no persistent volume', () => {
    const result = assessTemplateCompatibilityWithProvenance(runpodNormalizedShape());
    assert.equal(result.compatible, true);
    assert.equal(result.summary.volumeInGb, 0);
    assert.equal(result.summary.volumeMountPath, '/workspace');
    assert.equal(result.summary.persistentVolumeRequired, false);
    assert.equal(result.reasons.includes('PERSISTENT_VOLUME'), false);
    assert.equal(result.reasons.includes('VOLUME_UNPROVEN'), false);
  });
});

describe('P. volumeInGb absent without provenance', () => {
  it('fails closed as unproven', () => {
    const result = assessTemplateCompatibilityWithProvenance(runpodNormalizedShape({ id: 'no-receipt' }));
    assert.equal(result.compatible, false);
    assert.equal(result.reasons.includes('VOLUME_UNPROVEN'), true);
  });
});

describe('Q. duplicate intended identities', () => {
  it('fails the list audit instead of guessing', async () => {
    const result = await auditNormalizedTemplateReadiness({
      env: { RUNPOD_API_KEY: FAKE_API_KEY },
      fetchFn: async (url) => {
        if (String(url).endsWith(`/${TRUSTED_TEMPLATE_ID}`)) return jsonResponse(200, runpodNormalizedShape());
        return jsonResponse(200, [runpodNormalizedShape(), runpodNormalizedShape({ id: 'duplicate-id' })]);
      },
    });
    assert.equal(result.code, 'AMBIGUOUS_TEMPLATE_MATCH');
    assert.equal(result.ok, false);
  });
});

describe('R. malformed response', () => {
  it('fails the assessor and the live-shaped audit', async () => {
    assert.equal(assessTemplateCompatibilityWithProvenance(null).reasons.includes('MALFORMED_TEMPLATE'), true);
    assert.equal(assessTemplateCompatibilityWithProvenance([]).reasons.includes('MALFORMED_TEMPLATE'), true);
    const result = await auditNormalizedTemplateReadiness({
      env: { RUNPOD_API_KEY: FAKE_API_KEY },
      fetchFn: async () => jsonResponse(200, 'not-json'),
    });
    assert.equal(result.code, 'API_ERROR');
    assert.equal(result.reasons.includes('MALFORMED_RESPONSE'), true);
  });
});

describe('S. mutation tripwire remains intact', () => {
  it('refuses POST/PATCH/DELETE and keeps create-from-normalized-shape at zero POST', async () => {
    const recorder = { attempts: [] };
    const fetchFn = createReadOnlyTemplateTripwire(recorder);
    await assert.rejects(() => fetchFn(REST_TEMPLATES_URL, { method: 'POST' }), (error) => error.code === 'TEMPLATE_MUTATION_TRIPWIRE');
    await assert.rejects(() => fetchFn(`${REST_TEMPLATES_URL}/${TRUSTED_TEMPLATE_ID}`, { method: 'PATCH' }), (error) => error.code === 'TEMPLATE_MUTATION_TRIPWIRE');
    await assert.rejects(() => fetchFn(`${REST_TEMPLATES_URL}/${TRUSTED_TEMPLATE_ID}`, { method: 'DELETE' }), (error) => error.code === 'TEMPLATE_MUTATION_TRIPWIRE');
    await assert.rejects(() => fetchFn(REST_PODS_URL, { method: 'POST' }), (error) => error.code === 'TEMPLATE_MUTATION_TRIPWIRE');
    assert.throws(() => assertNoNormalizedMutation(recorder), (error) => error.code === 'TEMPLATE_MUTATION_TRIPWIRE');

    const createRecorder = { attempts: [] };
    const created = await createTemplateGuarded({
      mode: CREATE_MODE,
      phrase: REQUIRED_CREATE_PHRASE,
      env: { RUNPOD_API_KEY: FAKE_API_KEY },
      mutationRecorder: createRecorder,
      fetchFn: async (url, opts = {}) => {
        assert.notEqual(String(opts.method || 'GET').toUpperCase(), 'POST');
        return jsonResponse(200, [runpodNormalizedShape()]);
      },
    });
    assert.equal(created.code, 'ALREADY_READY');
    assert.equal(created.postCount, 0);
    assert.equal(created.templateId, TRUSTED_TEMPLATE_ID);
    assert.equal(createRecorder.attempts.some((attempt) => attempt.method === 'POST'), false);
  });
});

describe('receipt provenance is sanitized and deterministic', () => {
  it('contains only public create-contract fields', () => {
    assert.equal(receiptIsTrusted(TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT), true);
    assert.equal(TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT.templateId, 'rc8eyeqhn2');
    assert.equal(TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT.createHttpStatus, 201);
    assert.equal(TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT.requestedIsPublic, false);
    assert.equal(TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT.requestedIsServerless, false);
    assert.equal(TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT.requestedVolumeInGb, 0);
    assert.equal(TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT.requestedVolumeMountPath, '');
    assert.equal(TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT.sanitizedCreatePayloadHash, hashSanitizedCreatePayload());
    assert.equal(receiptContainsForbiddenKeys(TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT), false);
    assert.equal(JSON.stringify(TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT).includes('RUNPOD_API_KEY'), false);
    assert.equal(JSON.stringify(buildSanitizedExpectedCreatePayload()).includes('Authorization'), false);
    assert.equal(receiptSource.includes('FORBIDDEN_RECEIPT_KEYS'), true);
    for (const key of FORBIDDEN_RECEIPT_KEYS) {
      assert.equal(JSON.stringify(TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT).includes(`${key}=`), false);
    }
    assert.equal(receiptMatchesTemplate(runpodNormalizedShape()), true);
    assert.equal(receiptMatchesTemplate(runpodNormalizedShape({ id: 'nope' })), false);
    assert.equal(receiptIsTrusted({ ...TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT, requestedIsPublic: true }), false);
  });
});

describe('normalized live audit path', () => {
  it('classifies the trusted template TEMPLATE_READY after list + detail GET', async () => {
    const recorder = { attempts: [] };
    const result = await auditNormalizedTemplateReadiness({
      env: { RUNPOD_API_KEY: FAKE_API_KEY },
      mutationRecorder: recorder,
      fetchFn: async (url, opts = {}) => {
        assert.equal(String(opts.method || 'GET').toUpperCase(), 'GET');
        if (String(url).endsWith(`/${TRUSTED_TEMPLATE_ID}`)) return jsonResponse(200, runpodNormalizedShape());
        return jsonResponse(200, [runpodNormalizedShape()]);
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.code, 'TEMPLATE_READY');
    assert.equal(result.compatibleCount, 1);
    assert.equal(result.summaries[0].templateId, TRUSTED_TEMPLATE_ID);
    assert.equal(result.getCount, 2);
    assert.equal(result.postCount, 0);
    assert.equal(result.patchCount, 0);
    assert.equal(result.deleteCount, 0);
    assert.equal(result.podCreated, false);
    assert.equal(result.gpuLaunched, false);
    assert.deepEqual(
      recorder.attempts.map((attempt) => `${attempt.method} ${attempt.url}`),
      ['GET https://rest.runpod.io/v1/templates', `GET https://rest.runpod.io/v1/templates/${TRUSTED_TEMPLATE_ID}`],
    );
  });
});

describe('workflow and docs stay read-only', () => {
  it('is branch-scoped, contents:read only, and never mutates', () => {
    assert.match(
      workflow,
      /^on:\n  push:\n    branches:\n      - cursor\/tivvlejoy-runpod-template-normalization-73f1\n/m,
    );
    assert.match(workflow, /permissions:\n  contents: read\n/);
    assert.doesNotMatch(workflow, /packages: write/);
    assert.doesNotMatch(workflow, /workflow_dispatch/);
    assert.equal(workflow.includes('RUNPOD_API_KEY: ${{ secrets.RUNPOD_API_KEY }}'), true);
    assert.equal(workflow.includes('RUNPOD_RENDER_TEMPLATE_ID'), false);
    assert.equal(workflow.includes('create-template'), false);
    assert.equal(workflow.includes('/v1/pods'), false);
    assert.equal(workflow.includes('echo "${RUNPOD_API_KEY}"'), false);
    assert.equal(moduleSource.includes("method: 'POST'"), false);
    assert.equal(moduleSource.includes("method: 'PATCH'"), false);
    assert.equal(moduleSource.includes("method: 'DELETE'"), false);
  });

  it('documents the narrow provenance rules', () => {
    assert.match(docs, /rc8eyeqhn2/);
    assert.match(docs, /trusted creation receipt/);
    assert.match(docs, /Do not treat missing booleans as false globally/);
    assert.match(docs, /startSsh/);
    assert.match(docs, /TEMPLATE_READY/);
    assert.match(docs, /GET \/v1\/templates/);
    assert.equal(docs.includes('Do not POST /v1/templates'), true);
    assert.equal(docs.includes('Do not PATCH'), true);
  });
});

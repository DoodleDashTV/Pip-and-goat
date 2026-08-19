import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DESIRED_TEMPLATE_PLAN,
  FORBIDDEN_TEMPLATE_ENV_KEYS,
  GRAPHQL_URL,
  PERSISTENT_VOLUME_REQUIRED,
  REQUIRED_BLENDER_VERSION,
  REQUIRED_DOCKERFILE_CMD,
  REQUIRED_IMAGE_DIGEST,
  REQUIRED_IMAGE_NAME,
  REQUIRED_RENDER_ASSET_SHA256,
  REQUIRED_RENDER_CODE_SHA256,
  REQUIRED_SOURCE_COMMIT,
  REST_PODS_URL,
  REST_TEMPLATES_URL,
  assessTemplateCompatibility,
  assertNoTemplateMutation,
  auditTemplateReadiness,
  createReadOnlyTemplateTripwire,
  dockerfileCmdIsAuthoritative,
  envKeyNames,
  formatSanitizedAudit,
  isAllowedTemplateRead,
  isForbiddenRunpodMutation,
  redactSecrets,
  sanitizeTemplateSummary,
} from './tivvlejoy-runpod-template-readiness.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(path.join(repoRoot, '.github/workflows/tivvlejoy-runpod-template-readiness.yml'), 'utf8');
const docs = readFileSync(path.join(repoRoot, 'docs/runpod-template-readiness.md'), 'utf8');
const moduleSource = readFileSync(path.join(repoRoot, 'scripts/cloud/tivvlejoy-runpod-template-readiness.mjs'), 'utf8');
const common = readFileSync(path.join(repoRoot, 'scripts/cloud/acceptance-1080p/common.ts'), 'utf8');
const dockerfile = readFileSync(path.join(repoRoot, 'workers/runpod-blender/Dockerfile'), 'utf8');

const FAKE_R2_SECRET = 'FAKE_R2_SECRET_value_do_not_log';
const FAKE_API_KEY = 'FAKE_RUNPOD_KEY_value_do_not_log';

function compatibleTemplate(overrides = {}) {
  return {
    id: 'tplcompat01',
    name: 'TivvleJoy Blender Worker - b53fcbf5',
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

function jsonResponse(status, body) {
  return {
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

describe('authoritative image and Dockerfile contracts', () => {
  it('pins the verified immutable digest and matching provenance', () => {
    assert.equal(common.includes(REQUIRED_IMAGE_DIGEST), true);
    assert.equal(common.includes(REQUIRED_SOURCE_COMMIT), true);
    assert.equal(common.includes(REQUIRED_RENDER_CODE_SHA256), true);
    assert.equal(common.includes(REQUIRED_RENDER_ASSET_SHA256), true);
    assert.equal(REQUIRED_BLENDER_VERSION, '4.2.3');
    assert.deepEqual([...REQUIRED_DOCKERFILE_CMD], ['node', './src/worker.js']);
    assert.equal(dockerfile.includes('CMD ["node", "./src/worker.js"]'), true);
    assert.equal(dockerfileCmdIsAuthoritative(repoRoot), true);
    assert.equal(REQUIRED_IMAGE_NAME.includes(':latest'), false);
    assert.equal(REQUIRED_IMAGE_NAME.includes(':production'), false);
    assert.equal(REQUIRED_IMAGE_NAME.includes(':stable'), false);
    assert.equal(REQUIRED_IMAGE_NAME.includes('8204d4bf'), false);
  });
});

describe('compatibility contract', () => {
  it('accepts a compatible private NVIDIA Pod template', () => {
    const result = assessTemplateCompatibility(compatibleTemplate());
    assert.equal(result.compatible, true);
    assert.deepEqual(result.reasons, []);
    assert.equal(result.summary.envKeyCount, 0);
    assert.deepEqual(result.summary.ports, []);
    assert.deepEqual(result.summary.dockerStartCmd, []);
  });

  it('refuses a wrong image digest', () => {
    const result = assessTemplateCompatibility(
      compatibleTemplate({
        imageName:
          'ghcr.io/doodledashtv/ddp-runpod-blender@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', // pragma: allowlist secret
      }),
    );
    assert.equal(result.compatible, false);
    assert.equal(result.reasons.includes('IMAGE_MISMATCH'), true);
  });

  it('refuses mutable image tags and the stale digest', () => {
    const latest = assessTemplateCompatibility(
      compatibleTemplate({ imageName: 'ghcr.io/doodledashtv/ddp-runpod-blender:latest' }), // pragma: allowlist secret
    );
    assert.equal(latest.reasons.includes('MUTABLE_IMAGE_TAG'), true);
    const stale = assessTemplateCompatibility(
      compatibleTemplate({
        imageName:
          'ghcr.io/doodledashtv/ddp-runpod-blender@sha256:8204d4bffdc2d28dee6c313fc571e6fb5e3831a3d8ff241a29a536963ec1f830', // pragma: allowlist secret
      }),
    );
    assert.equal(stale.reasons.includes('STALE_IMAGE_DIGEST'), true);
  });

  it('refuses serverless, public, and non-NVIDIA templates', () => {
    assert.equal(assessTemplateCompatibility(compatibleTemplate({ isServerless: true })).reasons.includes('SERVERLESS'), true);
    assert.equal(assessTemplateCompatibility(compatibleTemplate({ isPublic: true })).reasons.includes('PUBLIC'), true);
    assert.equal(
      assessTemplateCompatibility(compatibleTemplate({ category: 'CPU' })).reasons.includes('CATEGORY_NOT_NVIDIA'),
      true,
    );
  });

  it('refuses entrypoint and start-command overrides', () => {
    const entry = assessTemplateCompatibility(compatibleTemplate({ dockerEntrypoint: ['/bin/sh'] }));
    assert.equal(entry.reasons.includes('ENTRYPOINT_OVERRIDE'), true);
    const start = assessTemplateCompatibility(compatibleTemplate({ dockerStartCmd: ['bash', '-c', 'node ./src/worker.js'] }));
    assert.equal(start.reasons.includes('START_CMD_OVERRIDE'), true);
    assert.equal(start.reasons.includes('SHELL_WRAPPER'), true);
  });

  it('refuses ports and template env, including launcher and R2 secrets', () => {
    const ports = assessTemplateCompatibility(compatibleTemplate({ ports: ['8080/http', '22/tcp'] }));
    assert.equal(ports.reasons.includes('PORTS_PRESENT'), true);
    assert.equal(ports.reasons.includes('FORBIDDEN_PORT'), true);
    const env = assessTemplateCompatibility(
      compatibleTemplate({
        env: { RUNPOD_API_KEY: FAKE_API_KEY, R2_SECRET_ACCESS_KEY: FAKE_R2_SECRET },
      }),
    );
    assert.equal(env.reasons.includes('TEMPLATE_ENV_PRESENT'), true);
    assert.equal(env.reasons.includes('FORBIDDEN_TEMPLATE_ENV'), true);
    assert.equal(JSON.stringify(env.summary).includes(FAKE_R2_SECRET), false);
    assert.equal(JSON.stringify(env.summary).includes(FAKE_API_KEY), false);
    assert.equal(FORBIDDEN_TEMPLATE_ENV_KEYS.includes('RUNPOD_RENDER_TEMPLATE_ID'), true);
  });
});

describe('audit paths and HTTP classification', () => {
  it('does not fall back when a configured template is missing', async () => {
    const recorder = { attempts: [] };
    const result = await auditTemplateReadiness({
      env: { RUNPOD_API_KEY: FAKE_API_KEY, RUNPOD_RENDER_TEMPLATE_ID: 'missing-id' },
      mutationRecorder: recorder,
      fetchFn: async () => jsonResponse(404, { error: 'gone', secret: FAKE_R2_SECRET }),
    });
    assert.equal(result.code, 'NOT_FOUND');
    assert.equal(result.compatibleCount, 0);
    assert.equal(recorder.attempts.length, 1);
    assert.equal(recorder.attempts[0].url, `${REST_TEMPLATES_URL}/missing-id`);
    assert.equal(JSON.stringify(result).includes(FAKE_R2_SECRET), false);
  });

  it('classifies API 401/403/429/500 as API_ERROR', async () => {
    for (const status of [401, 403, 429, 500]) {
      const result = await auditTemplateReadiness({
        env: { RUNPOD_API_KEY: FAKE_API_KEY },
        fetchFn: async () => jsonResponse(status, { token: FAKE_API_KEY }),
      });
      assert.equal(result.code, 'API_ERROR', String(status));
      assert.equal(JSON.stringify(result).includes(FAKE_API_KEY), false);
    }
  });

  it('returns TEMPLATE_REQUIRED for zero compatible candidates', async () => {
    const result = await auditTemplateReadiness({
      env: { RUNPOD_API_KEY: FAKE_API_KEY },
      fetchFn: async () => jsonResponse(200, [compatibleTemplate({ imageName: 'ubuntu:latest' })]),
    });
    assert.equal(result.code, 'TEMPLATE_REQUIRED');
    assert.equal(result.desiredPlan.posted, false);
    assert.equal(result.desiredPlan.imageName, REQUIRED_IMAGE_NAME);
    assert.equal(result.desiredPlan.volumeInGb, 0);
    assert.equal(PERSISTENT_VOLUME_REQUIRED, false);
  });

  it('returns TEMPLATE_CANDIDATE_FOUND for exactly one compatible template', async () => {
    const result = await auditTemplateReadiness({
      env: { RUNPOD_API_KEY: FAKE_API_KEY },
      fetchFn: async () => jsonResponse(200, [compatibleTemplate(), compatibleTemplate({ imageName: 'other' })]),
    });
    assert.equal(result.ok, true);
    assert.equal(result.code, 'TEMPLATE_CANDIDATE_FOUND');
    assert.equal(result.compatibleCount, 1);
    assert.equal(result.summaries[0].templateId, 'tplcompat01');
  });

  it('stops on multiple compatible candidates', async () => {
    const result = await auditTemplateReadiness({
      env: { RUNPOD_API_KEY: FAKE_API_KEY },
      fetchFn: async () =>
        jsonResponse(200, [compatibleTemplate({ id: 'a' }), compatibleTemplate({ id: 'b', name: 'other' })]),
    });
    assert.equal(result.code, 'DUPLICATE_TEMPLATE_IDENTITY');
    assert.equal(result.compatibleCount, 2);
  });

  it('fails closed on a malformed list response', async () => {
    const result = await auditTemplateReadiness({
      env: { RUNPOD_API_KEY: FAKE_API_KEY },
      fetchFn: async () => jsonResponse(200, 'not-json'),
    });
    assert.equal(result.code, 'API_ERROR');
    assert.equal(result.reasons.includes('MALFORMED_RESPONSE'), true);
  });

  it('marks a configured compatible template READY and never writes the ID into env', async () => {
    const result = await auditTemplateReadiness({
      env: { RUNPOD_API_KEY: FAKE_API_KEY, RUNPOD_RENDER_TEMPLATE_ID: 'tplcompat01' },
      fetchFn: async () => jsonResponse(200, compatibleTemplate()),
    });
    assert.equal(result.code, 'READY');
    assert.equal(result.ok, true);
    assert.equal(JSON.stringify(result.summaries[0]).includes('RUNPOD_RENDER_TEMPLATE_ID='), false);
    assert.equal(envKeyNames(compatibleTemplate().env).includes('RUNPOD_RENDER_TEMPLATE_ID'), false);
  });
});

describe('redaction and mutation tripwire', () => {
  it('redacts raw secrets from text and sanitized summaries', () => {
    const dirty = `Authorization: Bearer ${FAKE_API_KEY} R2_SECRET_ACCESS_KEY=${FAKE_R2_SECRET}`;
    const cleaned = redactSecrets(dirty);
    assert.equal(cleaned.includes(FAKE_API_KEY), false);
    assert.equal(cleaned.includes(FAKE_R2_SECRET), false);
    const summary = sanitizeTemplateSummary(compatibleTemplate({ env: { R2_SECRET_ACCESS_KEY: FAKE_R2_SECRET } }));
    assert.equal(JSON.stringify(summary).includes(FAKE_R2_SECRET), false);
    assert.equal(formatSanitizedAudit({ summaries: [summary], code: 'INCOMPATIBLE' }).includes(FAKE_R2_SECRET), false);
  });

  it('refuses POST/PATCH/DELETE templates, POST pods, and GraphQL', async () => {
    const recorder = { attempts: [] };
    const fetchFn = createReadOnlyTemplateTripwire(recorder);
    await assert.rejects(() => fetchFn(REST_TEMPLATES_URL, { method: 'POST' }), (error) => {
      assert.equal(error.code, 'TEMPLATE_MUTATION_TRIPWIRE');
      return true;
    });
    await assert.rejects(() => fetchFn(`${REST_TEMPLATES_URL}/abc`, { method: 'PATCH' }), (error) => {
      assert.equal(error.code, 'TEMPLATE_MUTATION_TRIPWIRE');
      return true;
    });
    await assert.rejects(() => fetchFn(`${REST_TEMPLATES_URL}/abc`, { method: 'DELETE' }), (error) => {
      assert.equal(error.code, 'TEMPLATE_MUTATION_TRIPWIRE');
      return true;
    });
    await assert.rejects(() => fetchFn(REST_PODS_URL, { method: 'POST' }), (error) => {
      assert.equal(error.code, 'TEMPLATE_MUTATION_TRIPWIRE');
      return true;
    });
    await assert.rejects(() => fetchFn(GRAPHQL_URL, { method: 'POST' }), (error) => {
      assert.equal(error.code, 'TEMPLATE_MUTATION_TRIPWIRE');
      return true;
    });
    assert.equal(isForbiddenRunpodMutation(REST_TEMPLATES_URL, 'POST'), true);
    assert.equal(isForbiddenRunpodMutation(`${REST_TEMPLATES_URL}/abc`, 'PATCH'), true);
    assert.equal(isForbiddenRunpodMutation(`${REST_TEMPLATES_URL}/abc`, 'DELETE'), true);
    assert.equal(isForbiddenRunpodMutation(REST_PODS_URL, 'POST'), true);
    assert.equal(isAllowedTemplateRead(REST_TEMPLATES_URL, 'GET'), true);
    assert.equal(isAllowedTemplateRead(`${REST_TEMPLATES_URL}/abc`, 'GET'), true);
    assert.equal(isAllowedTemplateRead(REST_PODS_URL, 'GET'), false);
    assert.throws(() => assertNoTemplateMutation(recorder), (error) => error.code === 'TEMPLATE_MUTATION_TRIPWIRE');
  });

  it('audit path trips if the injected fetch tries POST /v1/templates', async () => {
    const recorder = { attempts: [] };
    const result = await auditTemplateReadiness({
      env: { RUNPOD_API_KEY: FAKE_API_KEY },
      mutationRecorder: recorder,
      fetchFn: async (url, opts) => {
        await createReadOnlyTemplateTripwire(recorder)(REST_TEMPLATES_URL, { method: 'POST' });
        return jsonResponse(200, []);
      },
    });
    assert.equal(result.code, 'TEMPLATE_MUTATION_TRIPWIRE');
    assert.equal(result.mutationAttempted, true);
    assert.equal(result.templateCreated, false);
    assert.equal(result.podCreated, false);
  });
});

describe('workflow and docs stay read-only', () => {
  it('is a tightly scoped push trigger with contents:read only', () => {
    assert.match(
      workflow,
      /^on:\n  push:\n    branches:\n      - cursor\/tivvlejoy-runpod-template-readiness-73f1\n/m,
    );
    assert.doesNotMatch(workflow, /workflow_dispatch/);
    assert.match(workflow, /permissions:\n  contents: read\n/);
    assert.doesNotMatch(workflow, /packages: write/);
    assert.doesNotMatch(workflow, /contents: write/);
    assert.doesNotMatch(workflow, /deployments: write/);
    assert.equal(workflow.includes('RUNPOD_API_KEY: ${{ secrets.RUNPOD_API_KEY }}'), true);
    assert.equal(workflow.includes('RUNPOD_RENDER_TEMPLATE_ID: ${{ secrets.RUNPOD_RENDER_TEMPLATE_ID }}'), true);
    assert.equal(workflow.includes('echo "${RUNPOD_API_KEY}"'), false);
    assert.equal(workflow.includes('echo "${RUNPOD_RENDER_TEMPLATE_ID}"'), false);
    assert.equal(workflow.includes('/v1/pods'), false);
    assert.equal(workflow.includes('LAUNCH_TIVVLEJOY_GPU'), false);
  });

  it('documents the read-only audit and desired non-mutating plan', () => {
    assert.match(docs, /GET \/v1\/templates/);
    assert.match(docs, /Do \*\*NOT\*\* create/);
    assert.match(docs, /TEMPLATE_REQUIRED/);
    assert.match(docs, /TivvleJoy Blender Worker - b53fcbf5/);
    assert.match(docs, /PERSISTENT_VOLUME_REQUIRED = false/);
    assert.equal(docs.includes('POST /v1/templates'), true);
    assert.match(docs, /must not POST/);
    assert.equal(DESIRED_TEMPLATE_PLAN.posted, false);
    assert.equal(moduleSource.includes('method: \'POST\''), false);
    assert.equal(moduleSource.includes("method: 'PATCH'"), false);
    assert.equal(moduleSource.includes("method: 'DELETE'"), false);
  });
});

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
} from './tivvlejoy-runpod-template-readiness.mjs';
import {
  CREATE_GRAPHQL_URL,
  CREATE_MODE,
  HISTORICAL_CREATE_PHRASE,
  REQUIRED_CREATE_PHRASE,
  TEMPLATE_README,
  buildCreateTemplatePayload,
  createTemplateGuarded,
  createTemplateMutationTripwire,
  evaluateCreateGate,
  extractTemplateId,
  isAllowedTemplateCreateRequest,
  recoverTemplateCreation,
  sanitizeTemplateCreateSummary,
  validateCreateTemplatePayload,
} from './tivvlejoy-runpod-template-create.mjs';
import { redactSecrets } from './tivvlejoy-runpod-template-readiness.mjs';
import {
  HISTORICAL_ATTEMPT_1_IMAGE_NAME,
  HISTORICAL_ATTEMPT_1_TEMPLATE_NAME,
  PAID_SMOKE_ATTEMPT_1_TEMPLATE_ID,
} from './tivvlejoy-runpod-template-creation-receipt.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(path.join(repoRoot, '.github/workflows/tivvlejoy-runpod-template-create.yml'), 'utf8');
const docs = readFileSync(path.join(repoRoot, 'docs/runpod-template-create.md'), 'utf8');
const moduleSource = readFileSync(path.join(repoRoot, 'scripts/cloud/tivvlejoy-runpod-template-create.mjs'), 'utf8');
const common = readFileSync(path.join(repoRoot, 'scripts/cloud/acceptance-1080p/common.ts'), 'utf8');

const FAKE_KEY = 'FAKE_RUNPOD_KEY_do_not_log';
const FAKE_SECRET = 'FAKE_R2_SECRET_do_not_log';

function compatibleTemplate(overrides = {}) {
  return {
    id: 'tplnew001',
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

function jsonResponse(status, body) {
  return {
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

function gated(input = {}) {
  return {
    mode: CREATE_MODE,
    phrase: REQUIRED_CREATE_PHRASE,
    env: { RUNPOD_API_KEY: FAKE_KEY },
    ...input,
  };
}

describe('create gate', () => {
  it('accepts the exact mode and phrase', () => {
    assert.equal(evaluateCreateGate({ mode: CREATE_MODE, phrase: REQUIRED_CREATE_PHRASE }).ok, true);
  });

  it('refuses the historical create phrase without posting', async () => {
    const recorder = { attempts: [] };
    const result = await createTemplateGuarded({
      mode: CREATE_MODE,
      phrase: HISTORICAL_CREATE_PHRASE,
      env: { RUNPOD_API_KEY: FAKE_KEY },
      mutationRecorder: recorder,
      fetchFn: async () => jsonResponse(201, compatibleTemplate()),
    });
    assert.equal(evaluateCreateGate({ mode: CREATE_MODE, phrase: HISTORICAL_CREATE_PHRASE }).ok, false);
    assert.equal(REQUIRED_CREATE_PHRASE, 'CREATE_TIVVLEJOY_TEMPLATE_B53FCBF5');
    assert.equal(HISTORICAL_CREATE_PHRASE, 'CREATE_TIVVLEJOY_TEMPLATE_D791981A');
    assert.equal(result.code, 'CREATE_GATE_REFUSED');
    assert.equal(result.postCount, 0);
    assert.equal(recorder.attempts.length, 0);
  });

  it('refuses a wrong or missing phrase without posting', async () => {
    for (const phrase of ['WRONG', '', undefined]) {
      const recorder = { attempts: [] };
      const result = await createTemplateGuarded({
        mode: CREATE_MODE,
        phrase,
        env: { RUNPOD_API_KEY: FAKE_KEY },
        mutationRecorder: recorder,
        fetchFn: async () => jsonResponse(201, compatibleTemplate()),
      });
      assert.equal(result.code, 'CREATE_GATE_REFUSED');
      assert.equal(result.postCount, 0);
      assert.equal(recorder.attempts.length, 0);
    }
  });
});

describe('payload validation', () => {
  it('accepts the exact intended payload', () => {
    const payload = buildCreateTemplatePayload();
    assert.equal(validateCreateTemplatePayload(payload).ok, true);
    assert.equal(payload.volumeInGb, 0);
    assert.deepEqual(payload.env, {});
    assert.equal(payload.readme, TEMPLATE_README);
    assert.equal('containerRegistryAuthId' in payload, false);
  });

  it('refuses wrong image, mutable tags, public, serverless, env, ports, and overrides', () => {
    const base = buildCreateTemplatePayload();
    assert.equal(validateCreateTemplatePayload({ ...base, imageName: 'other@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }).reasons.includes('IMAGE_MISMATCH'), true);
    assert.equal(validateCreateTemplatePayload({ ...base, imageName: 'ghcr.io/doodledashtv/ddp-runpod-blender:latest' }).reasons.includes('MUTABLE_IMAGE_TAG'), true); // pragma: allowlist secret
    assert.equal(validateCreateTemplatePayload({ ...base, isPublic: true }).reasons.includes('PUBLIC'), true);
    assert.equal(validateCreateTemplatePayload({ ...base, isServerless: true }).reasons.includes('SERVERLESS'), true);
    assert.equal(validateCreateTemplatePayload({ ...base, env: { R2_SECRET_ACCESS_KEY: FAKE_SECRET } }).reasons.includes('TEMPLATE_ENV_PRESENT'), true);
    assert.equal(validateCreateTemplatePayload({ ...base, ports: ['22/tcp'] }).reasons.includes('PORTS_PRESENT'), true);
    assert.equal(validateCreateTemplatePayload({ ...base, dockerEntrypoint: ['/bin/sh'] }).reasons.includes('ENTRYPOINT_OVERRIDE'), true);
    assert.equal(validateCreateTemplatePayload({ ...base, dockerStartCmd: ['bash', '-c', 'x'] }).reasons.includes('START_CMD_OVERRIDE'), true);
    assert.equal(validateCreateTemplatePayload({ ...base, extra: true }).reasons.includes('UNKNOWN_FIELD'), true);
  });
});

describe('idempotent pre-create decisions', () => {
  it('POSTs once when zero compatible templates exist', async () => {
    const recorder = { attempts: [] };
    let posts = 0;
    const created = compatibleTemplate();
    const result = await createTemplateGuarded({
      ...gated({ mutationRecorder: recorder }),
      fetchFn: async (url, opts = {}) => {
        const method = String(opts.method || 'GET').toUpperCase();
        if (method === 'GET' && String(url).endsWith('/templates')) {
          return jsonResponse(200, posts === 0 ? [] : [created]);
        }
        if (method === 'POST') {
          posts += 1;
          return jsonResponse(201, created);
        }
        if (String(url).includes(created.id)) return jsonResponse(200, created);
        return jsonResponse(404, {});
      },
    });
    assert.equal(result.code, 'CREATED');
    assert.equal(result.ok, true);
    assert.equal(result.postCount, 1);
    assert.equal(posts, 1);
    assert.equal(result.templateId, 'tplnew001');
    assert.equal(result.postCreateCompatibleCount, 1);
    assert.deepEqual(
      result.mutationAttempts.map((attempt) => `${attempt.method} ${attempt.path}`),
      ['GET /v1/templates', 'POST /v1/templates', 'GET /v1/templates/tplnew001', 'GET /v1/templates'],
    );
  });

  it('does not POST when one compatible template already exists', async () => {
    const recorder = { attempts: [] };
    const result = await createTemplateGuarded({
      ...gated({ mutationRecorder: recorder }),
      fetchFn: async (url, opts = {}) => {
        assert.notEqual(String(opts.method || 'GET').toUpperCase(), 'POST');
        return jsonResponse(200, [compatibleTemplate()]);
      },
    });
    assert.equal(result.code, 'ALREADY_READY');
    assert.equal(result.postCount, 0);
    assert.equal(result.templateId, 'tplnew001');
  });

  it('does not POST a second template when the intended identity already exists but is incompatible', async () => {
    const existing = compatibleTemplate({ isPublic: true });
    const recorder = { attempts: [] };
    const result = await createTemplateGuarded({
      ...gated({ mutationRecorder: recorder }),
      fetchFn: async (url, opts = {}) => {
        assert.notEqual(String(opts.method || 'GET').toUpperCase(), 'POST');
        return jsonResponse(200, [existing]);
      },
    });
    assert.equal(result.code, 'CREATED_TEMPLATE_INCOMPATIBLE');
    assert.equal(result.postCount, 0);
    assert.equal(result.templateId, 'tplnew001');
    assert.equal(recorder.attempts.some((attempt) => attempt.method === 'POST'), false);
  });

  it('does not POST when multiple compatible templates exist', async () => {
    const result = await createTemplateGuarded({
      ...gated(),
      fetchFn: async () => jsonResponse(200, [compatibleTemplate({ id: 'a' }), compatibleTemplate({ id: 'b', name: 'other' })]),
    });
    assert.equal(result.code, 'DUPLICATE_TEMPLATE_IDENTITY');
    assert.equal(result.postCount, 0);
  });

  it('does not treat historical rc8eyeqhn2 as a current-generation duplicate', async () => {
    const historical = {
      id: PAID_SMOKE_ATTEMPT_1_TEMPLATE_ID,
      name: HISTORICAL_ATTEMPT_1_TEMPLATE_NAME,
      imageName: HISTORICAL_ATTEMPT_1_IMAGE_NAME,
      category: 'NVIDIA',
      containerDiskInGb: 50,
      volumeMountPath: '/workspace',
      startSsh: true,
      startJupyter: true,
    };
    const created = compatibleTemplate();
    let posts = 0;
    const result = await createTemplateGuarded({
      ...gated(),
      fetchFn: async (url, opts = {}) => {
        const method = String(opts.method || 'GET').toUpperCase();
        if (method === 'GET' && String(url).endsWith('/templates')) {
          return jsonResponse(200, posts === 0 ? [historical] : [historical, created]);
        }
        if (method === 'POST') {
          posts += 1;
          return jsonResponse(201, created);
        }
        if (String(url).includes(created.id)) return jsonResponse(200, created);
        return jsonResponse(404, {});
      },
    });
    assert.equal(result.code, 'CREATED');
    assert.equal(result.postCount, 1);
    assert.equal(posts, 1);
    assert.equal(result.templateId, 'tplnew001');
  });
});

describe('HTTP and recovery', () => {
  it('accepts 200 and 201 creation responses', async () => {
    for (const status of [200, 201]) {
      const created = compatibleTemplate({ id: `id${status}` });
      let listed = [];
      const result = await createTemplateGuarded({
        ...gated(),
        fetchFn: async (url, opts = {}) => {
          const method = String(opts.method || 'GET').toUpperCase();
          if (method === 'POST') {
            listed = [created];
            return jsonResponse(status, created);
          }
          if (String(url).includes(created.id)) return jsonResponse(200, created);
          return jsonResponse(200, listed);
        },
      });
      assert.equal(result.code, 'CREATED', String(status));
      assert.equal(result.httpStatus, status);
    }
  });

  it('recovers or stops on malformed success, missing ID, and uncertain statuses', async () => {
    const created = compatibleTemplate();
    const missingId = await createTemplateGuarded({
      ...gated(),
      fetchFn: async (url, opts = {}) => {
        const method = String(opts.method || 'GET').toUpperCase();
        if (method === 'POST') return jsonResponse(201, { name: created.name });
        return jsonResponse(200, []);
      },
    });
    assert.equal(missingId.code, 'TEMPLATE_CREATE_UNCERTAIN');
    assert.equal(missingId.recoveryRequired, true);
    assert.equal(missingId.postCount, 1);

    let recoveredPosts = 0;
    const recovered = await createTemplateGuarded({
      ...gated(),
      fetchFn: async (url, opts = {}) => {
        const method = String(opts.method || 'GET').toUpperCase();
        if (method === 'POST') {
          recoveredPosts += 1;
          return jsonResponse(503, { error: 'upstream', token: FAKE_KEY });
        }
        return jsonResponse(200, recoveredPosts === 0 ? [] : [created]);
      },
    });
    assert.equal(recovered.code, 'RECOVERED_CREATED_TEMPLATE');
    assert.equal(recovered.recoveryRequired, true);
    assert.equal(recoveredPosts, 1);
    assert.equal(JSON.stringify(recovered).includes(FAKE_KEY), false);

    let manyPosts = 0;
    const many = await createTemplateGuarded({
      ...gated(),
      fetchFn: async (url, opts = {}) => {
        const method = String(opts.method || 'GET').toUpperCase();
        if (method === 'POST') {
          manyPosts += 1;
          return jsonResponse(409, { error: 'conflict' });
        }
        return jsonResponse(
          200,
          manyPosts === 0 ? [] : [compatibleTemplate({ id: 'one' }), compatibleTemplate({ id: 'two' })],
        );
      },
    });
    assert.equal(many.code, 'AMBIGUOUS_TEMPLATE_MATCH');
    assert.equal(many.recoveryRequired, true);
  });

  it('does not POST a second time after an uncertain result', async () => {
    let posts = 0;
    await createTemplateGuarded({
      ...gated(),
      fetchFn: async (url, opts = {}) => {
        const method = String(opts.method || 'GET').toUpperCase();
        if (method === 'POST') {
          posts += 1;
          throw new Error('timeout');
        }
        return jsonResponse(200, []);
      },
    });
    assert.equal(posts, 1);
  });

  it('classifies 401/403 and volume rejection without substituting a volume', async () => {
    const unauthorized = await createTemplateGuarded({
      ...gated(),
      fetchFn: async (url, opts = {}) => {
        if (String(opts.method || 'GET').toUpperCase() === 'POST') return jsonResponse(401, { error: FAKE_SECRET });
        return jsonResponse(200, []);
      },
    });
    assert.equal(unauthorized.code, 'API_ERROR');
    assert.equal(JSON.stringify(unauthorized).includes(FAKE_SECRET), false);

    const volume = await createTemplateGuarded({
      ...gated(),
      fetchFn: async (url, opts = {}) => {
        if (String(opts.method || 'GET').toUpperCase() === 'POST') {
          return jsonResponse(400, { error: 'volumeInGb must be at least 20' });
        }
        return jsonResponse(200, []);
      },
    });
    assert.equal(volume.code, 'TEMPLATE_VOLUME_CONFIGURATION_REJECTED');
    assert.equal(volume.httpStatus, 400);
    assert.equal(moduleSource.includes('volumeInGb: 20'), false);
  });

  it('covers 408/429/500/502/503 as recovery, not a second POST', async () => {
    for (const status of [408, 429, 500, 502, 503]) {
      let posts = 0;
      const result = await createTemplateGuarded({
        ...gated(),
        fetchFn: async (url, opts = {}) => {
          if (String(opts.method || 'GET').toUpperCase() === 'POST') {
            posts += 1;
            return jsonResponse(status, { error: 'retry' });
          }
          return jsonResponse(200, []);
        },
      });
      assert.equal(result.recoveryRequired, true, String(status));
      assert.equal(result.code, 'TEMPLATE_CREATE_UNCERTAIN', String(status));
      assert.equal(posts, 1, String(status));
    }
  });

  it('stops if the created template is incompatible and if the post-create count is not 1', async () => {
    const bad = compatibleTemplate({ isPublic: true });
    const incompatible = await createTemplateGuarded({
      ...gated(),
      fetchFn: async (url, opts = {}) => {
        if (String(opts.method || 'GET').toUpperCase() === 'POST') return jsonResponse(201, bad);
        if (String(url).includes(bad.id)) return jsonResponse(200, bad);
        return jsonResponse(200, []);
      },
    });
    assert.equal(incompatible.code, 'CREATED_TEMPLATE_INCOMPATIBLE');
    assert.equal(incompatible.postCount, 1);

    const created = compatibleTemplate();
    const duplicate = await createTemplateGuarded({
      ...gated(),
      fetchFn: async (url, opts = {}) => {
        if (String(opts.method || 'GET').toUpperCase() === 'POST') return jsonResponse(201, created);
        if (String(url).includes(created.id)) return jsonResponse(200, created);
        return jsonResponse(200, [created, compatibleTemplate({ id: 'dup', name: 'other-compatible-name' })]);
      },
    });
    assert.equal(duplicate.code, 'DUPLICATE_TEMPLATE_IDENTITY');
    assert.equal(duplicate.postCreateCompatibleCount, 2);
  });

  it('recovery helper distinguishes 0, 1, and many exact identity matches', async () => {
    const zero = await recoverTemplateCreation({
      apiKey: FAKE_KEY,
      fetchFn: async () => jsonResponse(200, []),
    });
    assert.equal(zero.code, 'TEMPLATE_CREATE_UNCERTAIN');
    const one = await recoverTemplateCreation({
      apiKey: FAKE_KEY,
      fetchFn: async () => jsonResponse(200, [compatibleTemplate()]),
    });
    assert.equal(one.code, 'RECOVERED_CREATED_TEMPLATE');
    const many = await recoverTemplateCreation({
      apiKey: FAKE_KEY,
      fetchFn: async () => jsonResponse(200, [compatibleTemplate({ id: 'a' }), compatibleTemplate({ id: 'b' })]),
    });
    assert.equal(many.code, 'AMBIGUOUS_TEMPLATE_MATCH');
  });
});

describe('mutation tripwire and redaction', () => {
  it('refuses Pod POST/DELETE, template PATCH/DELETE, update, and GraphQL', async () => {
    const recorder = { attempts: [] };
    const fetchFn = createTemplateMutationTripwire(recorder);
    for (const [url, method] of [
      [REST_PODS_URL, 'POST'],
      [`${REST_PODS_URL}/abc`, 'DELETE'],
      [`${REST_TEMPLATES_URL}/abc`, 'PATCH'],
      [`${REST_TEMPLATES_URL}/abc`, 'DELETE'],
      [`${REST_TEMPLATES_URL}/abc/update`, 'POST'],
      [CREATE_GRAPHQL_URL, 'POST'],
    ]) {
      await assert.rejects(() => fetchFn(url, { method }), (error) => error.code === 'TEMPLATE_MUTATION_TRIPWIRE');
    }
    assert.equal(isAllowedTemplateCreateRequest(REST_TEMPLATES_URL, 'POST'), true);
    assert.equal(isAllowedTemplateCreateRequest(REST_PODS_URL, 'POST'), false);
  });

  it('redacts secrets from summaries', () => {
    const summary = sanitizeTemplateCreateSummary({
      ...buildCreateTemplatePayload(),
      env: { R2_SECRET_ACCESS_KEY: FAKE_SECRET },
    });
    assert.equal(JSON.stringify(summary).includes(FAKE_SECRET), false);
    assert.equal(redactSecrets(`Authorization: Bearer ${FAKE_KEY}`).includes(FAKE_KEY), false);
    assert.equal(extractTemplateId({ id: 'abc' }), 'abc');
    assert.equal(extractTemplateId({}), null);
  });
});

describe('workflow and docs', () => {
  it('is branch-scoped, contents:read only, and uses the exact create phrase', () => {
    assert.match(workflow, /^on:\n  push:\n    branches:\n      - cursor\/tivvlejoy-runpod-template-create-73f1\n/m);
    assert.match(workflow, /permissions:\n  contents: read\n/);
    assert.doesNotMatch(workflow, /packages: write/);
    assert.doesNotMatch(workflow, /workflow_dispatch/);
    assert.equal(workflow.includes('RUNPOD_API_KEY: ${{ secrets.RUNPOD_API_KEY }}'), true);
    assert.equal(workflow.includes('RUNPOD_RENDER_TEMPLATE_ID'), false);
    assert.match(workflow, /create-template CREATE_TIVVLEJOY_TEMPLATE_D791981A/);
    assert.equal(workflow.includes('/v1/pods'), false);
    assert.equal(workflow.includes('echo "${RUNPOD_API_KEY}"'), false);
    assert.equal(common.includes('d791981a4ed530214dcf96cb76593ad6e849c9e408672df36db102a52cdc1b25'), true);
    assert.equal(common.includes('b53fcbf5fc973ad8e1e5f1e240f58d12885143e11494a3871f579c6fb351faed'), true);
    assert.equal(REQUIRED_CREATE_PHRASE, 'CREATE_TIVVLEJOY_TEMPLATE_B53FCBF5');
  });

  it('documents the single allowed mutation and volume fail-closed rule', () => {
    assert.match(docs, /CREATE_TIVVLEJOY_TEMPLATE_B53FCBF5/);
    assert.match(docs, /CREATE_TIVVLEJOY_TEMPLATE_D791981A/);
    assert.match(docs, /POST \/v1\/templates/);
    assert.match(docs, /TEMPLATE_VOLUME_CONFIGURATION_REJECTED/);
    assert.match(docs, /ALREADY_READY/);
    assert.equal(docs.includes('Do not POST /v1/pods'), true);
  });
});

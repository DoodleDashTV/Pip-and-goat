import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CLEANUP_ATTENTION,
  GITHUB_JOB_TIMEOUT_MINUTES,
  MAX_COMPUTE_USD,
  MAX_HOURLY_USD,
  MAX_RUNTIME_MINUTES,
  PINNED_CLOUD_TYPE,
  PINNED_GPU_COUNT,
  PINNED_GPU_TYPE_ID,
  POD_NAME_PREFIX,
  REMOTE_RENDER_TIMEOUT_CONTRACT,
  REQUIRED_APPROVAL_PHRASE,
  REST_PODS_URL,
  SCENE_EXECUTION_BOUNDARY,
  buildCreatePodPayload,
  buildRemoteRenderDeadlineWrapper,
  ceilDiv,
  createGuardedPod,
  deleteGuardedPod,
  evaluateApprovals,
  evaluateGpuPlan,
  evaluateModePaidConfirmation,
  extractExactNameMatches,
  extractPodId,
  formatUsdFromMicros,
  intendedPodName,
  parseSecurePricePayload,
  parseUsdToMicros,
  persistLaunchIntent,
  persistPodId,
  projectedComputeMicros,
  recoverPodByExactName,
  runCleanup,
  runRenderLaunch,
  runRenderPlan,
} from './tivvlejoy-guarded-render.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflowPath = path.join(repoRoot, '.github/workflows/tivvlejoy-runpod.yml');
const docsPath = path.join(repoRoot, 'docs/runpod-github-actions.md');
const modulePath = path.join(repoRoot, 'scripts/cloud/tivvlejoy-guarded-render.mjs');

let tempDirs = [];
afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

function tempDir() {
  const dir = mkdtempSync(path.join(tmpdir(), 'tivvlejoy-guarded-render-'));
  tempDirs.push(dir);
  return dir;
}

function jsonResponse(status, body) {
  return {
    status,
    text: async () => JSON.stringify(body),
  };
}

function priceBody({ price = 0.74, stock = 'High', id = PINNED_GPU_TYPE_ID } = {}) {
  return {
    data: {
      gpuTypes: [
        {
          id,
          lowestPrice: {
            uninterruptablePrice: price,
            stockStatus: stock,
          },
        },
      ],
    },
  };
}

function scriptedFetch(script) {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body ?? null, headers: init.headers ?? {} });
    const next = script[calls.length - 1];
    if (!next) {
      throw new Error(`Unexpected fetch ${init.method ?? 'GET'} ${url}`);
    }
    if (next.assert) next.assert({ url, init, calls });
    if (next.throw) {
      throw next.throw === true ? new Error('ambiguous transport') : next.throw;
    }
    return next.response;
  };
  return { fetchFn, calls };
}

function launchEnv(dir) {
  return {
    TIVVLEJOY_POD_ID_FILE: path.join(dir, 'pod-id'),
    TIVVLEJOY_POD_NAME_FILE: path.join(dir, 'pod-name'),
    TIVVLEJOY_CREATE_ATTEMPTED_FILE: path.join(dir, 'create-attempted'),
    GITHUB_ENV: path.join(dir, 'github-env'),
  };
}

function authAndPrice() {
  return [
    { response: jsonResponse(200, { data: { myself: { id: 'acct' } } }) },
    { response: jsonResponse(200, priceBody({ price: 0.74 })) },
  ];
}

describe('decimal-safe cost math', () => {
  it('never rounds a price downward when extra digits exist', () => {
    assert.equal(parseUsdToMicros('0.75'), 750000);
    assert.equal(parseUsdToMicros('0.7500001'), 750001);
    assert.equal(parseUsdToMicros(0.74), 740000);
    assert.equal(parseUsdToMicros('not-a-price'), null);
    assert.equal(parseUsdToMicros('1e-2'), null);
  });

  it('projects compute cost with ceil division', () => {
    assert.equal(projectedComputeMicros(750000, 20), 250000);
    assert.equal(projectedComputeMicros(750001, 20), 250001);
    assert.equal(ceilDiv(15_000_000, 60), 250000);
    assert.equal(formatUsdFromMicros(246667), '$0.246667');
  });
});

describe('approval and plan gates', () => {
  it('requires the exact approval phrase, paid confirmation, and template for launch', () => {
    assert.equal(
      evaluateApprovals({
        mode: 'render_launch',
        confirmPaidGpu: false,
        paidApprovalPhrase: REQUIRED_APPROVAL_PHRASE,
        templateId: 'tmpl_test',
      }).ok,
      false,
    );
    assert.equal(
      evaluateApprovals({
        mode: 'render_launch',
        confirmPaidGpu: true,
        paidApprovalPhrase: 'launch_tivvlejoy_gpu',
        templateId: 'tmpl_test',
      }).ok,
      false,
    );
    assert.equal(
      evaluateApprovals({
        mode: 'render_launch',
        confirmPaidGpu: true,
        paidApprovalPhrase: REQUIRED_APPROVAL_PHRASE,
        templateId: '',
      }).ok,
      false,
    );
    assert.equal(
      evaluateApprovals({
        mode: 'render_launch',
        confirmPaidGpu: true,
        paidApprovalPhrase: REQUIRED_APPROVAL_PHRASE,
        templateId: 'tmpl_test',
      }).ok,
      true,
    );
  });

  it('requires confirm_paid_gpu false except for render_launch', () => {
    for (const mode of ['validate', 'connectivity', 'render_plan']) {
      assert.equal(evaluateModePaidConfirmation(mode, false).ok, true, mode);
      assert.equal(evaluateModePaidConfirmation(mode, true).ok, false, mode);
      assert.equal(
        evaluateApprovals({
          mode,
          confirmPaidGpu: true,
          paidApprovalPhrase: REQUIRED_APPROVAL_PHRASE,
          templateId: 'tmpl_test',
        }).ok,
        false,
        mode,
      );
    }
    assert.equal(evaluateModePaidConfirmation('render_launch', true).ok, true);
    assert.equal(evaluateModePaidConfirmation('render_launch', false).ok, false);
  });

  it('refuses unavailable GPUs, failed prices, and prices above cap', () => {
    assert.equal(evaluateGpuPlan({ hourlyUsdRaw: 0.74, stockStatus: 'None', gpuCount: 1 }).ok, false);
    assert.equal(evaluateGpuPlan({ hourlyUsdRaw: 0.74, stockStatus: 'High', gpuCount: 2 }).ok, false);
    assert.equal(evaluateGpuPlan({ hourlyUsdRaw: null, stockStatus: 'High', gpuCount: 1 }).ok, false);
    assert.equal(evaluateGpuPlan({ hourlyUsdRaw: 0.76, stockStatus: 'High', gpuCount: 1 }).ok, false);
    assert.equal(evaluateGpuPlan({ hourlyUsdRaw: 0.7500001, stockStatus: 'High', gpuCount: 1 }).ok, false);
    const pass = evaluateGpuPlan({ hourlyUsdRaw: 0.75, stockStatus: 'High', gpuCount: 1 });
    assert.equal(pass.ok, true);
    assert.equal(pass.verdict, 'PASS');
    assert.equal(pass.projectedMicros, 250000);
  });

  it('refuses when the secure price payload is missing or ambiguous', () => {
    assert.equal(parseSecurePricePayload(null).ok, false);
    assert.equal(parseSecurePricePayload({ data: { gpuTypes: [] } }).ok, false);
    assert.equal(
      parseSecurePricePayload({
        data: { gpuTypes: [{ id: 'NVIDIA GeForce RTX 5090', lowestPrice: { uninterruptablePrice: 0.5, stockStatus: 'High' } }] },
      }).ok,
      false,
    );
    assert.equal(
      parseSecurePricePayload({
        data: { gpuTypes: [{ id: PINNED_GPU_TYPE_ID, lowestPrice: null }] },
      }).ok,
      false,
    );
  });
});

describe('pod payload and id handling', () => {
  it('pins RTX 4090 Secure Cloud with one GPU and no fallback', () => {
    const payload = buildCreatePodPayload({ templateId: 'tmpl_test', runId: '12345' });
    assert.deepEqual(payload.gpuTypeIds, [PINNED_GPU_TYPE_ID]);
    assert.equal(payload.gpuTypePriority, 'custom');
    assert.equal(payload.cloudType, PINNED_CLOUD_TYPE);
    assert.equal(payload.gpuCount, PINNED_GPU_COUNT);
    assert.equal(payload.interruptible, false);
    assert.equal(payload.locked, false);
    assert.equal(payload.computeType, 'GPU');
    assert.deepEqual(payload.ports, []);
    assert.equal(payload.name, `${POD_NAME_PREFIX}12345`);
    assert.equal(payload.templateId, 'tmpl_test');
  });

  it('extracts only a sanitized Pod ID', () => {
    assert.equal(extractPodId({ id: 'uv9wy55tyv30lo', email: 'hidden' }), 'uv9wy55tyv30lo');
    assert.equal(extractPodId({ pod: { id: 'uv9wy55tyv30lo' } }), null);
    assert.equal(extractPodId({ id: 'bad id' }), null);
  });
});

describe('network modes', () => {
  it('render_plan never posts to the paid Pods API', async () => {
    const { fetchFn, calls } = scriptedFetch([
      { response: jsonResponse(200, { data: { myself: { id: 'acct' } } }) },
      { response: jsonResponse(200, priceBody()) },
    ]);
    const logs = [];
    const result = await runRenderPlan({
      apiKey: 'rpa_fake_test_key',
      fetchFn,
      log: (line) => logs.push(line),
    });
    assert.equal(result.ok, true);
    assert.equal(result.createdPod, false);
    assert.equal(
      calls.some((call) => String(call.url).includes('/v1/pods') && call.method === 'POST'),
      false,
    );
    assert.equal(
      logs.some((line) => /rpa_|Authorization|acct|\{/.test(line)),
      false,
    );
    assert.equal(logs.includes('Plan: PASS'), true);
  });

  it('failed price lookup and unavailable stock refuse without creating a Pod', async () => {
    const failedPrice = scriptedFetch([
      { response: jsonResponse(200, { data: { myself: { id: 'acct' } } }) },
      { response: jsonResponse(500, { errors: [{ message: 'no' }] }) },
    ]);
    const unavailable = scriptedFetch([
      { response: jsonResponse(200, { data: { myself: { id: 'acct' } } }) },
      { response: jsonResponse(200, priceBody({ stock: 'None' })) },
    ]);
    const failed = await runRenderPlan({
      apiKey: 'rpa_fake_test_key',
      fetchFn: failedPrice.fetchFn,
      log: () => {},
    });
    const stock = await runRenderPlan({
      apiKey: 'rpa_fake_test_key',
      fetchFn: unavailable.fetchFn,
      log: () => {},
    });
    assert.equal(failed.ok, false);
    assert.equal(stock.ok, false);
    assert.equal(failedPrice.calls.some((call) => String(call.url).includes('/v1/pods')), false);
    assert.equal(unavailable.calls.some((call) => String(call.url).includes('/v1/pods')), false);
  });

  it('refuses launch when approval is false, the phrase is wrong, or the template is missing', async () => {
    const { fetchFn, calls } = scriptedFetch([]);
    const approval = await runRenderLaunch({
      apiKey: 'rpa_fake_test_key',
      templateId: 'tmpl_test',
      runId: '99',
      confirmPaidGpu: false,
      paidApprovalPhrase: REQUIRED_APPROVAL_PHRASE,
      fetchFn,
      log: () => {},
    });
    const phrase = await runRenderLaunch({
      apiKey: 'rpa_fake_test_key',
      templateId: 'tmpl_test',
      runId: '99',
      confirmPaidGpu: true,
      paidApprovalPhrase: 'WRONG',
      fetchFn,
      log: () => {},
    });
    const template = await runRenderLaunch({
      apiKey: 'rpa_fake_test_key',
      templateId: '',
      runId: '99',
      confirmPaidGpu: true,
      paidApprovalPhrase: REQUIRED_APPROVAL_PHRASE,
      fetchFn,
      log: () => {},
    });
    assert.equal(approval.ok, false);
    assert.equal(phrase.ok, false);
    assert.equal(template.ok, false);
    assert.equal(calls.length, 0);
  });

  it('creates one Pod only after gates pass and registers cleanup immediately', async () => {
    const dir = tempDir();
    const env = launchEnv(dir);
    const { fetchFn, calls } = scriptedFetch([
      ...authAndPrice(),
      {
        assert: ({ url, init }) => {
          assert.equal(url, REST_PODS_URL);
          assert.equal(init.method, 'POST');
          const payload = JSON.parse(init.body);
          assert.deepEqual(payload.gpuTypeIds, [PINNED_GPU_TYPE_ID]);
          assert.equal(payload.cloudType, 'SECURE');
          assert.equal(payload.gpuCount, 1);
          assert.equal(payload.interruptible, false);
          assert.equal(payload.name, `${POD_NAME_PREFIX}4242`);
          assert.equal(Object.prototype.hasOwnProperty.call(init.headers, 'Authorization'), true);
        },
        response: jsonResponse(200, { id: 'podabc123', machine: { secret: 'nope' } }),
      },
    ]);
    const logs = [];
    const result = await runRenderLaunch({
      apiKey: 'rpa_fake_test_key',
      templateId: 'tmpl_test',
      runId: '4242',
      confirmPaidGpu: true,
      paidApprovalPhrase: REQUIRED_APPROVAL_PHRASE,
      fetchFn,
      log: (line) => logs.push(line),
      env,
    });
    assert.equal(result.ok, true);
    assert.equal(result.podId, 'podabc123');
    assert.equal(readFileSync(env.TIVVLEJOY_POD_ID_FILE, 'utf8'), 'podabc123');
    assert.equal(readFileSync(env.TIVVLEJOY_POD_NAME_FILE, 'utf8'), `${POD_NAME_PREFIX}4242`);
    assert.equal(readFileSync(env.TIVVLEJOY_CREATE_ATTEMPTED_FILE, 'utf8'), 'true');
    assert.equal(readFileSync(env.GITHUB_ENV, 'utf8').includes('TIVVLEJOY_POD_ID=podabc123'), true);
    assert.equal(calls.filter((call) => call.method === 'POST' && call.url === REST_PODS_URL).length, 1);
    assert.equal(logs.includes('launch PASS'), true);
    assert.equal(logs.includes('Pod ID: podabc123'), true);
    assert.equal(logs.includes(SCENE_EXECUTION_BOUNDARY), true);
    assert.equal(logs.some((line) => line.includes('secret') || line.includes('machine') || line.includes('{')), false);
  });

  it('cleanup is idempotent and prints attention when delete cannot be confirmed', async () => {
    const okDelete = await deleteGuardedPod({
      apiKey: 'rpa_fake_test_key',
      podId: 'podabc123',
      fetchFn: async () => ({ status: 204, text: async () => '' }),
    });
    const gone = await deleteGuardedPod({
      apiKey: 'rpa_fake_test_key',
      podId: 'podabc123',
      fetchFn: async () => ({ status: 404, text: async () => '' }),
    });
    const failed = await deleteGuardedPod({
      apiKey: 'rpa_fake_test_key',
      podId: 'podabc123',
      fetchFn: async () => ({ status: 500, text: async () => '{"error":"no"}' }),
    });
    assert.equal(okDelete.ok, true);
    assert.equal(gone.ok, true);
    assert.equal(failed.ok, false);

    const dir = tempDir();
    persistPodId('podabc123', { TIVVLEJOY_POD_ID_FILE: path.join(dir, 'pod-id') });
    const logs = [];
    const attention = await runCleanup({
      apiKey: 'rpa_fake_test_key',
      fetchFn: async () => ({ status: 500, text: async () => '{"error":"no"}' }),
      log: (line) => logs.push(line),
      env: { TIVVLEJOY_POD_ID_FILE: path.join(dir, 'pod-id') },
    });
    assert.equal(attention.ok, false);
    assert.equal(logs.includes(CLEANUP_ATTENTION), true);
    assert.equal(logs.includes('Pod ID: podabc123'), true);
    assert.equal(logs.some((line) => line.includes('{') || line.includes('error')), false);
  });

  it('createGuardedPod extracts only the id and never requires dumping the body', async () => {
    const created = await createGuardedPod({
      apiKey: 'rpa_fake_test_key',
      templateId: 'tmpl_test',
      runId: '7',
      fetchFn: async () => jsonResponse(200, { id: 'onlyid999', rawDump: 'ACCOUNT' }),
    });
    assert.equal(created.ok, true);
    assert.equal(created.podId, 'onlyid999');
  });
});

describe('ambiguous create recovery', () => {
  it('A. create succeeds with a valid ID and uses normal cleanup', async () => {
    const dir = tempDir();
    const env = launchEnv(dir);
    const { fetchFn, calls } = scriptedFetch([
      ...authAndPrice(),
      { response: jsonResponse(200, { id: 'podok111', extra: 'nope' }) },
    ]);
    const result = await runRenderLaunch({
      apiKey: 'rpa_fake_test_key',
      templateId: 'tmpl_test',
      runId: '111',
      confirmPaidGpu: true,
      paidApprovalPhrase: REQUIRED_APPROVAL_PHRASE,
      fetchFn,
      log: () => {},
      env,
    });
    assert.equal(result.ok, true);
    assert.equal(result.podId, 'podok111');
    assert.equal(calls.some((call) => call.method === 'GET' && call.url === REST_PODS_URL), false);
    const cleanup = scriptedFetch([{ response: { status: 204, text: async () => '' } }]);
    const cleaned = await runCleanup({
      apiKey: 'rpa_fake_test_key',
      fetchFn: cleanup.fetchFn,
      log: () => {},
      env,
    });
    assert.equal(cleaned.ok, true);
    assert.equal(cleanup.calls[0].method, 'DELETE');
    assert.equal(cleanup.calls[0].url, `${REST_PODS_URL}/podok111`);
  });

  it('B. HTTP 2xx + malformed JSON recovers the exact name and deletes it', async () => {
    const dir = tempDir();
    const env = launchEnv(dir);
    const logs = [];
    const { fetchFn, calls } = scriptedFetch([
      ...authAndPrice(),
      { response: { status: 200, text: async () => '{not-json' } },
      { response: jsonResponse(200, [{ id: 'podrec222', name: `${POD_NAME_PREFIX}222` }]) },
      { response: { status: 204, text: async () => '' } },
    ]);
    const result = await runRenderLaunch({
      apiKey: 'rpa_fake_test_key',
      templateId: 'tmpl_test',
      runId: '222',
      confirmPaidGpu: true,
      paidApprovalPhrase: REQUIRED_APPROVAL_PHRASE,
      fetchFn,
      log: (line) => logs.push(line),
      env,
    });
    assert.equal(result.ok, false);
    assert.equal(result.recovered, true);
    assert.equal(result.cleaned, true);
    assert.equal(result.podId, 'podrec222');
    assert.equal(calls.filter((call) => call.method === 'GET' && call.url === REST_PODS_URL).length, 1);
    assert.equal(calls.some((call) => call.method === 'DELETE' && call.url === `${REST_PODS_URL}/podrec222`), true);
    assert.equal(logs.includes(CLEANUP_ATTENTION), false);
    assert.equal(logs.some((line) => line.includes('{') || line.includes('not-json')), false);
  });

  it('C. HTTP 2xx + missing ID recovers the exact name and deletes it', async () => {
    const dir = tempDir();
    const env = launchEnv(dir);
    const { fetchFn, calls } = scriptedFetch([
      ...authAndPrice(),
      { response: jsonResponse(200, { name: `${POD_NAME_PREFIX}333`, account: 'hidden' }) },
      { response: jsonResponse(200, [{ id: 'podrec333', name: `${POD_NAME_PREFIX}333` }]) },
      { response: { status: 204, text: async () => '' } },
    ]);
    const result = await runRenderLaunch({
      apiKey: 'rpa_fake_test_key',
      templateId: 'tmpl_test',
      runId: '333',
      confirmPaidGpu: true,
      paidApprovalPhrase: REQUIRED_APPROVAL_PHRASE,
      fetchFn,
      log: () => {},
      env,
    });
    assert.equal(result.ok, false);
    assert.equal(result.cleaned, true);
    assert.equal(result.podId, 'podrec333');
    assert.equal(calls.some((call) => call.method === 'DELETE' && call.url === `${REST_PODS_URL}/podrec333`), true);
  });

  it('D. ambiguous create transport failure runs the recovery path', async () => {
    const dir = tempDir();
    const env = launchEnv(dir);
    const logs = [];
    const { fetchFn, calls } = scriptedFetch([
      ...authAndPrice(),
      { throw: true },
      { response: jsonResponse(200, [{ id: 'podrec444', name: `${POD_NAME_PREFIX}444` }]) },
      { response: { status: 204, text: async () => '' } },
    ]);
    const result = await runRenderLaunch({
      apiKey: 'rpa_fake_test_key',
      templateId: 'tmpl_test',
      runId: '444',
      confirmPaidGpu: true,
      paidApprovalPhrase: REQUIRED_APPROVAL_PHRASE,
      fetchFn,
      log: (line) => logs.push(line),
      env,
    });
    assert.equal(result.recovered, true);
    assert.equal(result.cleaned, true);
    assert.equal(readFileSync(env.TIVVLEJOY_CREATE_ATTEMPTED_FILE, 'utf8'), 'true');
    assert.equal(calls.some((call) => call.method === 'GET' && call.url === REST_PODS_URL), true);
    assert.equal(logs.some((line) => line.includes('Entering exact-name recovery')), true);
  });

  it('E. recovery finds zero exact matches and fails safely', async () => {
    const dir = tempDir();
    const env = launchEnv(dir);
    const logs = [];
    const { fetchFn, calls } = scriptedFetch([
      ...authAndPrice(),
      { response: { status: 200, text: async () => '{not-json' } },
      {
        response: jsonResponse(200, [
          { id: 'other999', name: `${POD_NAME_PREFIX}9999` },
          { id: 'prefix555', name: `${POD_NAME_PREFIX}555-extra` },
        ]),
      },
    ]);
    const result = await runRenderLaunch({
      apiKey: 'rpa_fake_test_key',
      templateId: 'tmpl_test',
      runId: '555',
      confirmPaidGpu: true,
      paidApprovalPhrase: REQUIRED_APPROVAL_PHRASE,
      fetchFn,
      log: (line) => logs.push(line),
      env,
    });
    assert.equal(result.ok, false);
    assert.equal(result.confirmedZero, true);
    assert.equal(calls.some((call) => call.method === 'DELETE'), false);
    assert.equal(logs.includes(CLEANUP_ATTENTION), false);
    assert.equal(logs.some((line) => line.includes('zero exact-name matches')), true);
  });

  it('F. recovery finds more than one exact match and requires attention', async () => {
    const dir = tempDir();
    const env = launchEnv(dir);
    const logs = [];
    const { fetchFn, calls } = scriptedFetch([
      ...authAndPrice(),
      { response: jsonResponse(200, { name: `${POD_NAME_PREFIX}666` }) },
      {
        response: jsonResponse(200, [
          { id: 'podaaa111', name: `${POD_NAME_PREFIX}666` },
          { id: 'podbbb222', name: `${POD_NAME_PREFIX}666` },
        ]),
      },
    ]);
    const result = await runRenderLaunch({
      apiKey: 'rpa_fake_test_key',
      templateId: 'tmpl_test',
      runId: '666',
      confirmPaidGpu: true,
      paidApprovalPhrase: REQUIRED_APPROVAL_PHRASE,
      fetchFn,
      log: (line) => logs.push(line),
      env,
    });
    assert.equal(result.ok, false);
    assert.equal(result.attention, true);
    assert.equal(calls.some((call) => call.method === 'DELETE'), false);
    assert.equal(logs.includes(CLEANUP_ATTENTION), true);
    assert.equal(logs.includes('Matching Pod IDs: podaaa111, podbbb222'), true);
    assert.equal(logs.some((line) => line.includes('{') || line.includes('account')), false);
  });

  it('G. recovery API failure requires attention', async () => {
    const dir = tempDir();
    const env = launchEnv(dir);
    const logs = [];
    const result = await runRenderLaunch({
      apiKey: 'rpa_fake_test_key',
      templateId: 'tmpl_test',
      runId: '777',
      confirmPaidGpu: true,
      paidApprovalPhrase: REQUIRED_APPROVAL_PHRASE,
      fetchFn: scriptedFetch([
        ...authAndPrice(),
        { response: { status: 200, text: async () => '{not-json' } },
        { response: { status: 500, text: async () => '{"error":"no"}' } },
      ]).fetchFn,
      log: (line) => logs.push(line),
      env,
    });
    assert.equal(result.ok, false);
    assert.equal(result.attention, true);
    assert.equal(logs.includes(CLEANUP_ATTENTION), true);
    assert.equal(logs.some((line) => line.includes('{') || line.includes('error')), false);
  });

  it('H. recovery never deletes a non-exact name match', async () => {
    const exact = `${POD_NAME_PREFIX}888`;
    const extracted = extractExactNameMatches(
      [
        { id: 'near1', name: `${exact}-extra` },
        { id: 'near2', name: `${POD_NAME_PREFIX}88` },
        { id: 'near3', name: `prefix-${exact}` },
      ],
      exact,
    );
    assert.equal(extracted.ok, true);
    assert.deepEqual(extracted.matches, []);

    const listed = await recoverPodByExactName({
      apiKey: 'rpa_fake_test_key',
      exactName: exact,
      fetchFn: async () =>
        jsonResponse(200, [
          { id: 'near1', name: `${exact}-extra` },
          { id: 'near2', name: `${POD_NAME_PREFIX}88` },
        ]),
    });
    assert.equal(listed.kind, 'zero');

    const dir = tempDir();
    persistLaunchIntent({ podName: exact, env: launchEnv(dir) });
    const { fetchFn, calls } = scriptedFetch([
      {
        response: jsonResponse(200, [
          { id: 'near1', name: `${exact}-extra` },
          { id: 'near2', name: `${POD_NAME_PREFIX}88` },
        ]),
      },
    ]);
    const cleaned = await runCleanup({
      apiKey: 'rpa_fake_test_key',
      fetchFn,
      log: () => {},
      env: launchEnv(dir),
    });
    assert.equal(cleaned.confirmedZero, true);
    assert.equal(calls.some((call) => call.method === 'DELETE'), false);
  });
});

describe('workflow contract', () => {
  const workflow = readFileSync(workflowPath, 'utf8');
  const docs = readFileSync(docsPath, 'utf8');
  const moduleSource = readFileSync(modulePath, 'utf8');

  it('is workflow_dispatch only with no automatic triggers', () => {
    assert.match(workflow, /^on:\n  workflow_dispatch:/m);
    for (const trigger of ['push:', 'pull_request:', 'schedule:', 'workflow_run:', 'repository_dispatch:']) {
      assert.equal(workflow.includes(`\n  ${trigger}`), false, trigger);
    }
  });

  it('keeps validate as the default and paid confirmation false', () => {
    assert.match(workflow, /default: validate/);
    assert.match(workflow, /confirm_paid_gpu:[\s\S]*default: false/);
    assert.match(workflow, /paid_approval_phrase:/);
    assert.match(workflow, /LAUNCH_TIVVLEJOY_GPU/);
    assert.match(workflow, /- render_plan/);
    assert.match(workflow, /- render_launch/);
  });

  it('pins GPU, cloud, count, and hard caps', () => {
    assert.equal(PINNED_GPU_TYPE_ID, 'NVIDIA GeForce RTX 4090');
    assert.equal(PINNED_CLOUD_TYPE, 'SECURE');
    assert.equal(PINNED_GPU_COUNT, 1);
    assert.equal(MAX_HOURLY_USD, '0.75');
    assert.equal(MAX_RUNTIME_MINUTES, 20);
    assert.equal(MAX_COMPUTE_USD, '0.25');
    assert.match(workflow, /timeout-minutes: 25/);
    assert.match(workflow, /NVIDIA GeForce RTX 4090/);
    assert.match(workflow, /MAX_HOURLY_USD: '0\.75'/);
    assert.match(workflow, /MAX_RUNTIME_MINUTES: '20'/);
    assert.match(workflow, /MAX_COMPUTE_USD: '0\.25'/);
  });

  it('registers cleanup after creation and on success or failure', () => {
    assert.match(workflow, /trap /);
    assert.match(workflow, /always\(\)/);
    assert.match(workflow, /tivvlejoy-guarded-render\.mjs cleanup/);
    assert.match(workflow, /RUNPOD CLEANUP REQUIRES ATTENTION/);
  });

  it('does not print secrets or raw API bodies', () => {
    for (const source of [workflow, moduleSource]) {
      assert.equal(source.includes('set -x'), false);
      assert.equal(source.includes('curl -v'), false);
      assert.equal(source.includes('curl --verbose'), false);
      assert.equal(source.includes('echo "${RUNPOD_API_KEY}"'), false);
      assert.equal(source.includes('echo $RUNPOD_API_KEY'), false);
      assert.equal(source.includes('echo "${RUNPOD_RENDER_TEMPLATE_ID}"'), false);
    }
    assert.match(workflow, /RUNPOD_API_KEY: \$\{\{ secrets\.RUNPOD_API_KEY \}\}/);
    assert.match(workflow, /RUNPOD_RENDER_TEMPLATE_ID: \$\{\{ secrets\.RUNPOD_RENDER_TEMPLATE_ID \}\}/);
    assert.equal(workflow.includes('console.log(JSON.stringify'), false);
    assert.equal(moduleSource.includes('JSON.stringify(parsed)'), false);
    assert.equal(moduleSource.includes('console.log(text)'), false);
  });

  it('keeps paid mutation out of validate, connectivity, and render_plan steps', () => {
    const validateStep = workflow.slice(workflow.indexOf('name: Validate configuration'), workflow.indexOf('name: Connectivity check'));
    const connectivityStep = workflow.slice(workflow.indexOf('name: Connectivity check'), workflow.indexOf('name: Render plan'));
    const planStep = workflow.slice(workflow.indexOf('name: Render plan'), workflow.indexOf('name: Guarded render launch'));
    assert.equal(validateStep.includes('rest.runpod.io/v1/pods'), false);
    assert.equal(connectivityStep.includes('rest.runpod.io/v1/pods'), false);
    assert.equal(planStep.includes('render-plan'), true);
    assert.equal(planStep.includes('render-launch'), false);
    assert.match(docs, /validate/);
    assert.match(docs, /connectivity/);
    assert.match(docs, /render_plan/);
    assert.match(docs, /render_launch/);
    assert.match(docs, /LAUNCH_TIVVLEJOY_GPU/);
    assert.match(docs, /hard refusal/);
  });

  it('hard-fails wrong-mode paid confirmation and keeps render_plan unpaid', () => {
    const refuseStep = workflow.slice(
      workflow.indexOf('name: Refuse paid GPU launch outside render_launch'),
      workflow.indexOf('name: Validate configuration'),
    );
    assert.match(refuseStep, /exit 1/);
    assert.match(workflow, /inputs\.mode == 'validate' && !inputs\.confirm_paid_gpu/);
    assert.match(workflow, /inputs\.mode == 'connectivity' && !inputs\.confirm_paid_gpu/);
    assert.match(workflow, /inputs\.mode == 'render_plan' && !inputs\.confirm_paid_gpu/);
  });

  it('defines a 20-minute remote execution contract without adding a Blender command', () => {
    assert.equal(MAX_RUNTIME_MINUTES, 20);
    assert.equal(GITHUB_JOB_TIMEOUT_MINUTES, 25);
    assert.equal(REMOTE_RENDER_TIMEOUT_CONTRACT.hardDeadlineMinutes, 20);
    assert.equal(REMOTE_RENDER_TIMEOUT_CONTRACT.githubOuterTimeoutMinutes, 25);
    assert.equal(REMOTE_RENDER_TIMEOUT_CONTRACT.githubTimeoutIsOuterEmergencyGuardOnly, true);
    assert.equal(REMOTE_RENDER_TIMEOUT_CONTRACT.timeoutOrFailureMustFlowIntoPodCleanup, true);
    assert.equal(REMOTE_RENDER_TIMEOUT_CONTRACT.remoteBlenderCommandPresent, false);
    assert.equal(intendedPodName('42'), 'tivvlejoy-render-42');
    assert.equal(buildRemoteRenderDeadlineWrapper([]).ok, false);
    assert.match(workflow, /own hard MAX_RUNTIME_MINUTES=20 deadline/);
    assert.match(workflow, /outer emergency guard/);
    assert.equal(workflow.includes('blender -b'), false);
    assert.match(docs, /own hard 20-minute deadline/);
  });
});

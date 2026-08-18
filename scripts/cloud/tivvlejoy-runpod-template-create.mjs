/**
 * TivvleJoy RunPod template create.
 *
 * May POST exactly once to /v1/templates after a create-template gate.
 * Never creates a Pod, never launches a GPU, never PATCHes or DELETEs.
 * Never prints secrets, Authorization headers, or raw API bodies.
 */

import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GRAPHQL_URL,
  REQUIRED_IMAGE_NAME,
  REST_PODS_URL,
  REST_TEMPLATES_URL,
  SUGGESTED_CONTAINER_DISK_GB,
  SUGGESTED_TEMPLATE_NAME,
  SUGGESTED_VOLUME_IN_GB,
  isAllowedTemplateRead,
  isForbiddenRunpodMutation,
  normalizeTemplateList,
  redactSecrets,
} from './tivvlejoy-runpod-template-readiness.mjs';
import { assessTemplateCompatibilityWithProvenance as assessTemplateCompatibility } from './tivvlejoy-runpod-template-normalization.mjs';

export const CREATE_MODE = 'create-template';
export const REQUIRED_CREATE_PHRASE = 'CREATE_TIVVLEJOY_TEMPLATE_D791981A';
export const TEMPLATE_README =
  'TivvleJoy single-shot Blender 4.2.3 RunPod worker. Immutable worker image. Runtime job/R2 environment is injected only by the guarded launcher.';

export const ALLOWED_CREATE_PAYLOAD_KEYS = Object.freeze([
  'name',
  'imageName',
  'category',
  'containerDiskInGb',
  'dockerEntrypoint',
  'dockerStartCmd',
  'env',
  'isPublic',
  'isServerless',
  'ports',
  'readme',
  'volumeInGb',
  'volumeMountPath',
]);

export function evaluateCreateGate({ mode, phrase } = {}) {
  if (mode !== CREATE_MODE || phrase !== REQUIRED_CREATE_PHRASE) {
    return { ok: false, code: 'CREATE_GATE_REFUSED', reason: 'mode and exact create phrase are required.' };
  }
  return { ok: true, code: 'CREATE_GATE_OK', reason: null };
}

export function buildCreateTemplatePayload() {
  return {
    name: SUGGESTED_TEMPLATE_NAME,
    imageName: REQUIRED_IMAGE_NAME,
    category: 'NVIDIA',
    containerDiskInGb: SUGGESTED_CONTAINER_DISK_GB,
    dockerEntrypoint: [],
    dockerStartCmd: [],
    env: {},
    isPublic: false,
    isServerless: false,
    ports: [],
    readme: TEMPLATE_README,
    volumeInGb: SUGGESTED_VOLUME_IN_GB,
    volumeMountPath: '',
  };
}

function sameEmptyObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0;
}

function sameEmptyArray(value) {
  return Array.isArray(value) && value.length === 0;
}

export function validateCreateTemplatePayload(payload) {
  const reasons = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, reasons: ['PAYLOAD_MALFORMED'] };
  }
  const keys = Object.keys(payload);
  if (keys.some((key) => !ALLOWED_CREATE_PAYLOAD_KEYS.includes(key))) reasons.push('UNKNOWN_FIELD');
  if (ALLOWED_CREATE_PAYLOAD_KEYS.some((key) => !keys.includes(key))) reasons.push('MISSING_FIELD');
  if ('containerRegistryAuthId' in payload) reasons.push('REGISTRY_AUTH_FORBIDDEN');
  if (payload.name !== SUGGESTED_TEMPLATE_NAME) reasons.push('NAME_MISMATCH');
  if (payload.imageName !== REQUIRED_IMAGE_NAME) reasons.push('IMAGE_MISMATCH');
  if (typeof payload.imageName === 'string' && /:(latest|production|stable)(?:@|$)/.test(payload.imageName)) {
    reasons.push('MUTABLE_IMAGE_TAG');
  }
  if (payload.category !== 'NVIDIA') reasons.push('CATEGORY_NOT_NVIDIA');
  if (payload.containerDiskInGb !== SUGGESTED_CONTAINER_DISK_GB) reasons.push('CONTAINER_DISK_MISMATCH');
  if (!sameEmptyArray(payload.dockerEntrypoint)) reasons.push('ENTRYPOINT_OVERRIDE');
  if (!sameEmptyArray(payload.dockerStartCmd)) reasons.push('START_CMD_OVERRIDE');
  if (!sameEmptyObject(payload.env)) reasons.push('TEMPLATE_ENV_PRESENT');
  if (payload.isPublic !== false) reasons.push('PUBLIC');
  if (payload.isServerless !== false) reasons.push('SERVERLESS');
  if (!sameEmptyArray(payload.ports)) reasons.push('PORTS_PRESENT');
  if (payload.readme !== TEMPLATE_README) reasons.push('README_MISMATCH');
  if (payload.volumeInGb !== SUGGESTED_VOLUME_IN_GB) reasons.push('VOLUME_MISMATCH');
  if (payload.volumeMountPath !== '') reasons.push('VOLUME_MOUNT_MISMATCH');
  return { ok: reasons.length === 0, reasons };
}

export function sanitizeTemplateCreateSummary(payload) {
  const keys = payload && typeof payload.env === 'object' && payload.env ? Object.keys(payload.env) : [];
  return {
    name: payload?.name ?? null,
    imageName: payload?.imageName ?? null,
    category: payload?.category ?? null,
    containerDiskInGb: payload?.containerDiskInGb ?? null,
    dockerEntrypoint: Array.isArray(payload?.dockerEntrypoint) ? payload.dockerEntrypoint : [],
    dockerStartCmd: Array.isArray(payload?.dockerStartCmd) ? payload.dockerStartCmd : [],
    isPublic: payload?.isPublic ?? null,
    isServerless: payload?.isServerless ?? null,
    ports: Array.isArray(payload?.ports) ? payload.ports : [],
    envKeyCount: keys.length,
    envKeyNames: keys,
    volumeInGb: payload?.volumeInGb ?? null,
    volumeMountPath: payload?.volumeMountPath ?? null,
    hasReadme: typeof payload?.readme === 'string' && payload.readme.length > 0,
  };
}

export function sanitizeAttempt(url, method) {
  try {
    const parsed = new URL(String(url || ''), 'https://rest.runpod.io');
    return { method: String(method || 'GET').toUpperCase(), path: parsed.pathname };
  } catch {
    return { method: String(method || 'GET').toUpperCase(), path: '[invalid]' };
  }
}

export function isAllowedTemplateCreateRequest(url, method) {
  if (isAllowedTemplateRead(url, method)) return true;
  const verb = String(method || 'GET').toUpperCase();
  if (verb !== 'POST') return false;
  try {
    const parsed = new URL(String(url || ''), 'https://rest.runpod.io');
    return parsed.protocol === 'https:' && parsed.hostname === 'rest.runpod.io' && parsed.pathname === '/v1/templates';
  } catch {
    return false;
  }
}

export function wrapCreateFetch(innerFetch, recorder = { attempts: [] }) {
  return async function guardedFetch(url, opts = {}) {
    const method = String(opts.method || 'GET').toUpperCase();
    recorder.attempts.push({ url: String(url || ''), method, ...sanitizeAttempt(url, method) });
    if (!isAllowedTemplateCreateRequest(url, method) || (method !== 'POST' && isForbiddenRunpodMutation(url, method))) {
      const err = new Error('RunPod mutation or disallowed request attempted during template create.');
      err.code = 'TEMPLATE_MUTATION_TRIPWIRE';
      throw err;
    }
    if (method === 'POST' && !isAllowedTemplateCreateRequest(url, method)) {
      const err = new Error('RunPod mutation or disallowed request attempted during template create.');
      err.code = 'TEMPLATE_MUTATION_TRIPWIRE';
      throw err;
    }
    if (method === 'POST' && /\/templates\/[^/]+\/update/i.test(String(url || ''))) {
      const err = new Error('RunPod mutation or disallowed request attempted during template create.');
      err.code = 'TEMPLATE_MUTATION_TRIPWIRE';
      throw err;
    }
    return innerFetch(url, opts);
  };
}

export function createTemplateMutationTripwire(recorder = { attempts: [] }) {
  return wrapCreateFetch(async () => {
    const err = new Error('Network is disabled by the template-create tripwire.');
    err.code = 'NETWORK_DISABLED';
    throw err;
  }, recorder);
}

function emptyResult(overrides) {
  return {
    ok: false,
    code: 'API_ERROR',
    httpStatus: null,
    recoveryRequired: false,
    postCount: 0,
    preCreateCompatibleCount: 0,
    postCreateCompatibleCount: null,
    templateId: null,
    summary: null,
    payloadSummary: sanitizeTemplateCreateSummary(buildCreateTemplatePayload()),
    mutationAttempts: [],
    podCreated: false,
    gpuLaunched: false,
    templateUpdated: false,
    templateDeleted: false,
    endpointCreated: false,
    networkVolumeCreated: false,
    rawBodyLogged: false,
    secretExposed: false,
    reasons: [],
    ...overrides,
  };
}

async function readJsonSilently(response) {
  let text;
  try {
    text = await response.text();
  } catch {
    return { ok: false, parsed: null };
  }
  try {
    return { ok: true, parsed: JSON.parse(text) };
  } catch {
    return { ok: false, parsed: null };
  }
}

function authHeaders(apiKey) {
  return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
}

export function extractTemplateId(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (typeof parsed.id === 'string' && parsed.id.trim()) return parsed.id.trim();
  return null;
}

export function isUncertainCreateStatus(status) {
  return [408, 409, 429, 500, 502, 503].includes(Number(status));
}

export function looksLikeVolumeRejection(status, parsed) {
  if (Number(status) !== 400 && Number(status) !== 422) return false;
  const text = redactSecrets(JSON.stringify(parsed || {})).toLowerCase();
  return /volume/.test(text);
}

export function intendedIdentityMatches(template) {
  return (
    template &&
    typeof template === 'object' &&
    template.name === SUGGESTED_TEMPLATE_NAME &&
    template.imageName === REQUIRED_IMAGE_NAME
  );
}

async function fetchTemplateList(safeFetch, apiKey) {
  const response = await safeFetch(REST_TEMPLATES_URL, { method: 'GET', headers: authHeaders(apiKey) });
  if (response.status < 200 || response.status > 299) {
    return { ok: false, status: response.status, items: null, code: 'API_ERROR' };
  }
  const { ok, parsed } = await readJsonSilently(response);
  const items = ok ? normalizeTemplateList(parsed) : null;
  if (!items) return { ok: false, status: response.status, items: null, code: 'MALFORMED_RESPONSE' };
  return { ok: true, status: response.status, items, code: 'OK' };
}

function classifyListed(items) {
  const assessed = items.map((item) => ({ item, ...assessTemplateCompatibility(item) }));
  const compatible = assessed.filter((entry) => entry.compatible);
  return { assessed, compatible };
}

export async function recoverTemplateCreation({ fetchFn, apiKey, recorder = { attempts: [] } }) {
  const safeFetch = wrapCreateFetch(fetchFn, recorder);
  const listed = await fetchTemplateList(safeFetch, apiKey);
  if (!listed.ok) {
    return { code: 'TEMPLATE_CREATE_UNCERTAIN', matches: [], compatible: [], listed };
  }
  const identity = listed.items.filter(intendedIdentityMatches);
  const compatible = identity.filter((item) => assessTemplateCompatibility(item).compatible);
  if (identity.length > 1) return { code: 'AMBIGUOUS_TEMPLATE_MATCH', matches: identity, compatible, listed };
  if (identity.length === 0) return { code: 'TEMPLATE_CREATE_UNCERTAIN', matches: [], compatible, listed };
  if (compatible.length === 1) return { code: 'RECOVERED_CREATED_TEMPLATE', matches: identity, compatible, listed };
  return { code: 'CREATED_TEMPLATE_INCOMPATIBLE', matches: identity, compatible, listed };
}

export async function createTemplateGuarded({
  mode,
  phrase,
  env = process.env,
  fetchFn = globalThis.fetch,
  log = () => {},
  mutationRecorder = { attempts: [] },
} = {}) {
  const say = (line) => log(redactSecrets(line));
  const gate = evaluateCreateGate({ mode, phrase });
  if (!gate.ok) {
    say('CREATE GATE: REFUSE');
    return emptyResult({ code: gate.code, reasons: [gate.reason], mutationAttempts: [] });
  }

  const apiKey = typeof env.RUNPOD_API_KEY === 'string' ? env.RUNPOD_API_KEY.trim() : '';
  if (!apiKey) {
    return emptyResult({ code: 'MISSING_API_KEY', reasons: ['RUNPOD_API_KEY is not configured.'] });
  }

  const payload = buildCreateTemplatePayload();
  const validated = validateCreateTemplatePayload(payload);
  if (!validated.ok) {
    return emptyResult({ code: 'PAYLOAD_INVALID', reasons: validated.reasons });
  }

  const recorder = mutationRecorder;
  const safeFetch = wrapCreateFetch(fetchFn, recorder);
  const attempts = () => recorder.attempts.map((attempt) => sanitizeAttempt(attempt.url, attempt.method));

  try {
    const listed = await fetchTemplateList(safeFetch, apiKey);
    if (!listed.ok) {
      return emptyResult({
        code: listed.code === 'MALFORMED_RESPONSE' ? 'API_ERROR' : 'API_ERROR',
        httpStatus: listed.status,
        reasons: [listed.code === 'MALFORMED_RESPONSE' ? 'MALFORMED_RESPONSE' : `GET /v1/templates failed with status ${listed.status}.`],
        mutationAttempts: attempts(),
      });
    }
    const pre = classifyListed(listed.items);
    const preCount = pre.compatible.length;
    const identity = listed.items.filter(intendedIdentityMatches);
    if (identity.length > 1) {
      say('PRE-CREATE: AMBIGUOUS_TEMPLATE_MATCH');
      return emptyResult({
        code: 'AMBIGUOUS_TEMPLATE_MATCH',
        preCreateCompatibleCount: preCount,
        postCreateCompatibleCount: preCount,
        reasons: ['Multiple templates share the intended name and image. Do not guess.'],
        mutationAttempts: attempts(),
      });
    }
    if (identity.length === 1 && preCount === 0) {
      const assessed = assessTemplateCompatibility(identity[0]);
      say('PRE-CREATE: CREATED_TEMPLATE_INCOMPATIBLE');
      return emptyResult({
        code: 'CREATED_TEMPLATE_INCOMPATIBLE',
        preCreateCompatibleCount: 0,
        postCreateCompatibleCount: 0,
        templateId: assessed.summary?.templateId || identity[0].id || null,
        summary: assessed.summary,
        reasons: assessed.reasons.length ? assessed.reasons : ['Intended template already exists and is not compatible. No second POST.'],
        mutationAttempts: attempts(),
      });
    }
    if (preCount > 1) {
      say('PRE-CREATE: AMBIGUOUS_TEMPLATE_MATCH');
      return emptyResult({
        code: 'AMBIGUOUS_TEMPLATE_MATCH',
        preCreateCompatibleCount: preCount,
        postCreateCompatibleCount: preCount,
        reasons: ['Multiple compatible templates found. Do not guess.'],
        mutationAttempts: attempts(),
      });
    }
    if (preCount === 1) {
      const existing = pre.compatible[0];
      say('PRE-CREATE: ALREADY_READY');
      return emptyResult({
        ok: true,
        code: 'ALREADY_READY',
        preCreateCompatibleCount: 1,
        postCreateCompatibleCount: 1,
        templateId: existing.summary.templateId,
        summary: existing.summary,
        reasons: [],
        mutationAttempts: attempts(),
      });
    }

    let response;
    try {
      response = await safeFetch(REST_TEMPLATES_URL, {
        method: 'POST',
        headers: authHeaders(apiKey),
        body: JSON.stringify(payload),
      });
    } catch {
      const recovered = await recoverTemplateCreation({ fetchFn, apiKey, recorder });
      return finalizeRecovery(recovered, {
        recoveryRequired: true,
        postCount: 1,
        preCreateCompatibleCount: 0,
        mutationAttempts: attempts(),
        say,
      });
    }

    const status = response.status;
    const { ok: parsedOk, parsed } = await readJsonSilently(response);

    if (looksLikeVolumeRejection(status, parsedOk ? parsed : null)) {
      say('CREATE: TEMPLATE_VOLUME_CONFIGURATION_REJECTED');
      return emptyResult({
        code: 'TEMPLATE_VOLUME_CONFIGURATION_REJECTED',
        httpStatus: status,
        postCount: 1,
        preCreateCompatibleCount: 0,
        reasons: [`RunPod rejected volumeInGb=0 with status ${status}. No substitute volume was sent.`],
        mutationAttempts: attempts(),
      });
    }

    if (status === 401 || status === 403) {
      return emptyResult({
        code: 'API_ERROR',
        httpStatus: status,
        postCount: 1,
        preCreateCompatibleCount: 0,
        reasons: [`POST /v1/templates failed with status ${status}.`],
        mutationAttempts: attempts(),
      });
    }

    const success = status >= 200 && status <= 299;
    const createdId = success && parsedOk ? extractTemplateId(parsed) : null;
    const uncertain = !success || !parsedOk || !createdId || isUncertainCreateStatus(status);

    if (uncertain) {
      const recovered = await recoverTemplateCreation({ fetchFn, apiKey, recorder });
      return finalizeRecovery(recovered, {
        recoveryRequired: true,
        postCount: 1,
        preCreateCompatibleCount: 0,
        httpStatus: status,
        mutationAttempts: attempts(),
        say,
      });
    }

    const verified = await verifyCreatedTemplate({
      safeFetch,
      apiKey,
      templateId: createdId,
      say,
    });
    return {
      ...verified,
      httpStatus: status,
      recoveryRequired: false,
      postCount: 1,
      preCreateCompatibleCount: 0,
      payloadSummary: sanitizeTemplateCreateSummary(payload),
      mutationAttempts: attempts(),
      podCreated: false,
      gpuLaunched: false,
      templateUpdated: false,
      templateDeleted: false,
      endpointCreated: false,
      networkVolumeCreated: false,
      rawBodyLogged: false,
      secretExposed: false,
    };
  } catch (error) {
    if (error && error.code === 'TEMPLATE_MUTATION_TRIPWIRE') {
      say('MUTATION TRIPWIRE');
      return emptyResult({
        code: 'TEMPLATE_MUTATION_TRIPWIRE',
        reasons: ['RunPod mutation or disallowed request was refused.'],
        mutationAttempts: attempts(),
      });
    }
    return emptyResult({
      code: 'API_ERROR',
      reasons: ['Template create failed closed.'],
      mutationAttempts: attempts(),
    });
  }
}

async function verifyCreatedTemplate({ safeFetch, apiKey, templateId, say }) {
  const detail = await safeFetch(`${REST_TEMPLATES_URL}/${encodeURIComponent(templateId)}`, {
    method: 'GET',
    headers: authHeaders(apiKey),
  });
  if (detail.status < 200 || detail.status > 299) {
    return emptyResult({
      code: 'API_ERROR',
      templateId,
      reasons: [`GET /v1/templates/{id} failed with status ${detail.status}.`],
    });
  }
  const { ok, parsed } = await readJsonSilently(detail);
  if (!ok || !parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return emptyResult({
      code: 'API_ERROR',
      templateId,
      reasons: ['MALFORMED_RESPONSE'],
    });
  }
  const assessed = assessTemplateCompatibility(parsed);
  if (!assessed.compatible) {
    say('POST-CREATE: CREATED_TEMPLATE_INCOMPATIBLE');
    return emptyResult({
      code: 'CREATED_TEMPLATE_INCOMPATIBLE',
      templateId,
      summary: assessed.summary,
      reasons: assessed.reasons,
      postCreateCompatibleCount: 0,
    });
  }

  const listed = await fetchTemplateList(safeFetch, apiKey);
  if (!listed.ok) {
    return emptyResult({
      code: 'API_ERROR',
      templateId,
      summary: assessed.summary,
      reasons: ['Post-create template list failed.'],
    });
  }
  const post = classifyListed(listed.items);
  if (post.compatible.length !== 1) {
    say(`POST-CREATE COUNT=${post.compatible.length}`);
    return emptyResult({
      ok: false,
      code: post.compatible.length > 1 ? 'AMBIGUOUS_TEMPLATE_MATCH' : 'TEMPLATE_CREATE_UNCERTAIN',
      templateId,
      summary: assessed.summary,
      postCreateCompatibleCount: post.compatible.length,
      reasons: [`Post-create compatible count was ${post.compatible.length}, expected 1.`],
    });
  }
  say('POST-CREATE: COMPATIBLE count=1');
  return emptyResult({
    ok: true,
    code: 'CREATED',
    templateId,
    summary: assessed.summary,
    postCreateCompatibleCount: 1,
    reasons: [],
  });
}

function finalizeRecovery(recovered, extra) {
  extra.say(`RECOVERY: ${recovered.code}`);
  const { say: _say, ...rest } = extra;
  if (recovered.code === 'RECOVERED_CREATED_TEMPLATE') {
    const item = recovered.compatible[0];
    const assessed = assessTemplateCompatibility(item);
    return emptyResult({
      ok: true,
      code: 'RECOVERED_CREATED_TEMPLATE',
      templateId: assessed.summary.templateId,
      summary: assessed.summary,
      postCreateCompatibleCount: 1,
      ...rest,
      reasons: [],
    });
  }
  return emptyResult({
    code: recovered.code,
    templateId: recovered.matches[0]?.id || null,
    postCreateCompatibleCount: recovered.compatible.length,
    ...rest,
    reasons: [recovered.code],
  });
}

export function formatSanitizedCreateResult(result) {
  const lines = [
    `code=${result.code}`,
    `ok=${result.ok}`,
    `httpStatus=${result.httpStatus ?? ''}`,
    `recoveryRequired=${result.recoveryRequired}`,
    `postCount=${result.postCount}`,
    `preCreateCompatibleCount=${result.preCreateCompatibleCount}`,
    `postCreateCompatibleCount=${result.postCreateCompatibleCount ?? ''}`,
    `templateId=${result.templateId || ''}`,
    `podCreated=${result.podCreated}`,
    `gpuLaunched=${result.gpuLaunched}`,
  ];
  if (result.summary) {
    lines.push(
      [
        `templateName=${result.summary.templateName || ''}`,
        `imageName=${result.summary.imageName || ''}`,
        `category=${result.summary.category || ''}`,
        `isServerless=${result.summary.isServerless}`,
        `isPublic=${result.summary.isPublic}`,
        `dockerEntrypoint=${JSON.stringify(result.summary.dockerEntrypoint)}`,
        `dockerStartCmd=${JSON.stringify(result.summary.dockerStartCmd)}`,
        `ports=${JSON.stringify(result.summary.ports)}`,
        `envKeyCount=${result.summary.envKeyCount}`,
        `containerDiskInGb=${result.summary.containerDiskInGb}`,
        `volumeInGb=${result.summary.volumeInGb}`,
        `volumeMountPath=${result.summary.volumeMountPath || ''}`,
      ].join(' '),
    );
  }
  if (Array.isArray(result.mutationAttempts)) {
    lines.push(`mutationAttempts=${result.mutationAttempts.map((attempt) => `${attempt.method} ${attempt.path}`).join(',')}`);
  }
  return redactSecrets(lines.join('\n'));
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const mode = argv[0];
  const phrase = argv[1];
  const result = await createTemplateGuarded({
    mode,
    phrase,
    env,
    log: (line) => console.log(line),
  });
  console.log(formatSanitizedCreateResult(result));
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, `${formatSanitizedCreateResult(result)}\n`);
  }
  const okCodes = new Set(['CREATED', 'ALREADY_READY', 'RECOVERED_CREATED_TEMPLATE']);
  return okCodes.has(result.code) ? 0 : 1;
}

export const REST_CREATE_TEMPLATES_URL = REST_TEMPLATES_URL;
export const REST_CREATE_PODS_URL = REST_PODS_URL;
export const CREATE_GRAPHQL_URL = GRAPHQL_URL;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    () => process.exit(1),
  );
}

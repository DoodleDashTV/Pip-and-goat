/**
 * TivvleJoy RunPod template readiness audit.
 *
 * READ-ONLY. GET /v1/templates and GET /v1/templates/{id} only.
 * Never creates, patches, or deletes a template or Pod.
 * Never prints secrets, Authorization headers, or raw API bodies.
 */

import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const REST_TEMPLATES_URL = 'https://rest.runpod.io/v1/templates';
export const REST_PODS_URL = 'https://rest.runpod.io/v1/pods';
export const GRAPHQL_URL = 'https://api.runpod.io/graphql';

export const REQUIRED_IMAGE_NAME =
  'ghcr.io/doodledashtv/ddp-runpod-blender@sha256:d791981a4ed530214dcf96cb76593ad6e849c9e408672df36db102a52cdc1b25'; // pragma: allowlist secret
export const REQUIRED_IMAGE_DIGEST = 'sha256:d791981a4ed530214dcf96cb76593ad6e849c9e408672df36db102a52cdc1b25';
export const REQUIRED_SOURCE_COMMIT = '3d5fbf78d2b618a40f10ebbf6e24ed7c97079fd3';
export const REQUIRED_RENDER_CODE_SHA256 =
  '8210e3addd656e5d7c318dc8a66e82fe7b8ba5e1642c3f583fabbaf92a646aed';
export const REQUIRED_RENDER_ASSET_SHA256 =
  '7876ac737de602578b67a8a20d85ea8a917c7ac4dac5e668f8bae37343e8f4b7';
export const REQUIRED_BLENDER_VERSION = '4.2.3';
export const REQUIRED_DOCKERFILE_CMD = Object.freeze(['node', './src/worker.js']);
export const PERSISTENT_VOLUME_REQUIRED = false;
export const SUGGESTED_TEMPLATE_NAME = 'TivvleJoy Blender Worker - d791981a';
export const SUGGESTED_CONTAINER_DISK_GB = 50;
export const SUGGESTED_VOLUME_IN_GB = 0;

export const FORBIDDEN_TEMPLATE_ENV_KEYS = Object.freeze([
  'RUNPOD_API_KEY',
  'RUNPOD_RENDER_TEMPLATE_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'OBJECT_STORAGE_ACCESS_KEY_ID',
  'OBJECT_STORAGE_SECRET_ACCESS_KEY',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'VERCEL_TOKEN',
  'LAUNCH_TIVVLEJOY_GPU',
  'PAID_APPROVAL_PHRASE',
  'RENDER_JOB_ID',
  'JOB_ID',
  'MANIFEST_KEY',
  'WORKER_MANIFEST_KEY',
]);

export const DESIRED_TEMPLATE_PLAN = Object.freeze({
  name: SUGGESTED_TEMPLATE_NAME,
  imageName: REQUIRED_IMAGE_NAME,
  category: 'NVIDIA',
  isPublic: false,
  isServerless: false,
  dockerEntrypoint: [],
  dockerStartCmd: [],
  env: {},
  ports: [],
  containerDiskInGb: SUGGESTED_CONTAINER_DISK_GB,
  volumeInGb: SUGGESTED_VOLUME_IN_GB,
  volumeMountPath: '',
  persistentVolumeRequired: PERSISTENT_VOLUME_REQUIRED,
  posted: false,
  note: 'Non-mutating plan only. volumeInGb=0 is the smallest no-persistent-volume request. Do not POST this plan.',
});

export function templateIdIsConfigured(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function redactSecrets(text) {
  return String(text ?? '')
    .replace(/(Bearer\s+)\S+/gi, '$1[REDACTED]')
    .replace(/(gho_|ghp_|ghs_|github_pat_)[A-Za-z0-9_]+/g, '[REDACTED]')
    .replace(
      /(RUNPOD_API_KEY|R2_SECRET_ACCESS_KEY|R2_ACCESS_KEY_ID|OBJECT_STORAGE_SECRET_ACCESS_KEY|OBJECT_STORAGE_ACCESS_KEY_ID|GITHUB_TOKEN|GH_TOKEN|VERCEL_TOKEN)=([^\s]+)/g,
      '$1=[REDACTED]',
    );
}

export function isAllowedTemplateRead(url, method) {
  const verb = String(method || 'GET').toUpperCase();
  if (verb !== 'GET') return false;
  try {
    const parsed = new URL(String(url || ''), 'https://rest.runpod.io');
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'rest.runpod.io') return false;
    if (parsed.pathname === '/v1/templates') return true;
    return /^\/v1\/templates\/[^/]+$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function isForbiddenRunpodMutation(url, method) {
  const verb = String(method || 'GET').toUpperCase();
  const target = String(url || '');
  if (/api\.runpod\.io\/graphql/i.test(target)) return true;
  const mutating = verb === 'POST' || verb === 'PATCH' || verb === 'DELETE' || verb === 'PUT';
  if (/rest\.runpod\.io\/v1\/templates/i.test(target) && mutating) return true;
  if (/\/v1\/templates\/[^/]+\/update/i.test(target)) return true;
  if ((/rest\.runpod\.io\/v1\/pods/i.test(target) || /\/v1\/pods(?:\/|$|\?)/i.test(target)) && mutating) {
    return true;
  }
  return false;
}

export function createReadOnlyTemplateTripwire(recorder = { attempts: [] }) {
  return async function tripwireFetch(url, opts = {}) {
    const method = String(opts.method || 'GET').toUpperCase();
    recorder.attempts.push({ url: String(url || ''), method });
    if (!isAllowedTemplateRead(url, method) || isForbiddenRunpodMutation(url, method)) {
      const err = new Error('RunPod mutation or disallowed request attempted during template readiness audit.');
      err.code = 'TEMPLATE_MUTATION_TRIPWIRE';
      throw err;
    }
    const err = new Error('Network is disabled by the template-readiness tripwire.');
    err.code = 'NETWORK_DISABLED';
    throw err;
  };
}

export function wrapFetchWithTripwire(innerFetch, recorder = { attempts: [] }) {
  return async function guardedFetch(url, opts = {}) {
    const method = String(opts.method || 'GET').toUpperCase();
    recorder.attempts.push({ url: String(url || ''), method });
    if (!isAllowedTemplateRead(url, method) || isForbiddenRunpodMutation(url, method)) {
      const err = new Error('RunPod mutation or disallowed request attempted during template readiness audit.');
      err.code = 'TEMPLATE_MUTATION_TRIPWIRE';
      throw err;
    }
    return innerFetch(url, opts);
  };
}

export function assertNoTemplateMutation(recorder = { attempts: [] }) {
  const bad = (recorder.attempts || []).filter(
    (attempt) => !isAllowedTemplateRead(attempt.url, attempt.method) || isForbiddenRunpodMutation(attempt.url, attempt.method),
  );
  if (bad.length > 0) {
    const err = new Error('Template or Pod mutation tripwire fired.');
    err.code = 'TEMPLATE_MUTATION_TRIPWIRE';
    throw err;
  }
  return true;
}

function normalizeStringList(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return null;
}

export function envKeyNames(env) {
  if (env == null) return [];
  if (Array.isArray(env)) {
    return env
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        return entry.key || entry.name || null;
      })
      .filter(Boolean)
      .map(String);
  }
  if (typeof env === 'object') return Object.keys(env);
  return null;
}

function looksLikeMutableTag(imageName) {
  return /:(latest|production|stable)(?:@|$)/.test(imageName) || !/@sha256:[0-9a-f]{64}$/.test(imageName);
}

export function assessTemplateCompatibility(template) {
  const reasons = [];
  if (!template || typeof template !== 'object' || Array.isArray(template)) {
    return {
      compatible: false,
      reasons: ['MALFORMED_TEMPLATE'],
      summary: null,
    };
  }

  const imageName = typeof template.imageName === 'string' ? template.imageName : '';
  if (imageName !== REQUIRED_IMAGE_NAME) {
    reasons.push('IMAGE_MISMATCH');
    if (looksLikeMutableTag(imageName)) reasons.push('MUTABLE_IMAGE_TAG');
    if (imageName.includes('8204d4bffdc2d28dee6c313fc571e6fb5e3831a3d8ff241a29a536963ec1f830')) {
      reasons.push('STALE_IMAGE_DIGEST');
    }
  }
  if (template.category !== 'NVIDIA') reasons.push('CATEGORY_NOT_NVIDIA');
  if (template.isServerless !== false) reasons.push('SERVERLESS');
  if (template.isPublic !== false) reasons.push('PUBLIC');

  const entrypoint = normalizeStringList(template.dockerEntrypoint);
  const startCmd = normalizeStringList(template.dockerStartCmd);
  const ports = normalizeStringList(template.ports);
  const keys = envKeyNames(template.env);

  if (entrypoint === null) reasons.push('ENTRYPOINT_MALFORMED');
  else if (entrypoint.length > 0) reasons.push('ENTRYPOINT_OVERRIDE');

  if (startCmd === null) reasons.push('START_CMD_MALFORMED');
  else if (startCmd.length > 0) {
    reasons.push('START_CMD_OVERRIDE');
    const joined = startCmd.join(' ');
    if (/\bbash\b|\bsh\b|\-c\b/.test(joined)) reasons.push('SHELL_WRAPPER');
    if (/ssh|sshd/i.test(joined)) reasons.push('SSH_STARTUP');
    if (/jupyter/i.test(joined)) reasons.push('JUPYTER_STARTUP');
    if (/webui|gradio|streamlit/i.test(joined)) reasons.push('WEB_UI_STARTUP');
  }

  if (ports === null) reasons.push('PORTS_MALFORMED');
  else if (ports.length > 0) {
    reasons.push('PORTS_PRESENT');
    if (ports.some((port) => /^(22\/tcp|8080\/http|8888\/http)$/.test(port))) {
      reasons.push('FORBIDDEN_PORT');
    }
  }

  if (keys === null) reasons.push('ENV_MALFORMED');
  else if (keys.length > 0) {
    reasons.push('TEMPLATE_ENV_PRESENT');
    if (keys.some((key) => FORBIDDEN_TEMPLATE_ENV_KEYS.includes(key))) {
      reasons.push('FORBIDDEN_TEMPLATE_ENV');
    }
  }

  const summary = sanitizeTemplateSummary(template, {
    compatible: reasons.length === 0,
    reasons,
  });
  return { compatible: reasons.length === 0, reasons, summary };
}

export function sanitizeTemplateSummary(template, verdict = {}) {
  const keys = envKeyNames(template?.env) || [];
  return {
    templateConfigured: verdict.templateConfigured ?? null,
    templateId: typeof template?.id === 'string' ? template.id : null,
    templateName: typeof template?.name === 'string' ? template.name : null,
    imageName: typeof template?.imageName === 'string' ? template.imageName : null,
    category: typeof template?.category === 'string' ? template.category : null,
    isServerless: typeof template?.isServerless === 'boolean' ? template.isServerless : null,
    isPublic: typeof template?.isPublic === 'boolean' ? template.isPublic : null,
    containerDiskInGb: Number.isFinite(template?.containerDiskInGb) ? template.containerDiskInGb : null,
    volumeInGb: Number.isFinite(template?.volumeInGb) ? template.volumeInGb : null,
    volumeMountPath: typeof template?.volumeMountPath === 'string' ? template.volumeMountPath : null,
    dockerEntrypoint: normalizeStringList(template?.dockerEntrypoint) || [],
    dockerStartCmd: normalizeStringList(template?.dockerStartCmd) || [],
    ports: normalizeStringList(template?.ports) || [],
    envKeyNames: keys,
    envKeyCount: keys.length,
    persistentVolumeRequired: PERSISTENT_VOLUME_REQUIRED,
    compatibilityVerdict: verdict.compatible === true ? 'COMPATIBLE' : verdict.compatible === false ? 'INCOMPATIBLE' : null,
    reasons: Array.isArray(verdict.reasons) ? [...verdict.reasons] : [],
  };
}

export function normalizeTemplateList(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.templates)) return parsed.templates;
  return null;
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

function classifyHttpFailure(status) {
  if (status === 404) return 'NOT_FOUND';
  if ([401, 403, 429, 500, 502, 503].includes(status)) return 'API_ERROR';
  return 'API_ERROR';
}

function emptyResult(overrides) {
  return {
    ok: false,
    code: 'API_ERROR',
    templateConfigured: false,
    configuredTemplateId: null,
    compatibleCount: 0,
    summaries: [],
    desiredPlan: null,
    mutationAttempted: false,
    podCreated: false,
    gpuLaunched: false,
    templateCreated: false,
    templateUpdated: false,
    templateDeleted: false,
    rawBodyLogged: false,
    secretExposed: false,
    reasons: [],
    ...overrides,
  };
}

export async function auditTemplateReadiness({
  env = process.env,
  fetchFn = globalThis.fetch,
  log = () => {},
  mutationRecorder = { attempts: [] },
} = {}) {
  const say = (line) => log(redactSecrets(line));
  const apiKey = typeof env.RUNPOD_API_KEY === 'string' ? env.RUNPOD_API_KEY.trim() : '';
  const configuredId = templateIdIsConfigured(env.RUNPOD_RENDER_TEMPLATE_ID)
    ? String(env.RUNPOD_RENDER_TEMPLATE_ID).trim()
    : '';

  if (!apiKey) {
    return emptyResult({
      code: 'MISSING_API_KEY',
      templateConfigured: Boolean(configuredId),
      configuredTemplateId: configuredId || null,
      reasons: ['RUNPOD_API_KEY is not configured.'],
    });
  }

  const recorder = mutationRecorder;
  const safeFetch = wrapFetchWithTripwire(fetchFn, recorder);

  try {
    if (configuredId) {
      const url = `${REST_TEMPLATES_URL}/${encodeURIComponent(configuredId)}`;
      const response = await safeFetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (response.status === 404) {
        say('TEMPLATE LOOKUP: NOT_FOUND');
        return emptyResult({
          code: 'NOT_FOUND',
          templateConfigured: true,
          configuredTemplateId: configuredId,
          reasons: ['Configured RUNPOD_RENDER_TEMPLATE_ID was not found.'],
        });
      }
      if (response.status < 200 || response.status > 299) {
        say(`TEMPLATE LOOKUP: API_ERROR status=${response.status}`);
        return emptyResult({
          code: classifyHttpFailure(response.status),
          templateConfigured: true,
          configuredTemplateId: configuredId,
          reasons: [`GET /v1/templates/{id} failed with status ${response.status}.`],
        });
      }
      const { ok, parsed } = await readJsonSilently(response);
      if (!ok || !parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return emptyResult({
          code: 'API_ERROR',
          templateConfigured: true,
          configuredTemplateId: configuredId,
          reasons: ['MALFORMED_RESPONSE'],
        });
      }
      const assessed = assessTemplateCompatibility(parsed);
      const summary = { ...assessed.summary, templateConfigured: true, templateId: parsed.id || configuredId };
      say(`TEMPLATE LOOKUP: ${assessed.compatible ? 'READY' : 'INCOMPATIBLE'}`);
      return emptyResult({
        ok: assessed.compatible,
        code: assessed.compatible ? 'READY' : 'INCOMPATIBLE',
        templateConfigured: true,
        configuredTemplateId: configuredId,
        compatibleCount: assessed.compatible ? 1 : 0,
        summaries: [summary],
        reasons: assessed.reasons,
        desiredPlan: assessed.compatible ? null : DESIRED_TEMPLATE_PLAN,
      });
    }

    const response = await safeFetch(REST_TEMPLATES_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (response.status < 200 || response.status > 299) {
      say(`TEMPLATE LIST: API_ERROR status=${response.status}`);
      return emptyResult({
        code: classifyHttpFailure(response.status),
        reasons: [`GET /v1/templates failed with status ${response.status}.`],
      });
    }
    const { ok, parsed } = await readJsonSilently(response);
    const items = ok ? normalizeTemplateList(parsed) : null;
    if (!items) {
      return emptyResult({
        code: 'API_ERROR',
        reasons: ['MALFORMED_RESPONSE'],
      });
    }

    const assessed = items.map((item) => assessTemplateCompatibility(item));
    const compatible = assessed.filter((item) => item.compatible);
    const summaries = compatible.map((item) => ({ ...item.summary, templateConfigured: false }));

    if (compatible.length === 0) {
      say('TEMPLATE LOOKUP: TEMPLATE_REQUIRED');
      return emptyResult({
        code: 'TEMPLATE_REQUIRED',
        compatibleCount: 0,
        summaries: [],
        desiredPlan: DESIRED_TEMPLATE_PLAN,
        reasons: ['No compatible private Pod template uses the verified immutable worker image.'],
      });
    }
    if (compatible.length === 1) {
      say('TEMPLATE LOOKUP: TEMPLATE_CANDIDATE_FOUND');
      return emptyResult({
        ok: true,
        code: 'TEMPLATE_CANDIDATE_FOUND',
        compatibleCount: 1,
        summaries,
        reasons: [],
      });
    }
    say('TEMPLATE LOOKUP: AMBIGUOUS_TEMPLATE_MATCH');
    return emptyResult({
      code: 'AMBIGUOUS_TEMPLATE_MATCH',
      compatibleCount: compatible.length,
      summaries,
      reasons: ['Multiple compatible templates found. Do not guess.'],
    });
  } catch (error) {
    if (error && error.code === 'TEMPLATE_MUTATION_TRIPWIRE') {
      say('MUTATION TRIPWIRE');
      return emptyResult({
        code: 'TEMPLATE_MUTATION_TRIPWIRE',
        mutationAttempted: true,
        templateConfigured: Boolean(configuredId),
        configuredTemplateId: configuredId || null,
        reasons: ['RunPod mutation or disallowed request was refused.'],
      });
    }
    return emptyResult({
      code: 'API_ERROR',
      templateConfigured: Boolean(configuredId),
      configuredTemplateId: configuredId || null,
      reasons: ['Template lookup failed closed.'],
    });
  }
}

export function formatSanitizedAudit(result) {
  const lines = [
    `templateConfigured=${result.templateConfigured}`,
    `configuredTemplateId=${result.configuredTemplateId || ''}`,
    `compatibilityVerdict=${result.code}`,
    `compatibleCount=${result.compatibleCount}`,
    `PERSISTENT_VOLUME_REQUIRED=${PERSISTENT_VOLUME_REQUIRED}`,
    `mutationAttempted=${result.mutationAttempted}`,
    `templateCreated=${result.templateCreated}`,
    `podCreated=${result.podCreated}`,
  ];
  for (const summary of result.summaries || []) {
    lines.push(
      [
        `templateId=${summary.templateId || ''}`,
        `templateName=${summary.templateName || ''}`,
        `imageName=${summary.imageName || ''}`,
        `category=${summary.category || ''}`,
        `isServerless=${summary.isServerless}`,
        `isPublic=${summary.isPublic}`,
        `dockerEntrypoint=${JSON.stringify(summary.dockerEntrypoint)}`,
        `dockerStartCmd=${JSON.stringify(summary.dockerStartCmd)}`,
        `ports=${JSON.stringify(summary.ports)}`,
        `envKeyCount=${summary.envKeyCount}`,
        `envKeyNames=${summary.envKeyNames.join(',')}`,
        `containerDiskInGb=${summary.containerDiskInGb}`,
        `volumeInGb=${summary.volumeInGb}`,
        `volumeMountPath=${summary.volumeMountPath || ''}`,
        `reasons=${summary.reasons.join(',')}`,
      ].join(' '),
    );
  }
  if (result.desiredPlan) {
    lines.push(`desiredPlan.name=${result.desiredPlan.name}`);
    lines.push(`desiredPlan.imageName=${result.desiredPlan.imageName}`);
    lines.push(`desiredPlan.posted=${result.desiredPlan.posted}`);
    lines.push(`desiredPlan.volumeInGb=${result.desiredPlan.volumeInGb}`);
  }
  return redactSecrets(lines.join('\n'));
}

export function dockerfileCmdIsAuthoritative(repoRoot = REPO_ROOT) {
  const dockerfile = readFileSync(path.join(repoRoot, 'workers/runpod-blender/Dockerfile'), 'utf8');
  return dockerfile.includes('CMD ["node", "./src/worker.js"]');
}

async function main(argv = process.argv.slice(2), env = process.env) {
  if (argv[0] !== 'audit') {
    console.log('usage: node scripts/cloud/tivvlejoy-runpod-template-readiness.mjs audit');
    return 2;
  }
  const result = await auditTemplateReadiness({
    env,
    log: (line) => console.log(line),
  });
  console.log(formatSanitizedAudit(result));
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, `${formatSanitizedAudit(result)}\n`);
  }
  const classified = new Set([
    'READY',
    'INCOMPATIBLE',
    'NOT_FOUND',
    'TEMPLATE_REQUIRED',
    'TEMPLATE_CANDIDATE_FOUND',
    'AMBIGUOUS_TEMPLATE_MATCH',
  ]);
  return classified.has(result.code) ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    () => process.exit(1),
  );
}

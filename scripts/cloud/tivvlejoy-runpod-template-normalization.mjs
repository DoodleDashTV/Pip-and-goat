/**
 * Narrow semantic normalization for one trusted TivvleJoy RunPod template.
 *
 * Missing GET fields are never treated as false globally.
 * They may be filled only when identity, safety, and a sanitized
 * creation receipt all match the guarded POST that created rc8eyeqhn2.
 *
 * READ-ONLY. GET /v1/templates and GET /v1/templates/rc8eyeqhn2 only.
 * Never POST/PATCH/DELETE a template or Pod. Never prints secrets.
 */

import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT,
  TRUSTED_TEMPLATE_ID,
  receiptIsTrusted,
  receiptMatchesTemplate,
} from './tivvlejoy-runpod-template-creation-receipt.mjs';
import {
  DESIRED_TEMPLATE_PLAN,
  REQUIRED_IMAGE_NAME,
  REST_TEMPLATES_URL,
  SUGGESTED_CONTAINER_DISK_GB,
  SUGGESTED_TEMPLATE_NAME,
  assessTemplateCompatibility,
  auditTemplateReadiness,
  envKeyNames,
  formatSanitizedAudit,
  isAllowedTemplateRead,
  isForbiddenRunpodMutation,
  normalizeStringList,
  redactSecrets,
  sanitizeTemplateSummary,
  wrapFetchWithTripwire,
} from './tivvlejoy-runpod-template-readiness.mjs';

export {
  TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT,
  TRUSTED_TEMPLATE_ID,
  receiptIsTrusted,
  receiptMatchesTemplate,
} from './tivvlejoy-runpod-template-creation-receipt.mjs';

function fieldAbsent(object, key) {
  return !object || !Object.prototype.hasOwnProperty.call(object, key) || object[key] == null;
}

function unique(values) {
  return [...new Set(values)];
}

export function evaluateNormalizationEligibility(
  template,
  receipt = TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT,
) {
  const reasons = [];
  if (!template || typeof template !== 'object' || Array.isArray(template)) {
    return { eligible: false, reasons: ['MALFORMED_TEMPLATE'] };
  }
  if (typeof template.id !== 'string' || template.id.trim().length === 0) reasons.push('TEMPLATE_ID_MISSING');
  if (template.name !== SUGGESTED_TEMPLATE_NAME) reasons.push('NAME_MISMATCH');
  if (template.imageName !== REQUIRED_IMAGE_NAME) reasons.push('IMAGE_MISMATCH');
  if (template.category !== 'NVIDIA') reasons.push('CATEGORY_NOT_NVIDIA');

  const keys = envKeyNames(template.env);
  if (keys === null || keys.length > 0) reasons.push('UNEXPECTED_ENV');

  const ports = normalizeStringList(template.ports);
  if (ports === null || ports.length > 0) reasons.push('UNEXPECTED_PORTS');

  const entrypoint = normalizeStringList(template.dockerEntrypoint);
  if (entrypoint === null || entrypoint.length > 0) reasons.push('ENTRYPOINT_OVERRIDE');

  const startCmd = normalizeStringList(template.dockerStartCmd);
  if (startCmd === null || startCmd.length > 0) reasons.push('START_CMD_OVERRIDE');

  if (Number(template.containerDiskInGb) !== SUGGESTED_CONTAINER_DISK_GB) {
    reasons.push('CONTAINER_DISK_MISMATCH');
  }
  if (!receiptMatchesTemplate(template, receipt)) reasons.push('PROVENANCE_MISMATCH');

  return { eligible: reasons.length === 0, reasons };
}

export function applySemanticNormalization(template, receipt = TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT) {
  const next = { ...template };
  const fields = [];
  if (fieldAbsent(template, 'isPublic') && receipt.requestedIsPublic === false) {
    next.isPublic = false;
    fields.push('isPublic');
  }
  if (fieldAbsent(template, 'isServerless') && receipt.requestedIsServerless === false) {
    next.isServerless = false;
    fields.push('isServerless');
  }
  if (fieldAbsent(template, 'volumeInGb') && receipt.requestedVolumeInGb === 0) {
    next.volumeInGb = 0;
    fields.push('volumeInGb');
  }
  if (fieldAbsent(template, 'dockerEntrypoint')) {
    next.dockerEntrypoint = [];
    fields.push('dockerEntrypoint');
  }
  if (fieldAbsent(template, 'dockerStartCmd')) {
    next.dockerStartCmd = [];
    fields.push('dockerStartCmd');
  }
  if (fieldAbsent(template, 'ports')) {
    next.ports = [];
    fields.push('ports');
  }
  if (fieldAbsent(template, 'env')) {
    next.env = {};
    fields.push('env');
  }
  return { template: next, fields };
}

export function collectServiceDefaultObservations(template) {
  const observations = [];
  if (template?.startSsh === true) {
    observations.push({
      field: 'startSsh',
      value: true,
      source: 'runpod-default',
      inCreatePayload: false,
      podLaunched: false,
    });
  }
  if (template?.startJupyter === true) {
    observations.push({
      field: 'startJupyter',
      value: true,
      source: 'runpod-default',
      inCreatePayload: false,
      podLaunched: false,
    });
  }
  return observations;
}

function portLooksLike(ports, matcher) {
  return ports.some((port) => matcher.test(String(port)));
}

export function assessServiceDefaultRisks(template) {
  const reasons = [];
  const ports = normalizeStringList(template?.ports) || [];
  const startup = [
    ...(normalizeStringList(template?.dockerStartCmd) || []),
    ...(normalizeStringList(template?.dockerEntrypoint) || []),
  ].join(' ');

  if (template?.startSsh === true && portLooksLike(ports, /^(22)(\/|$)|ssh/i)) {
    reasons.push('START_SSH_EXPOSED');
  }
  if (template?.startJupyter === true && portLooksLike(ports, /^(8888)(\/|$)|jupyter/i)) {
    reasons.push('START_JUPYTER_EXPOSED');
  }
  if (template?.startSsh === true && /\bssh|\bsshd\b/i.test(startup)) {
    reasons.push('START_SSH_COMMAND');
  }
  if (template?.startJupyter === true && /jupyter/i.test(startup)) {
    reasons.push('START_JUPYTER_COMMAND');
  }
  return reasons;
}

export function assessPersistentVolumeEquivalence(template, receipt, provenanceMatched) {
  const reasons = [];
  const volumePresent = !fieldAbsent(template, 'volumeInGb');
  const volumeInGb = volumePresent && Number.isFinite(Number(template.volumeInGb)) ? Number(template.volumeInGb) : null;
  if (volumeInGb != null && volumeInGb > 0) {
    reasons.push('PERSISTENT_VOLUME');
    return reasons;
  }
  if (!volumePresent && !(provenanceMatched && receipt?.requestedVolumeInGb === 0)) {
    reasons.push('VOLUME_UNPROVEN');
  }
  return reasons;
}

export function assessTemplateCompatibilityWithProvenance(
  template,
  { receipt = TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT } = {},
) {
  if (!template || typeof template !== 'object' || Array.isArray(template)) {
    return {
      compatible: false,
      reasons: ['MALFORMED_TEMPLATE'],
      summary: null,
      observations: [],
      normalizationApplied: false,
      provenanceMatched: false,
      eligibility: { eligible: false, reasons: ['MALFORMED_TEMPLATE'] },
    };
  }

  const trustedReceipt = receiptIsTrusted(receipt) ? receipt : null;
  const observations = collectServiceDefaultObservations(template);
  const serviceRisks = assessServiceDefaultRisks(template);
  const eligibility = trustedReceipt
    ? evaluateNormalizationEligibility(template, trustedReceipt)
    : { eligible: false, reasons: ['PROVENANCE_MISMATCH'] };
  const provenanceMatched = Boolean(trustedReceipt && receiptMatchesTemplate(template, trustedReceipt));

  let working = template;
  let normalizedFields = [];
  let normalizationApplied = false;
  if (eligibility.eligible) {
    const applied = applySemanticNormalization(template, trustedReceipt);
    working = applied.template;
    normalizedFields = applied.fields;
    normalizationApplied = applied.fields.length > 0;
  }

  const assessed = assessTemplateCompatibility(working);
  const extra = [];
  if (fieldAbsent(template, 'isPublic') && !normalizationApplied) extra.push('PROVENANCE_REQUIRED');
  if (fieldAbsent(template, 'isServerless') && !normalizationApplied) extra.push('PROVENANCE_REQUIRED');
  extra.push(...assessPersistentVolumeEquivalence(template, trustedReceipt, eligibility.eligible));

  const reasons = unique([...assessed.reasons, ...serviceRisks, ...extra]);
  const compatible = reasons.length === 0;
  const summary = sanitizeTemplateSummary(working, { compatible, reasons });
  summary.startSsh = typeof template.startSsh === 'boolean' ? template.startSsh : null;
  summary.startJupyter = typeof template.startJupyter === 'boolean' ? template.startJupyter : null;
  summary.normalizationApplied = normalizationApplied;
  summary.normalizedFields = [...normalizedFields];
  summary.provenanceMatched = provenanceMatched;
  summary.observations = observations;
  summary.volumeMountPathObserved = typeof template.volumeMountPath === 'string' ? template.volumeMountPath : null;
  summary.persistentVolumeRequired = false;

  return {
    compatible,
    reasons,
    summary,
    observations,
    normalizationApplied,
    provenanceMatched,
    eligibility,
  };
}

function countMethods(recorder = { attempts: [] }) {
  const attempts = recorder.attempts || [];
  const count = (method) => attempts.filter((attempt) => attempt.method === method).length;
  return {
    getCount: count('GET'),
    postCount: count('POST'),
    patchCount: count('PATCH'),
    deleteCount: count('DELETE'),
  };
}

function emptyNormalizedResult(overrides) {
  return {
    ok: false,
    code: 'API_ERROR',
    templateConfigured: false,
    configuredTemplateId: null,
    compatibleCount: 0,
    summaries: [],
    observations: [],
    desiredPlan: null,
    mutationAttempted: false,
    podCreated: false,
    gpuLaunched: false,
    templateCreated: false,
    templateUpdated: false,
    templateDeleted: false,
    rawBodyLogged: false,
    secretExposed: false,
    getCount: 0,
    postCount: 0,
    patchCount: 0,
    deleteCount: 0,
    reasons: [],
    ...overrides,
  };
}

export async function auditNormalizedTemplateReadiness({
  env = process.env,
  fetchFn = globalThis.fetch,
  log = () => {},
  mutationRecorder = { attempts: [] },
  receipt = TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT,
} = {}) {
  const say = (line) => log(redactSecrets(line));
  const recorder = mutationRecorder;
  const assessFn = (template) => assessTemplateCompatibilityWithProvenance(template, { receipt });

  const listed = await auditTemplateReadiness({
    env: { ...env, RUNPOD_RENDER_TEMPLATE_ID: '' },
    fetchFn,
    log,
    mutationRecorder: recorder,
    assessFn,
  });

  if (!listed.ok && !['TEMPLATE_REQUIRED', 'AMBIGUOUS_TEMPLATE_MATCH', 'INCOMPATIBLE'].includes(listed.code)) {
    return emptyNormalizedResult({
      ...listed,
      ...countMethods(recorder),
    });
  }

  if (listed.code === 'AMBIGUOUS_TEMPLATE_MATCH') {
    say('NORMALIZED AUDIT: AMBIGUOUS_TEMPLATE_MATCH');
    return emptyNormalizedResult({
      ...listed,
      ...countMethods(recorder),
    });
  }

  const apiKey = typeof env.RUNPOD_API_KEY === 'string' ? env.RUNPOD_API_KEY.trim() : '';
  if (!apiKey) {
    return emptyNormalizedResult({
      code: 'MISSING_API_KEY',
      reasons: ['RUNPOD_API_KEY is not configured.'],
      ...countMethods(recorder),
    });
  }

  const safeFetch = wrapFetchWithTripwire(fetchFn, recorder);
  const detailUrl = `${REST_TEMPLATES_URL}/${encodeURIComponent(TRUSTED_TEMPLATE_ID)}`;
  let response;
  try {
    response = await safeFetch(detailUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch (error) {
    if (error && error.code === 'TEMPLATE_MUTATION_TRIPWIRE') {
      return emptyNormalizedResult({
        code: 'TEMPLATE_MUTATION_TRIPWIRE',
        mutationAttempted: true,
        reasons: ['RunPod mutation or disallowed request was refused.'],
        ...countMethods(recorder),
      });
    }
    return emptyNormalizedResult({
      code: 'API_ERROR',
      reasons: ['Template detail lookup failed closed.'],
      ...countMethods(recorder),
    });
  }

  if (response.status < 200 || response.status > 299) {
    say(`TEMPLATE DETAIL: API_ERROR status=${response.status}`);
    return emptyNormalizedResult({
      code: response.status === 404 ? 'NOT_FOUND' : 'API_ERROR',
      reasons: [`GET /v1/templates/${TRUSTED_TEMPLATE_ID} failed with status ${response.status}.`],
      ...countMethods(recorder),
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(await response.text());
  } catch {
    return emptyNormalizedResult({
      code: 'API_ERROR',
      reasons: ['MALFORMED_RESPONSE'],
      ...countMethods(recorder),
    });
  }

  const detail = assessFn(parsed);
  if (!detail.compatible || !detail.provenanceMatched) {
    say('NORMALIZED AUDIT: INCOMPATIBLE');
    return emptyNormalizedResult({
      code: 'INCOMPATIBLE',
      compatibleCount: 0,
      summaries: detail.summary ? [detail.summary] : [],
      observations: detail.observations || [],
      reasons: detail.reasons.length ? detail.reasons : ['Trusted template GET was not provenance-compatible.'],
      desiredPlan: DESIRED_TEMPLATE_PLAN,
      ...countMethods(recorder),
    });
  }

  const listReady =
    listed.ok &&
    listed.compatibleCount === 1 &&
    listed.summaries[0]?.templateId === TRUSTED_TEMPLATE_ID &&
    (listed.code === 'TEMPLATE_READY' || listed.code === 'TEMPLATE_CANDIDATE_FOUND');

  if (!listReady) {
    say('NORMALIZED AUDIT: EVIDENCE_INSUFFICIENT');
    return emptyNormalizedResult({
      code: 'EVIDENCE_INSUFFICIENT',
      compatibleCount: listed.compatibleCount,
      summaries: listed.summaries,
      observations: detail.observations || [],
      reasons: [
        `List audit was ${listed.code} with compatibleCount=${listed.compatibleCount}; detail GET is compatible. Do not guess.`,
      ],
      ...countMethods(recorder),
    });
  }

  say('NORMALIZED AUDIT: TEMPLATE_READY');
  return emptyNormalizedResult({
    ok: true,
    code: 'TEMPLATE_READY',
    compatibleCount: 1,
    summaries: [detail.summary],
    observations: detail.observations || [],
    reasons: [],
    ...countMethods(recorder),
  });
}

export function formatNormalizedAudit(result) {
  const lines = [
    formatSanitizedAudit(result),
    `TEMPLATE_READY=${result.code === 'TEMPLATE_READY'}`,
    `getCount=${result.getCount ?? 0}`,
    `postCount=${result.postCount ?? 0}`,
    `patchCount=${result.patchCount ?? 0}`,
    `deleteCount=${result.deleteCount ?? 0}`,
    `podCreated=${result.podCreated === true}`,
    `gpuLaunched=${result.gpuLaunched === true}`,
  ];
  return redactSecrets(lines.join('\n'));
}

export function assertNoNormalizedMutation(recorder = { attempts: [] }) {
  const bad = (recorder.attempts || []).filter(
    (attempt) => !isAllowedTemplateRead(attempt.url, attempt.method) || isForbiddenRunpodMutation(attempt.url, attempt.method),
  );
  if (bad.length > 0) {
    const err = new Error('Template or Pod mutation tripwire fired.');
    err.code = 'TEMPLATE_MUTATION_TRIPWIRE';
    throw err;
  }
  const counts = countMethods(recorder);
  if (counts.postCount !== 0 || counts.patchCount !== 0 || counts.deleteCount !== 0) {
    const err = new Error('Template or Pod mutation count was not zero.');
    err.code = 'TEMPLATE_MUTATION_TRIPWIRE';
    throw err;
  }
  return counts;
}

async function main(argv = process.argv.slice(2), env = process.env) {
  if (argv[0] !== 'audit') {
    console.log('usage: node scripts/cloud/tivvlejoy-runpod-template-normalization.mjs audit');
    return 2;
  }
  const result = await auditNormalizedTemplateReadiness({
    env,
    log: (line) => console.log(line),
  });
  console.log(formatNormalizedAudit(result));
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, `${formatNormalizedAudit(result)}\n`);
  }
  return result.code === 'TEMPLATE_READY' ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    () => process.exit(1),
  );
}

#!/usr/bin/env tsx
/**
 * Execute exactly one digest-bound V5 SECURE RTX 4090 Pod.
 *
 * The one-use ledger is made durable before the sole CREATE request. CREATE is
 * never retried. Cleanup retries are allowed because they only reduce spend.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { resolveObjectStorageConfig, type ObjectStorage } from '@doodle-dash/shared';
import { RunpodClient, type RunpodPodStatus } from '../../../packages/production/src/cloud/runpod-client';
import {
  GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V5,
  GOAT_V5_EXECUTION_ID,
  GOAT_V5_HARD_COST_USD,
  GOAT_V5_MAX_RUNTIME_MINUTES,
  GOAT_V5_PLANNED_POD_NAME,
  GOAT_V5_REQUIRED_DIGEST,
  GOAT_V5_STARTUP_WATCHDOG_MINUTES,
  GOAT_V5_STOP_NEW_STAGES_MINUTES,
  GoatV5PaidMutationTripwire,
  consumeGoatV5Authorization,
} from '../../../apps/web/src/lib/tivvlejoy-character-source-intake/goat-v5-authorization';
import { GOAT_CHARACTER_ID } from '../../../apps/web/src/lib/tivvlejoy-character-source-intake/goat-spec';
import { readCharacterWorkerPin } from '../../../apps/web/src/lib/tivvlejoy-character-source-intake/character-worker-pin-record';
import {
  FINAL_REPORT_FILE,
  LAUNCH_FILE,
  OUT_DIR,
  PREFLIGHT_FILE,
  REPO_ROOT,
  activePod,
  ensureOutputDir,
  makeStorage,
  readIssuedAuthorization,
  readJson,
  readJsonKey,
  redact,
  sleep,
  withTimeout,
  writeJson,
} from './common';

const POLL_MS = 15_000;
const CREATE_TIMEOUT_MS = 60_000;
const AMBIGUOUS_CREATE_RECOVERY_MS = 5 * 60_000;
const TERMINATION_CONFIRM_MS = 5 * 60_000;
const QA_DOWNLOAD_LIMIT_BYTES = 50 * 1024 * 1024;

function log(event: string, detail: Record<string, unknown> = {}) {
  console.log(JSON.stringify(redact({ ts: new Date().toISOString(), event, ...detail })));
}

function statusName(pod: RunpodPodStatus): string {
  return String(pod.desiredStatus || '').toUpperCase();
}

function actualCostUsd(startedAt: number, endedAt: number, hourlyRate: number): number {
  return Number((((endedAt - startedAt) / 3_600_000) * hourlyRate).toFixed(4));
}

function hardRuntimeMs(hourlyRate: number): number {
  const absolute = GOAT_V5_MAX_RUNTIME_MINUTES * 60_000;
  if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) return Math.min(absolute, 60_000);
  const costDerived = (GOAT_V5_HARD_COST_USD / hourlyRate) * 3_600_000 * 0.97;
  return Math.floor(Math.min(absolute, costDerived));
}

async function listPods(client: RunpodClient): Promise<RunpodPodStatus[]> {
  return withTimeout(client.listMyPods(), 30_000, 'RUNPOD_LIST_PODS');
}

async function persistRemoteConsumptionLedger(ledger: unknown): Promise<string> {
  const config = resolveObjectStorageConfig(process.env);
  if (config.provider !== 's3') throw new Error('DURABLE_R2_NOT_CONFIGURED');
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  const key = `tivvlejoy-assets/characters/${GOAT_CHARACTER_ID}/executions/${GOAT_V5_EXECUTION_ID}/launcher/consumption-ledger.json`;
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: Buffer.from(`${JSON.stringify(ledger, null, 2)}\n`),
      ContentType: 'application/json',
      IfNoneMatch: '*',
    }),
  );
  return key;
}

async function recoverExactNamedPod(client: RunpodClient): Promise<RunpodPodStatus | null> {
  const started = Date.now();
  while (Date.now() - started < AMBIGUOUS_CREATE_RECOVERY_MS) {
    const exact = (await listPods(client)).filter((pod) => pod.name === GOAT_V5_PLANNED_POD_NAME);
    if (exact.length > 1) throw new Error('MAX_POD_COUNT_VIOLATED');
    if (exact.length === 1) return exact[0];
    await sleep(10_000);
  }
  return null;
}

async function terminateWithConfirmation(client: RunpodClient, podIds: string[]) {
  const unique = [...new Set(podIds.filter(Boolean))];
  for (const podId of unique) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        log('terminate_pod', { podId, cleanupAttempt: attempt });
        await withTimeout(client.terminatePod(podId), 30_000, 'RUNPOD_TERMINATE');
        break;
      } catch (error) {
        log('terminate_error', { podId, cleanupAttempt: attempt, error: (error as Error).message });
        if (attempt < 3) await sleep(10_000);
      }
    }
  }

  const started = Date.now();
  let finalPods: RunpodPodStatus[] = [];
  while (Date.now() - started < TERMINATION_CONFIRM_MS) {
    try {
      finalPods = await listPods(client);
      const exact = finalPods.filter((pod) => pod.name === GOAT_V5_PLANNED_POD_NAME);
      const active = finalPods.filter(activePod);
      log('cleanup_poll', { exactNamePods: exact.length, activePods: active.length });
      if (exact.length === 0 && active.length === 0) {
        return { confirmed: true, exactNamePods: 0, activePods: 0, pods: finalPods };
      }
    } catch (error) {
      log('cleanup_poll_error', { error: (error as Error).message });
    }
    await sleep(10_000);
  }
  return {
    confirmed: false,
    exactNamePods: finalPods.filter((pod) => pod.name === GOAT_V5_PLANNED_POD_NAME).length,
    activePods: finalPods.filter(activePod).length,
    pods: finalPods,
  };
}

function safeRelative(value: string): string | null {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.startsWith('../') || normalized.includes('/../')) return null;
  return normalized;
}

async function downloadQaEvidence(storage: ObjectStorage, status: any) {
  if (!status?.manifestKey || !storage.readObject) return { manifest: null, localFiles: [] as string[] };
  const manifest = await readJsonKey(storage, status.manifestKey);
  if (!manifest || !Array.isArray(manifest.files)) return { manifest, localFiles: [] as string[] };
  const qaRoot = path.join(OUT_DIR, 'qa');
  const localFiles: string[] = [];
  for (const file of manifest.files as Array<any>) {
    const relative = safeRelative(file.relativePath);
    if (!relative || !/\.(png|jpe?g|json)$/i.test(relative)) continue;
    if (Number(file.byteSize || 0) > QA_DOWNLOAD_LIMIT_BYTES) continue;
    const bytes = await withTimeout(storage.readObject(file.key), 60_000, 'R2_QA_DOWNLOAD');
    const observedSha = createHash('sha256').update(bytes).digest('hex');
    if (observedSha !== file.sha256 || bytes.byteLength !== Number(file.byteSize)) {
      throw new Error(`QA_READBACK_MISMATCH:${relative}`);
    }
    const destination = path.join(qaRoot, relative);
    if (!path.resolve(destination).startsWith(`${path.resolve(qaRoot)}${path.sep}`)) {
      throw new Error('QA_PATH_TRAVERSAL');
    }
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, bytes);
    localFiles.push(path.relative(REPO_ROOT, destination).replace(/\\/g, '/'));
  }
  return { manifest, localFiles };
}

function validateOutputManifest(manifest: any) {
  const relativePaths = new Set(
    Array.isArray(manifest?.files) ? manifest.files.map((file: any) => String(file.relativePath || '')) : [],
  );
  const requiredFiles = [
    'CHAR_GOAT_001_working_executed.blend',
    'export_qa.fbx',
    'render_qa.png',
    'render_qa_three_quarter.png',
    'render_qa_side.png',
    'goat_character_master_gate.json',
    'goat_live_department.json',
  ];
  const missingFiles = requiredFiles.filter((name) => !relativePaths.has(name));
  const result = manifest?.result;
  const materialize = result?.materialize;
  const department = result?.department;
  const failedConditions: string[] = [];
  if (manifest?.schema !== 'TIVVLEJOY_CHARACTER_EXECUTION_ARTIFACT_MANIFEST_V1') failedConditions.push('MANIFEST_SCHEMA');
  if (manifest?.executionId !== GOAT_V5_EXECUTION_ID || manifest?.jobId !== GOAT_V5_EXECUTION_ID) {
    failedConditions.push('EXECUTION_ID');
  }
  if (manifest?.characterId !== GOAT_CHARACTER_ID) failedConditions.push('CHARACTER_ID');
  if (manifest?.lockedSourceUploaded !== false) failedConditions.push('LOCKED_SOURCE_UPLOAD');
  if (manifest?.sourceWritesForbidden !== true || manifest?.productionWritesForbidden !== true) {
    failedConditions.push('WRITE_PROTECTIONS');
  }
  if (!Array.isArray(manifest?.files) || manifest.files.length < requiredFiles.length) failedConditions.push('FILE_COUNT');
  if (Number(manifest?.totalBytes || 0) <= 0) failedConditions.push('TOTAL_BYTES');
  if (missingFiles.length > 0) failedConditions.push('REQUIRED_FILES');
  if (result?.ok !== true || result?.goatProductionReady !== false) failedConditions.push('RESULT');
  if (result?.authorizedDownloadInvoked !== 1 || result?.networkDownloadInvoked !== true) {
    failedConditions.push('AUTHORIZED_DOWNLOAD_COUNT');
  }
  if (
    materialize?.ok !== true ||
    materialize?.observedSize !== 269512136 ||
    materialize?.observedSha256 !== 'f5e85122f5af476e07df58c884b16a9663e05aaeef668f4d218fb7a410162ea5' ||
    materialize?.streamed !== true ||
    materialize?.hashedWhileStreaming !== true
  ) {
    failedConditions.push('MATERIALIZED_SOURCE_IDENTITY');
  }
  if (
    department?.ok !== true ||
    department?.stageCount !== 26 ||
    department?.executeFlagPresent !== true ||
    department?.dryRunFlagPresent !== false ||
    department?.parsed?.realGoatSourceTested !== true
  ) {
    failedConditions.push('LIVE_DEPARTMENT_PROOF');
  }
  return { ok: failedConditions.length === 0, failedConditions, missingFiles };
}

async function run(): Promise<number> {
  ensureOutputDir();
  const preflight = spawnSync(
    'pnpm',
    ['--filter', '@doodle-dash/web', 'exec', 'tsx', '../../scripts/cloud/goat-paid-execution-v5/preflight.ts'],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 16_000_000,
      env: { ...process.env, ALLOW_PAID_GPU_LAUNCH: 'false', CLOUD_RENDER_ENABLED: 'false' },
    },
  );
  if (preflight.status !== 0) {
    log('preflight_refused', { exitCode: preflight.status, stderr: String(preflight.stderr || '').slice(-2000) });
    return preflight.status || 2;
  }
  const facts = readJson<any>(PREFLIGHT_FILE);
  if (facts.launchAllowed !== true || facts.status !== 'LAUNCH_AUTHORIZED') {
    log('preflight_not_authorized', { blockers: facts.remainingBlockers || [] });
    return 2;
  }

  const receipt = readIssuedAuthorization();
  const pin = readCharacterWorkerPin(REPO_ROOT);
  if (!pin.ref || pin.digest !== GOAT_V5_REQUIRED_DIGEST) throw new Error('V5_PIN_CHANGED_AFTER_PREFLIGHT');
  const quotedRate = Number(facts.quote?.secureUsdPerHr || 0);
  const storage = makeStorage();
  const readClient = new RunpodClient({
    env: { ...process.env, ALLOW_PAID_GPU_LAUNCH: 'false', CLOUD_RENDER_ENABLED: 'false' },
  });
  const before = await listPods(readClient);
  if (before.filter(activePod).length !== 0 || before.some((pod) => pod.name === GOAT_V5_PLANNED_POD_NAME)) {
    throw new Error('POD_ALREADY_PRESENT_AT_LAST_SECOND');
  }

  const podEnv: Record<string, string> = {
    R2_ENDPOINT: process.env.R2_ENDPOINT || process.env.OBJECT_STORAGE_ENDPOINT || '',
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || process.env.OBJECT_STORAGE_ACCESS_KEY_ID || '',
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY || '',
    R2_BUCKET: process.env.R2_BUCKET || process.env.OBJECT_STORAGE_BUCKET || '',
    OBJECT_STORAGE_PROVIDER: 'r2',
    CLOUD_RENDER_ENABLED: 'true',
    REQUIRE_GPU_HEALTH: 'true',
    ALLOW_CPU_DIAGNOSTIC_FALLBACK: 'false',
    ALLOW_WORKER_SELF_TERMINATE: 'false',
    RENDER_JOB_ID: GOAT_V5_EXECUTION_ID,
    RENDER_WORKER_ID: `tivvlejoy-${GOAT_V5_EXECUTION_ID}`,
    CHARACTER_JOB_KIND: 'CHARACTER_MASTER_BUILD',
    CHARACTER_EXECUTION_MODE: 'live',
    CHARACTER_EXECUTION_ID: GOAT_V5_EXECUTION_ID,
    CHARACTER_PERSIST_ARTIFACTS: 'true',
    CHARACTER_WORKSPACE_DIR: `/tmp/tivvlejoy-character/${GOAT_V5_EXECUTION_ID}`,
    CHARACTER_ARTIFACT_DIR: `/tmp/tivvlejoy-character/${GOAT_V5_EXECUTION_ID}/artifacts`,
    GOAT_ALLOW_REAL_DOWNLOAD: 'true',
    GOAT_PERFORM_REAL_DOWNLOAD: 'true',
    PAID_EXECUTION_AUTHORIZED: 'true',
    PAID_AUTHORIZATION_JSON: JSON.stringify(receipt),
    AUTHORIZED_IMAGE_DIGEST: GOAT_V5_REQUIRED_DIGEST,
    AUTHORIZED_IMAGE_REF: pin.ref,
    RUNPOD_WORKER_IMAGE: pin.ref,
    DDP_IMAGE_DIGEST: GOAT_V5_REQUIRED_DIGEST,
    MAX_JOB_RUNTIME_MINUTES: String(GOAT_V5_MAX_RUNTIME_MINUTES),
    CHARACTER_STOP_NEW_STAGES_MINUTES: String(GOAT_V5_STOP_NEW_STAGES_MINUTES),
    STARTUP_WATCHDOG_MS: String(GOAT_V5_STARTUP_WATCHDOG_MINUTES * 60_000),
    RUNPOD_GPU_HOURLY_RATE: String(quotedRate),
    R2_CONNECT_TIMEOUT_MS: '10000',
    R2_REQUEST_TIMEOUT_MS: '120000',
  };
  if (Object.values(podEnv).some((value) => value === '')) throw new Error('POD_ENV_INCOMPLETE');
  if ('RUNPOD_API_KEY' in podEnv || 'ALLOW_PAID_GPU_LAUNCH' in podEnv) throw new Error('POD_SECRET_POLICY_VIOLATION');

  if (process.env.GOAT_V5_LAUNCH_DRYRUN === '1') {
    log('dryrun_ok', {
      podName: GOAT_V5_PLANNED_POD_NAME,
      imageDigest: GOAT_V5_REQUIRED_DIGEST,
      podEnvKeys: Object.keys(podEnv).sort(),
      passesRunpodApiKey: false,
      passesAllowPaidGpuLaunch: false,
      authorizationConsumed: false,
      podCreateRequestCount: 0,
    });
    return 0;
  }

  // The ledger is consumed before entering the one and only CREATE mutation.
  const consumed = consumeGoatV5Authorization(REPO_ROOT);
  if (!consumed.ok) throw new Error(consumed.code);
  const remoteLedgerKey = await persistRemoteConsumptionLedger(consumed.ledger);
  const tripwire = new GoatV5PaidMutationTripwire();
  tripwire.authorizeSingleCreate({ launchAllowed: true, ledgerConsumed: true, existingPodCount: 0 });
  writeJson(
    LAUNCH_FILE,
    redact({
      schema: 'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_V5_LAUNCH_V1',
      status: 'AUTHORIZATION_CONSUMED_BEFORE_CREATE',
      authorization: GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V5,
      authorizationConsumed: true,
      remoteLedgerKey,
      createRequestCount: 0,
      confirmedPodCount: 0,
      plannedPodName: GOAT_V5_PLANNED_POD_NAME,
      digest: GOAT_V5_REQUIRED_DIGEST,
      goatProductionReady: false,
    }),
  );

  const paidEnv = { ...process.env, ALLOW_PAID_GPU_LAUNCH: 'true', CLOUD_RENDER_ENABLED: 'true' };
  const client = new RunpodClient({ env: paidEnv });
  let podId: string | null = null;
  let createStartedAt = Date.now();
  let finalStatus = 'CREATE_NOT_ENTERED';
  let terminalStatus: any = null;
  let actualRate = quotedRate;
  let cleanup = { confirmed: false, exactNamePods: 0, activePods: 0, pods: [] as RunpodPodStatus[] };
  let qa = { manifest: null as any, localFiles: [] as string[] };
  let outputContract = { ok: false, failedConditions: ['NOT_COMPLETE'], missingFiles: [] as string[] };

  process.env.ALLOW_PAID_GPU_LAUNCH = 'true';
  process.env.CLOUD_RENDER_ENABLED = 'true';
  try {
    log('create_entered', {
      createRequestOrdinal: 1,
      podName: GOAT_V5_PLANNED_POD_NAME,
      cloudType: 'SECURE',
      gpuTypeId: 'NVIDIA GeForce RTX 4090',
      gpuCount: 1,
      imageDigest: GOAT_V5_REQUIRED_DIGEST,
    });
    let createError: Error | null = null;
    try {
      const created = await withTimeout(
        client.createPodForBenchmark({
          name: GOAT_V5_PLANNED_POD_NAME,
          imageName: pin.ref,
          gpuTypeId: 'NVIDIA GeForce RTX 4090',
          gpuCount: 1,
          cloudType: 'SECURE',
          containerDiskInGb: 60,
          volumeInGb: 0,
          env: podEnv,
          confirmPaidLaunch: true,
        }),
        CREATE_TIMEOUT_MS,
        'RUNPOD_CREATE',
      );
      podId = created.podId;
    } catch (error) {
      createError = error as Error;
      log('create_response_ambiguous_or_failed', { error: createError.message, retry: false });
    }
    if (!podId) {
      const recovered = await recoverExactNamedPod(client);
      podId = recovered?.id || null;
    }
    if (!podId) {
      finalStatus = createError ? 'CREATE_FAILED_UNCONFIRMED_NO_RETRY' : 'CREATE_RETURNED_NO_POD_NO_RETRY';
      log('no_pod_confirmed', { finalStatus, authorizationConsumed: true, retry: false });
    } else {
      finalStatus = 'POD_CREATED';
      log('pod_confirmed', { podId, createRequestCount: tripwire.createRequestCount });
      writeJson(
        LAUNCH_FILE,
        redact({
          schema: 'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_V5_LAUNCH_V1',
          status: finalStatus,
          authorizationConsumed: true,
          remoteLedgerKey,
          createRequestCount: 1,
          confirmedPodCount: 1,
          podId,
          podName: GOAT_V5_PLANNED_POD_NAME,
          digest: GOAT_V5_REQUIRED_DIGEST,
          goatProductionReady: false,
        }),
      );

      let sawStartup = false;
      let stopDeadlineLogged = false;
      const startupKey = `jobs/${GOAT_V5_EXECUTION_ID}/startup-status.json`;
      const statusKey = `jobs/${GOAT_V5_EXECUTION_ID}/status.json`;
      for (;;) {
        const elapsedMs = Date.now() - createStartedAt;
        let pod: RunpodPodStatus | null = null;
        try {
          pod = (await listPods(client)).find((item) => item.id === podId) || null;
          if (pod?.costPerHr && pod.costPerHr > 0) actualRate = pod.costPerHr;
        } catch (error) {
          log('pod_poll_error', { error: (error as Error).message });
        }
        const [startup, status] = await Promise.all([
          readJsonKey(storage, startupKey),
          readJsonKey(storage, statusKey),
        ]);
        if (startup) sawStartup = true;
        if (status?.status === 'COMPLETE') {
          terminalStatus = status;
          finalStatus = 'COMPLETE_AWAITING_HUMAN_VISUAL_APPROVAL';
          log('character_complete', { manifestKey: status.manifestKey, outputPrefix: status.outputPrefix });
          break;
        }
        if (status?.status === 'FAILED') {
          terminalStatus = status;
          finalStatus = 'FAILED';
          log('character_failed', { code: status.code, outputPrefix: status.outputPrefix });
          break;
        }
        if (startup?.result === 'FAILED' && startup?.classification !== 'BOOTING') {
          terminalStatus = startup;
          finalStatus = 'STARTUP_FAILED';
          log('startup_failed', { classification: startup.classification, code: startup.code });
          break;
        }
        if (!sawStartup && elapsedMs >= GOAT_V5_STARTUP_WATCHDOG_MINUTES * 60_000) {
          finalStatus = 'STARTUP_WATCHDOG_TIMEOUT';
          log('startup_watchdog_expired', { elapsedMinutes: elapsedMs / 60_000 });
          break;
        }
        const hardMs = hardRuntimeMs(actualRate);
        const stopMs = Math.min(GOAT_V5_STOP_NEW_STAGES_MINUTES * 60_000, Math.max(60_000, hardMs - 15 * 60_000));
        if (!stopDeadlineLogged && elapsedMs >= stopMs) {
          stopDeadlineLogged = true;
          log('stop_new_stages_deadline', { elapsedMinutes: elapsedMs / 60_000, workerTimeoutArmed: true });
        }
        if (elapsedMs >= hardMs) {
          finalStatus = hardMs < GOAT_V5_MAX_RUNTIME_MINUTES * 60_000 ? 'HARD_COST_DEADLINE' : 'HARD_RUNTIME_DEADLINE';
          log('hard_delete_deadline', { elapsedMinutes: elapsedMs / 60_000, actualRate, finalStatus });
          break;
        }
        if (!pod && elapsedMs > 2 * 60_000) {
          finalStatus = 'POD_GONE_BEFORE_TERMINAL_EVIDENCE';
          log('pod_gone', { statusFound: Boolean(status), startupFound: Boolean(startup) });
          break;
        }
        log('monitor', {
          elapsedMinutes: Number((elapsedMs / 60_000).toFixed(2)),
          desiredStatus: pod ? statusName(pod) : null,
          startup: startup?.bootStage || null,
          characterStatus: status?.status || null,
          actualRate,
          estimatedCostUsd: actualCostUsd(createStartedAt, Date.now(), actualRate),
        });
        await sleep(POLL_MS);
      }
    }
  } finally {
    process.env.ALLOW_PAID_GPU_LAUNCH = 'false';
    process.env.CLOUD_RENDER_ENABLED = 'false';
    const cleanupIds = podId ? [podId] : [];
    try {
      const exact = (await listPods(readClient)).filter((pod) => pod.name === GOAT_V5_PLANNED_POD_NAME);
      cleanupIds.push(...exact.map((pod) => pod.id));
    } catch (error) {
      log('pre_cleanup_list_failed', { error: (error as Error).message });
    }
    cleanup = await terminateWithConfirmation(client, cleanupIds);
  }

  if (terminalStatus?.status === 'COMPLETE') {
    qa = await downloadQaEvidence(storage, terminalStatus);
    outputContract = validateOutputManifest(qa.manifest);
    if (!outputContract.ok) finalStatus = 'OUTPUT_CONTRACT_FAILED';
  }
  const endedAt = Date.now();
  const estimatedCost = podId ? actualCostUsd(createStartedAt, endedAt, actualRate) : 0;
  const finalReport = {
    schema: 'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_V5_FINAL_REPORT_V1',
    status: finalStatus,
    authorization: GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V5,
    authorizationConsumed: true,
    executionId: GOAT_V5_EXECUTION_ID,
    workerImageDigestUsed: GOAT_V5_REQUIRED_DIGEST,
    gpuTypeId: podId ? 'NVIDIA GeForce RTX 4090' : null,
    cloudType: podId ? 'SECURE' : null,
    createRequestCount: 1,
    confirmedPodCount: podId ? 1 : 0,
    podId,
    runtimeMinutes: podId ? Number(((endedAt - createStartedAt) / 60_000).toFixed(3)) : 0,
    actualHourlyRateUsd: podId ? actualRate : null,
    estimatedCostUsd: estimatedCost,
    hardCostUsd: GOAT_V5_HARD_COST_USD,
    withinCostAuthorization: estimatedCost <= GOAT_V5_HARD_COST_USD,
    cleanup: {
      confirmed: cleanup.confirmed,
      exactNamePodsRemaining: cleanup.exactNamePods,
      activePodsRemaining: cleanup.activePods,
    },
    terminalStatus,
    artifactManifest: qa.manifest,
    outputContract,
    qaFilesDownloaded: qa.localFiles,
    lockedSourceOverwritten: false,
    productionMutationCount: 0,
    goatProductionReady: false,
    characterMasterGate: 'BLOCKED_PENDING_HUMAN_VISUAL_APPROVAL',
    humanVisualApprovalRequired: true,
  };
  writeJson(FINAL_REPORT_FILE, redact(finalReport));
  writeJson(LAUNCH_FILE, redact({ ...finalReport, schema: 'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_V5_LAUNCH_V1' }));
  console.log(JSON.stringify(redact(finalReport), null, 2));
  if (!cleanup.confirmed || estimatedCost > GOAT_V5_HARD_COST_USD) return 3;
  return finalStatus === 'COMPLETE_AWAITING_HUMAN_VISUAL_APPROVAL' ? 0 : 2;
}

run()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    process.env.ALLOW_PAID_GPU_LAUNCH = 'false';
    process.env.CLOUD_RENDER_ENABLED = 'false';
    const failed = {
      schema: 'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_V5_LAUNCH_V1',
      status: 'FAIL_CLOSED',
      code: (error as { code?: string }).code || (error as Error).message,
      goatProductionReady: false,
    };
    writeJson(LAUNCH_FILE, redact(failed));
    console.error(JSON.stringify(redact(failed), null, 2));
    process.exitCode = 1;
  });

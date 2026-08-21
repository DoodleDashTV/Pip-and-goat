import { createHash } from 'node:crypto';
import { GET as getEp012Audio } from '../../apps/web/src/app/api/voice-production/ep012/audio/route';
import { POST as postEp012Generate } from '../../apps/web/src/app/api/voice-production/ep012/generate/route';
import { GET as getEp012Preflight } from '../../apps/web/src/app/api/voice-production/ep012/preflight/route';
import type { Ep012PublicReceipt } from '../../apps/web/src/lib/tivvlejoy-real-production-unblock/ep012-audio-storage';
import type { Ep012NoProviderPreflight } from '../../apps/web/src/lib/tivvlejoy-real-production-unblock/ep012-no-provider-preflight';
import type { Ep012PaidVoiceExecutionResult } from '../../apps/web/src/lib/tivvlejoy-real-production-unblock/ep012-paid-voice-execution';

const REQUIRED_BRANCH = 'cursor/tivvlejoy-ep012-preview-ledger-migration-73f1';
const REQUIRED_ORG_ID = 'team_SKbKndUqqNWtp29jHlMG5Otl';
const REQUIRED_PROJECT_ID = 'prj_yKQw8QFb9Bkzc9NoouV0cCHYn9SK';
const REQUIRED_AUTHORIZATION = 'DL_HOOK_01__GOAT_ONE_PAID_ATTEMPT_NO_RETRY';
const TARGET_SEGMENT_ID = 'DL_HOOK_01__GOAT';
const TARGET_CHARACTER_COUNT = 34;
const EXPECTED_BEFORE = { requests: 5, characters: 286 } as const;
const EXPECTED_AFTER = { requests: 6, characters: 320 } as const;

type CanaryPlan =
  | { action: 'skip'; reason: 'BRANCH_NOT_AUTHORIZED' | 'NON_PREVIEW_RUNTIME' }
  | { action: 'execute'; host: string; token: string };
type SkipPlan = Extract<CanaryPlan, { action: 'skip' }>;

type SanitizedCanaryResult = {
  status: 'SUCCEEDED';
  segmentId: typeof TARGET_SEGMENT_ID;
  providerRequestsMade: 1;
  storageVerified: true;
  audioSha256: string;
  audioBytes: number;
  globalPaidRequests: 6;
  globalPaidCharactersUsed: 320;
  ep012SucceededRequests: 2;
  ep012SucceededCharacters: 85;
  reservations: 0;
  unfinalized: 0;
  failedAttempts: 0;
};

function fail(code: string): never {
  const error = new Error(code);
  error.name = 'TivvleJoyEp012SinglePaidCanaryError';
  throw error;
}

function value(env: NodeJS.ProcessEnv, name: string): string {
  return String(env[name] ?? '').trim();
}

function planCanary(env: NodeJS.ProcessEnv): CanaryPlan {
  if (value(env, 'VERCEL_GIT_COMMIT_REF') !== REQUIRED_BRANCH) {
    return { action: 'skip', reason: 'BRANCH_NOT_AUTHORIZED' };
  }
  if (value(env, 'VERCEL_ENV') !== 'preview') {
    return { action: 'skip', reason: 'NON_PREVIEW_RUNTIME' };
  }
  if (value(env, 'VERCEL_ORG_ID') !== REQUIRED_ORG_ID) fail('VERCEL_ORG_MISMATCH');
  if (value(env, 'VERCEL_PROJECT_ID') !== REQUIRED_PROJECT_ID) fail('VERCEL_PROJECT_MISMATCH');
  if (value(env, 'TIVVLEJOY_EP012_CANARY_AUTHORIZATION') !== REQUIRED_AUTHORIZATION) {
    fail('CANARY_AUTHORIZATION_MISMATCH');
  }

  const host = value(env, 'VERCEL_URL').replace(/^https?:\/\//, '').split('/')[0];
  if (!/^[a-z0-9-]+\.vercel\.app$/.test(host)) fail('VERCEL_PREVIEW_HOST_INVALID');
  const token = value(env, 'TIVVLEJOY_VOICE_TEST_TOKEN');
  if (!token) fail('VOICE_TEST_TOKEN_MISSING');
  return { action: 'execute', host, token };
}

async function jsonBody<T>(response: Response, code: string): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    fail(code);
  }
}

function targetCheck(preflight: Ep012NoProviderPreflight) {
  const check = preflight.requestChecks.find((item) => item.segmentId === TARGET_SEGMENT_ID);
  if (!check) fail('TARGET_REQUEST_CHECK_MISSING');
  return check;
}

function assertZeroRecoveryState(preflight: Ep012NoProviderPreflight, stage: string): void {
  if (
    preflight.ledger.failedAttempts !== 0 ||
    preflight.ledger.reservedRequests !== 0 ||
    preflight.ledger.reservedCharacters !== 0 ||
    preflight.ledger.unfinalizedCount !== 0 ||
    preflight.ledger.reservations !== 0 ||
    preflight.ledger.unfinalized !== 0 ||
    preflight.ledger.recoveryRequired !== 0
  ) {
    fail(`${stage}_RECOVERY_STATE_NOT_ZERO`);
  }
}


function assertPriorPipSucceeded(preflight: Ep012NoProviderPreflight): void {
  const prior = preflight.requestChecks.find((item) => item.segmentId === 'DL_HOOK_01__PIP');
  if (
    !prior ||
    prior.characterCount !== 51 ||
    prior.ledgerEntryStatus !== 'SUCCEEDED' ||
    prior.eligibility !== 'ALREADY_SUCCEEDED' ||
    !prior.passed ||
    prior.blockers.length !== 0
  ) {
    fail('PRIOR_PIP_SEGMENT_STATE_MISMATCH');
  }
}

function assertBefore(preflight: Ep012NoProviderPreflight): void {
  assertPriorPipSucceeded(preflight);
  const check = targetCheck(preflight);
  if (
    !preflight.ok ||
    preflight.status !== 'READY' ||
    preflight.blockers.length !== 0 ||
    !preflight.serverGates.previewOnlyRuntime ||
    preflight.serverGates.productionRuntime ||
    !preflight.serverGates.executionLedgerReadable ||
    !preflight.serverGates.allPassed ||
    !preflight.ledger.executionLedgerReadable ||
    !preflight.ledger.allPassed ||
    !preflight.readyForProviderContact ||
    !preflight.nextProviderContactPermitted ||
    preflight.ledger.globalPaidRequests !== EXPECTED_BEFORE.requests ||
    preflight.ledger.globalPaidCharactersUsed !== EXPECTED_BEFORE.characters ||
    preflight.ledger.ep012SucceededRequests !== 1 ||
    preflight.ledger.ep012SucceededCharacters !== 51 ||
    preflight.ledger.providerRequestsMade !== 1 ||
    preflight.ledger.storageVerifiedCount !== 1 ||
    check.characterCount !== TARGET_CHARACTER_COUNT ||
    check.ledgerEntryStatus !== 'ABSENT' ||
    check.eligibility !== 'ELIGIBLE' ||
    !check.passed ||
    check.blockers.length !== 0
  ) {
    fail('PRECHECK_IDENTITY_MISMATCH');
  }
  assertZeroRecoveryState(preflight, 'PRECHECK');
}

function assertGeneration(result: Ep012PaidVoiceExecutionResult): asserts result is Ep012PaidVoiceExecutionResult & {
  status: 'SUCCEEDED';
  audioSha256: string;
  audioBytes: number;
  receipt: Ep012PublicReceipt;
} {
  if (
    !result.ok ||
    result.status !== 'SUCCEEDED' ||
    result.segmentId !== TARGET_SEGMENT_ID ||
    result.characterCount !== TARGET_CHARACTER_COUNT ||
    result.idempotentReplay ||
    !result.storageVerified ||
    !/^[a-f0-9]{64}$/.test(String(result.audioSha256 ?? '')) ||
    !Number.isInteger(result.audioBytes) ||
    Number(result.audioBytes) <= 0 ||
    !result.receipt ||
    !result.providerContacted ||
    result.providerRequestsMade !== 1 ||
    result.sceneryAccessed ||
    result.sceneryRequestsMade !== 0 ||
    result.commercialBytesDownloaded !== 0 ||
    result.dialogueLockMutated ||
    result.productionEnabled
  ) {
    fail('GENERATE_RESULT_MISMATCH');
  }
}

function assertReceipt(receipt: Ep012PublicReceipt, generated: Ep012PaidVoiceExecutionResult & {
  audioSha256: string;
  audioBytes: number;
  receipt: Ep012PublicReceipt;
}): void {
  if (
    receipt.episodeId !== 'EP012' ||
    receipt.segmentId !== TARGET_SEGMENT_ID ||
    receipt.requestId !== generated.requestId ||
    receipt.characterCount !== TARGET_CHARACTER_COUNT ||
    receipt.audioSha256 !== generated.audioSha256 ||
    receipt.audioBytes !== generated.audioBytes ||
    !receipt.storageVerified ||
    receipt.alignment.characterCount !== TARGET_CHARACTER_COUNT ||
    !receipt.alignment.hasStartTimes ||
    !receipt.alignment.hasEndTimes ||
    receipt.productionEnabled
  ) {
    fail('RECEIPT_VERIFICATION_MISMATCH');
  }
}

function assertAfter(preflight: Ep012NoProviderPreflight): void {
  assertPriorPipSucceeded(preflight);
  const check = targetCheck(preflight);
  if (
    !preflight.ok ||
    preflight.status !== 'READY' ||
    preflight.blockers.length !== 0 ||
    !preflight.serverGates.executionLedgerReadable ||
    !preflight.serverGates.allPassed ||
    !preflight.ledger.executionLedgerReadable ||
    !preflight.ledger.allPassed ||
    !preflight.readyForProviderContact ||
    !preflight.nextProviderContactPermitted ||
    preflight.ledger.globalPaidRequests !== EXPECTED_AFTER.requests ||
    preflight.ledger.globalPaidCharactersUsed !== EXPECTED_AFTER.characters ||
    preflight.ledger.ep012SucceededRequests !== 2 ||
    preflight.ledger.ep012SucceededCharacters !== 85 ||
    preflight.ledger.providerRequestsMade !== 2 ||
    preflight.ledger.storageVerifiedCount !== 2 ||
    check.characterCount !== TARGET_CHARACTER_COUNT ||
    check.ledgerEntryStatus !== 'SUCCEEDED' ||
    check.eligibility !== 'ALREADY_SUCCEEDED' ||
    !check.passed ||
    check.blockers.length !== 0
  ) {
    fail('POSTCHECK_IDENTITY_MISMATCH');
  }
  assertZeroRecoveryState(preflight, 'POSTCHECK');
}

function authorizedHeaders(host: string, token: string): Headers {
  return new Headers({
    'content-type': 'application/json',
    origin: `https://${host}`,
    host,
    'x-tivvlejoy-voice-test-token': token,
  });
}

async function runCanary(env: NodeJS.ProcessEnv): Promise<SanitizedCanaryResult | SkipPlan> {
  const plan = planCanary(env);
  if (plan.action === 'skip') return plan;

  const beforeResponse = await getEp012Preflight();
  if (beforeResponse.status !== 200) fail('PRECHECK_HTTP_STATUS_MISMATCH');
  const before = await jsonBody<Ep012NoProviderPreflight>(beforeResponse, 'PRECHECK_JSON_INVALID');
  assertBefore(before);

  const origin = `https://${plan.host}`;
  const headers = authorizedHeaders(plan.host, plan.token);
  const generateRequest = new Request(`${origin}/api/voice-production/ep012/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ segmentId: TARGET_SEGMENT_ID, confirmed: true }),
  });

  // This is the single authorized paid call. There is no retry or loop around it.
  const generateResponse = await postEp012Generate(generateRequest);
  const generated = await jsonBody<Ep012PaidVoiceExecutionResult>(generateResponse, 'GENERATE_JSON_INVALID');
  if (generateResponse.status !== 200) fail(`GENERATE_HTTP_${generateResponse.status}`);
  assertGeneration(generated);

  const receiptRequest = new Request(
    `${origin}/api/voice-production/ep012/audio?segmentId=${TARGET_SEGMENT_ID}&kind=receipt`,
    { method: 'GET', headers },
  );
  const receiptResponse = await getEp012Audio(receiptRequest);
  if (receiptResponse.status !== 200) fail('RECEIPT_HTTP_STATUS_MISMATCH');
  const receipt = await jsonBody<Ep012PublicReceipt>(receiptResponse, 'RECEIPT_JSON_INVALID');
  assertReceipt(receipt, generated);

  const mp3Request = new Request(
    `${origin}/api/voice-production/ep012/audio?segmentId=${TARGET_SEGMENT_ID}&kind=mp3`,
    { method: 'GET', headers },
  );
  const mp3Response = await getEp012Audio(mp3Request);
  if (mp3Response.status !== 200 || mp3Response.headers.get('content-type') !== 'audio/mpeg') {
    fail('MP3_HTTP_CONTRACT_MISMATCH');
  }
  if (mp3Response.headers.get('x-ep012-segment-id') !== TARGET_SEGMENT_ID) {
    fail('MP3_SEGMENT_HEADER_MISMATCH');
  }
  const mp3 = new Uint8Array(await mp3Response.arrayBuffer());
  if (
    mp3.byteLength !== generated.audioBytes ||
    createHash('sha256').update(mp3).digest('hex') !== generated.audioSha256
  ) {
    fail('MP3_VERIFICATION_MISMATCH');
  }

  const afterResponse = await getEp012Preflight();
  if (afterResponse.status !== 200) fail('POSTCHECK_HTTP_STATUS_MISMATCH');
  const after = await jsonBody<Ep012NoProviderPreflight>(afterResponse, 'POSTCHECK_JSON_INVALID');
  assertAfter(after);

  return {
    status: 'SUCCEEDED',
    segmentId: TARGET_SEGMENT_ID,
    providerRequestsMade: 1,
    storageVerified: true,
    audioSha256: generated.audioSha256,
    audioBytes: generated.audioBytes,
    globalPaidRequests: 6,
    globalPaidCharactersUsed: 320,
    ep012SucceededRequests: 2,
    ep012SucceededCharacters: 85,
    reservations: 0,
    unfinalized: 0,
    failedAttempts: 0,
  };
}

async function main(): Promise<void> {
  try {
    const result = await runCanary(process.env);
    if ('action' in result) {
      console.log(`TIVVLEJOY_EP012_SINGLE_PAID_CANARY SKIPPED ${result.reason}`);
    } else {
      console.log(`TIVVLEJOY_EP012_SINGLE_PAID_CANARY ${JSON.stringify(result)}`);
    }
  } catch (error) {
    const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'UNKNOWN';
    console.error(`TIVVLEJOY_EP012_SINGLE_PAID_CANARY BLOCKED ${code}`);
    process.exitCode = 1;
  }
}

void main();

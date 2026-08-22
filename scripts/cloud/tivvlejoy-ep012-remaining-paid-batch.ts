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
const REQUIRED_AUTHORIZATION = 'EP012_REMAINING_EIGHT_PAID_ATTEMPTS_NO_RETRY';

const COMPLETED_BEFORE = [
  { segmentId: 'DL_HOOK_01__PIP', characterCount: 51 },
  { segmentId: 'DL_HOOK_01__GOAT', characterCount: 34 },
  { segmentId: 'DL_DISCOVERY_01__PIP', characterCount: 80 },
] as const;

const TARGET_SEGMENTS = [
  { segmentId: 'DL_DECISION_01__GOAT', characterCount: 56 },
  { segmentId: 'DL_ACTION_01__PIP', characterCount: 23 },
  { segmentId: 'DL_ACTION_01__GOAT', characterCount: 30 },
  { segmentId: 'DL_COMPLICATION_01__GOAT', characterCount: 26 },
  { segmentId: 'DL_COMPLICATION_01__PIP', characterCount: 37 },
  { segmentId: 'DL_PAYOFF_01__PIP', characterCount: 66 },
  { segmentId: 'DL_BUTTON_01__GOAT', characterCount: 25 },
  { segmentId: 'DL_BUTTON_01__PIP', characterCount: 32 },
] as const;

type TargetSegment = (typeof TARGET_SEGMENTS)[number];
type BatchPlan =
  | { action: 'skip'; reason: 'BRANCH_NOT_AUTHORIZED' | 'NON_PREVIEW_RUNTIME' }
  | { action: 'execute'; host: string; token: string };
type SkipPlan = Extract<BatchPlan, { action: 'skip' }>;

type SanitizedArtifact = {
  segmentId: TargetSegment['segmentId'];
  characterCount: number;
  audioSha256: string;
  audioBytes: number;
};

type SanitizedBatchResult = {
  status: 'SUCCEEDED';
  segmentsCompleted: 8;
  providerRequestsMade: 8;
  storageVerified: true;
  globalPaidRequests: 15;
  globalPaidCharactersUsed: 695;
  ep012SucceededRequests: 11;
  ep012SucceededCharacters: 460;
  reservations: 0;
  unfinalized: 0;
  failedAttempts: 0;
  artifacts: SanitizedArtifact[];
};

function fail(code: string): never {
  const error = new Error(code);
  error.name = 'TivvleJoyEp012RemainingPaidBatchError';
  throw error;
}

function value(env: NodeJS.ProcessEnv, name: string): string {
  return String(env[name] ?? '').trim();
}

function planBatch(env: NodeJS.ProcessEnv): BatchPlan {
  if (value(env, 'VERCEL_GIT_COMMIT_REF') !== REQUIRED_BRANCH) {
    return { action: 'skip', reason: 'BRANCH_NOT_AUTHORIZED' };
  }
  if (value(env, 'VERCEL_ENV') !== 'preview') {
    return { action: 'skip', reason: 'NON_PREVIEW_RUNTIME' };
  }
  if (value(env, 'VERCEL_ORG_ID') !== REQUIRED_ORG_ID) fail('VERCEL_ORG_MISMATCH');
  if (value(env, 'VERCEL_PROJECT_ID') !== REQUIRED_PROJECT_ID) fail('VERCEL_PROJECT_MISMATCH');
  if (value(env, 'TIVVLEJOY_EP012_CANARY_AUTHORIZATION') !== REQUIRED_AUTHORIZATION) {
    fail('BATCH_AUTHORIZATION_MISMATCH');
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

async function readPreflight(code: string): Promise<Ep012NoProviderPreflight> {
  const response = await getEp012Preflight();
  if (response.status !== 200) fail(`${code}_HTTP_STATUS_MISMATCH`);
  return jsonBody<Ep012NoProviderPreflight>(response, `${code}_JSON_INVALID`);
}

function requestCheck(preflight: Ep012NoProviderPreflight, segmentId: string) {
  const check = preflight.requestChecks.find((item) => item.segmentId === segmentId);
  if (!check) fail('REQUEST_CHECK_MISSING');
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

function assertSucceededCheck(
  preflight: Ep012NoProviderPreflight,
  expected: { segmentId: string; characterCount: number },
): void {
  const check = requestCheck(preflight, expected.segmentId);
  if (
    check.characterCount !== expected.characterCount ||
    check.ledgerEntryStatus !== 'SUCCEEDED' ||
    check.eligibility !== 'ALREADY_SUCCEEDED' ||
    !check.passed ||
    check.blockers.length !== 0
  ) {
    fail('SUCCEEDED_SEGMENT_STATE_MISMATCH');
  }
}

function assertEligibleCheck(
  preflight: Ep012NoProviderPreflight,
  expected: { segmentId: string; characterCount: number },
): void {
  const check = requestCheck(preflight, expected.segmentId);
  if (
    check.characterCount !== expected.characterCount ||
    check.ledgerEntryStatus !== 'ABSENT' ||
    check.eligibility !== 'ELIGIBLE' ||
    !check.passed ||
    check.blockers.length !== 0
  ) {
    fail('ELIGIBLE_SEGMENT_STATE_MISMATCH');
  }
}

function assertProgress(preflight: Ep012NoProviderPreflight, completedNow: number): void {
  if (!Number.isInteger(completedNow) || completedNow < 0 || completedNow > TARGET_SEGMENTS.length) {
    fail('PROGRESS_INDEX_INVALID');
  }
  const addedCharacters = TARGET_SEGMENTS.slice(0, completedNow).reduce(
    (sum, item) => sum + item.characterCount,
    0,
  );
  const complete = completedNow === TARGET_SEGMENTS.length;
  const expectedStatus = complete ? 'COMPLETE' : 'READY';

  if (
    !preflight.ok ||
    preflight.status !== expectedStatus ||
    preflight.blockers.length !== 0 ||
    !preflight.serverGates.previewRuntime ||
    !preflight.serverGates.previewOnlyRuntime ||
    preflight.serverGates.productionRuntime ||
    !preflight.serverGates.executionLedgerReadable ||
    !preflight.serverGates.allPassed ||
    !preflight.ledger.configured ||
    !preflight.ledger.available ||
    !preflight.ledger.reconciled ||
    !preflight.ledger.authoritative ||
    !preflight.ledger.executionLedgerReadable ||
    !preflight.ledger.allPassed ||
    preflight.ledger.globalPaidRequests !== 7 + completedNow ||
    preflight.ledger.globalPaidCharactersUsed !== 400 + addedCharacters ||
    preflight.ledger.ep012SucceededRequests !== 3 + completedNow ||
    preflight.ledger.ep012SucceededCharacters !== 165 + addedCharacters ||
    preflight.ledger.ep012RemainingRequests !== 8 - completedNow ||
    preflight.ledger.ep012RemainingCharacters !== 295 - addedCharacters ||
    preflight.ledger.providerRequestsMade !== 3 + completedNow ||
    preflight.ledger.storageVerifiedCount !== 3 + completedNow ||
    preflight.ledger.allArtifactsStorageVerified !== complete ||
    preflight.ledger.nextProviderContactPermitted !== !complete ||
    preflight.readyForProviderContact !== !complete ||
    preflight.nextProviderContactPermitted !== !complete ||
    preflight.totalRequestChecks !== 11 ||
    preflight.passedRequestChecks !== 11 ||
    preflight.blockedRequestChecks !== 0 ||
    !preflight.authorization.issued ||
    !preflight.authorization.verified ||
    !preflight.authorization.allPassed ||
    preflight.authorization.authorizedSegmentCount !== 11 ||
    preflight.authorization.maxProviderRequests !== 11 ||
    preflight.authorization.totalCharacterCount !== 460 ||
    !preflight.authorization.oneRequestPerSpeaker ||
    preflight.authorization.automaticRetryAllowed ||
    preflight.authorization.legacyThreeRequestAllowanceAppliedToEp012 ||
    preflight.authorization.dialogueLockMutationAllowed ||
    preflight.authorization.sceneryAccessAllowed ||
    preflight.providerContacted ||
    preflight.providerRequestsMade !== 3 + completedNow ||
    preflight.sceneryAccessed ||
    preflight.sceneryRequestsMade !== 0 ||
    preflight.commercialBytesDownloaded !== 0 ||
    preflight.dialogueLockMutated ||
    preflight.productionEnabled
  ) {
    fail('PREFLIGHT_PROGRESS_MISMATCH');
  }

  assertZeroRecoveryState(preflight, complete ? 'FINAL' : 'PROGRESS');
  for (const item of COMPLETED_BEFORE) assertSucceededCheck(preflight, item);
  TARGET_SEGMENTS.forEach((item, index) => {
    if (index < completedNow) assertSucceededCheck(preflight, item);
    else assertEligibleCheck(preflight, item);
  });
}

function assertGeneration(
  result: Ep012PaidVoiceExecutionResult,
  target: TargetSegment,
): asserts result is Ep012PaidVoiceExecutionResult & {
  status: 'SUCCEEDED';
  audioSha256: string;
  audioBytes: number;
  receipt: Ep012PublicReceipt;
} {
  if (
    !result.ok ||
    result.status !== 'SUCCEEDED' ||
    result.segmentId !== target.segmentId ||
    result.characterCount !== target.characterCount ||
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

function assertReceipt(
  receipt: Ep012PublicReceipt,
  generated: Ep012PaidVoiceExecutionResult & {
    audioSha256: string;
    audioBytes: number;
    receipt: Ep012PublicReceipt;
  },
  target: TargetSegment,
): void {
  if (
    receipt.episodeId !== 'EP012' ||
    receipt.segmentId !== target.segmentId ||
    receipt.requestId !== generated.requestId ||
    receipt.characterCount !== target.characterCount ||
    receipt.audioSha256 !== generated.audioSha256 ||
    receipt.audioBytes !== generated.audioBytes ||
    !receipt.storageVerified ||
    receipt.alignment.characterCount !== target.characterCount ||
    !receipt.alignment.hasStartTimes ||
    !receipt.alignment.hasEndTimes ||
    receipt.productionEnabled
  ) {
    fail('RECEIPT_VERIFICATION_MISMATCH');
  }
}

function authorizedHeaders(host: string, token: string): Headers {
  return new Headers({
    'content-type': 'application/json',
    origin: `https://${host}`,
    host,
    'x-tivvlejoy-voice-test-token': token,
  });
}

async function runTarget(
  plan: Extract<BatchPlan, { action: 'execute' }>,
  target: TargetSegment,
  completedNow: number,
): Promise<SanitizedArtifact> {
  const origin = `https://${plan.host}`;
  const headers = authorizedHeaders(plan.host, plan.token);
  const generateRequest = new Request(`${origin}/api/voice-production/ep012/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ segmentId: target.segmentId, confirmed: true }),
  });

  // Exactly one authorized provider attempt for this segment. There is no retry path.
  const generateResponse = await postEp012Generate(generateRequest);
  const generated = await jsonBody<Ep012PaidVoiceExecutionResult>(
    generateResponse,
    'GENERATE_JSON_INVALID',
  );
  if (generateResponse.status !== 200) fail(`GENERATE_HTTP_${generateResponse.status}`);
  assertGeneration(generated, target);

  const receiptRequest = new Request(
    `${origin}/api/voice-production/ep012/audio?segmentId=${target.segmentId}&kind=receipt`,
    { method: 'GET', headers },
  );
  const receiptResponse = await getEp012Audio(receiptRequest);
  if (receiptResponse.status !== 200) fail('RECEIPT_HTTP_STATUS_MISMATCH');
  const receipt = await jsonBody<Ep012PublicReceipt>(receiptResponse, 'RECEIPT_JSON_INVALID');
  assertReceipt(receipt, generated, target);

  const mp3Request = new Request(
    `${origin}/api/voice-production/ep012/audio?segmentId=${target.segmentId}&kind=mp3`,
    { method: 'GET', headers },
  );
  const mp3Response = await getEp012Audio(mp3Request);
  if (mp3Response.status !== 200 || mp3Response.headers.get('content-type') !== 'audio/mpeg') {
    fail('MP3_HTTP_CONTRACT_MISMATCH');
  }
  if (mp3Response.headers.get('x-ep012-segment-id') !== target.segmentId) {
    fail('MP3_SEGMENT_HEADER_MISMATCH');
  }
  const mp3 = new Uint8Array(await mp3Response.arrayBuffer());
  if (
    mp3.byteLength !== generated.audioBytes ||
    createHash('sha256').update(mp3).digest('hex') !== generated.audioSha256
  ) {
    fail('MP3_VERIFICATION_MISMATCH');
  }

  const after = await readPreflight(`POSTCHECK_${completedNow}`);
  assertProgress(after, completedNow);

  return {
    segmentId: target.segmentId,
    characterCount: target.characterCount,
    audioSha256: generated.audioSha256,
    audioBytes: generated.audioBytes,
  };
}

async function runBatch(env: NodeJS.ProcessEnv): Promise<SanitizedBatchResult | SkipPlan> {
  const plan = planBatch(env);
  if (plan.action === 'skip') return plan;

  const before = await readPreflight('PRECHECK');
  assertProgress(before, 0);

  const artifacts: SanitizedArtifact[] = [];
  artifacts.push(await runTarget(plan, TARGET_SEGMENTS[0], 1));
  artifacts.push(await runTarget(plan, TARGET_SEGMENTS[1], 2));
  artifacts.push(await runTarget(plan, TARGET_SEGMENTS[2], 3));
  artifacts.push(await runTarget(plan, TARGET_SEGMENTS[3], 4));
  artifacts.push(await runTarget(plan, TARGET_SEGMENTS[4], 5));
  artifacts.push(await runTarget(plan, TARGET_SEGMENTS[5], 6));
  artifacts.push(await runTarget(plan, TARGET_SEGMENTS[6], 7));
  artifacts.push(await runTarget(plan, TARGET_SEGMENTS[7], 8));

  return {
    status: 'SUCCEEDED',
    segmentsCompleted: 8,
    providerRequestsMade: 8,
    storageVerified: true,
    globalPaidRequests: 15,
    globalPaidCharactersUsed: 695,
    ep012SucceededRequests: 11,
    ep012SucceededCharacters: 460,
    reservations: 0,
    unfinalized: 0,
    failedAttempts: 0,
    artifacts,
  };
}

async function main(): Promise<void> {
  try {
    const result = await runBatch(process.env);
    if ('action' in result) {
      console.log(`TIVVLEJOY_EP012_REMAINING_PAID_BATCH SKIPPED ${result.reason}`);
    } else {
      console.log(`TIVVLEJOY_EP012_REMAINING_PAID_BATCH ${JSON.stringify(result)}`);
    }
  } catch (error) {
    const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : 'UNKNOWN';
    console.error(`TIVVLEJOY_EP012_REMAINING_PAID_BATCH BLOCKED ${code}`);
    process.exitCode = 1;
  }
}

void main();

import { GET as getEp012Preflight } from "../../apps/web/src/app/api/voice-production/ep012/preflight/route";
import { POST as postEp012StorageProbe } from "../../apps/web/src/app/api/voice-production/ep012/storage-probe/route";
import {
  assertSafeEp012ObjectKey,
  createR2Ep012AudioStorage,
  sha256Bytes,
  storageProbeMarkerBytes,
} from "../../apps/web/src/lib/tivvlejoy-real-production-unblock/ep012-audio-storage";
import type { Ep012NoProviderPreflight } from "../../apps/web/src/lib/tivvlejoy-real-production-unblock/ep012-no-provider-preflight";
import type { Ep012StorageProbeResult } from "../../apps/web/src/lib/tivvlejoy-real-production-unblock/ep012-storage-probe";

const REQUIRED_BRANCH = "cursor/tivvlejoy-ep012-preview-ledger-migration-73f1";
const REQUIRED_ORG_ID = "team_SKbKndUqqNWtp29jHlMG5Otl";
const REQUIRED_PROJECT_ID = "prj_yKQw8QFb9Bkzc9NoouV0cCHYn9SK";
const REQUIRED_AUTHORIZATION = "EP012_R2_MARKER_WRITE_READ_NO_PROVIDER";
const EXPECTED_GLOBAL = { requests: 4, characters: 235 } as const;
const EXPECTED_EP012 = { requests: 0, characters: 0 } as const;
const EXPECTED_MARKER_KEY = "audio/EP012/control/storage-probe.marker.json";

type ProbePlan =
  | { action: "skip"; reason: "BRANCH_NOT_AUTHORIZED" | "NON_PREVIEW_RUNTIME" }
  | { action: "execute"; host: string; token: string };
type SkipPlan = Extract<ProbePlan, { action: "skip" }>;

type SanitizedStorageProbeResult = {
  status: "VERIFIED";
  markerKey: typeof EXPECTED_MARKER_KEY;
  sha256: string;
  byteCount: number;
  idempotent: true;
  globalPaidRequests: 4;
  globalPaidCharactersUsed: 235;
  ep012SucceededRequests: 0;
  ep012SucceededCharacters: 0;
  providerRequestsMade: 0;
  reservations: 0;
  unfinalized: 0;
  failedAttempts: 0;
};

function fail(code: string): never {
  const error = new Error(code);
  error.name = "TivvleJoyEp012StorageProbeCarrierError";
  throw error;
}

function value(env: NodeJS.ProcessEnv, name: string): string {
  return String(env[name] ?? "").trim();
}

function storageValue(
  env: NodeJS.ProcessEnv,
  ep012Name: string,
  legacyName: string,
): string {
  return value(env, ep012Name) || value(env, legacyName);
}

function storageErrorCode(error: unknown): string {
  const details = (error && typeof error === "object" ? error : {}) as {
    name?: unknown;
    Code?: unknown;
    code?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  const name = String(details.name ?? "");
  const code = String(details.Code ?? details.code ?? name).toUpperCase();
  const status = Number(details.$metadata?.httpStatusCode);

  if (code === "INVALIDACCESSKEYID") return "R2_INVALID_ACCESS_KEY_ID";
  if (code === "SIGNATUREDOESNOTMATCH") return "R2_SIGNATURE_MISMATCH";
  if (code === "ACCESSDENIED") return "R2_ACCESS_DENIED";
  if (code === "NOSUCHBUCKET") return "R2_BUCKET_NOT_FOUND";
  if (code === "INVALIDBUCKETNAME") return "R2_BUCKET_NAME_INVALID";
  if (code === "INVALIDARGUMENT") return "R2_INVALID_ARGUMENT";
  if (code === "AUTHORIZATIONHEADERMALFORMED")
    return "R2_AUTHORIZATION_HEADER_MALFORMED";
  if (code === "INVALIDREQUEST") return "R2_INVALID_REQUEST";
  if (code === "REQUESTTIMETOOSKEWED") return "R2_REQUEST_TIME_SKEWED";
  if (code === "PERMANENTREDIRECT") return "R2_ENDPOINT_REDIRECT";
  if (code === "METHODNOTALLOWED") return "R2_METHOD_NOT_ALLOWED";
  if (code === "ENOTFOUND") return "R2_ENDPOINT_DNS_FAILED";
  if (code === "ECONNREFUSED") return "R2_ENDPOINT_CONNECTION_REFUSED";
  if (code === "ETIMEDOUT") return "R2_ENDPOINT_TIMEOUT";
  if (code === "ERR_INVALID_URL") return "R2_ENDPOINT_INVALID";
  if ([400, 401, 403, 404, 409, 429, 500, 502, 503, 504].includes(status)) {
    return `R2_HTTP_${status}`;
  }
  return "R2_STORAGE_TRANSPORT_FAILED";
}

function assertStorageConfigShape(env: NodeJS.ProcessEnv): void {
  const endpoint = storageValue(
    env,
    "TIVVLEJOY_EP012_AUDIO_ENDPOINT",
    "R2_ENDPOINT",
  );
  const bucket = storageValue(
    env,
    "TIVVLEJOY_EP012_AUDIO_BUCKET",
    "R2_BUCKET",
  );
  const accessKeyId = storageValue(
    env,
    "TIVVLEJOY_EP012_AUDIO_ACCESS_KEY_ID",
    "R2_ACCESS_KEY_ID",
  );
  const secretAccessKey = storageValue(
    env,
    "TIVVLEJOY_EP012_AUDIO_SECRET_ACCESS_KEY",
    "R2_SECRET_ACCESS_KEY",
  );

  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    fail("R2_ENDPOINT_INVALID");
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    fail("R2_ENDPOINT_INVALID");
  }
  if (parsed.pathname !== "/" && parsed.pathname !== "") {
    fail("R2_ENDPOINT_PATH_UNEXPECTED");
  }
  if (
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) ||
    bucket.includes("..") ||
    bucket.includes(".-") ||
    bucket.includes("-.")
  ) {
    fail("R2_BUCKET_NAME_INVALID");
  }
  if (accessKeyId.length < 16 || accessKeyId.length > 128) {
    fail("R2_ACCESS_KEY_ID_FORMAT_INVALID");
  }
  if (secretAccessKey.length < 32 || secretAccessKey.length > 256) {
    fail("R2_SECRET_ACCESS_KEY_FORMAT_INVALID");
  }
}

async function directStorageDiagnostic(env: NodeJS.ProcessEnv): Promise<void> {
  assertStorageConfigShape(env);
  const storage = createR2Ep012AudioStorage(env);
  if (storage.kind !== "r2") fail("R2_STORAGE_UNAVAILABLE");
  const key = assertSafeEp012ObjectKey(EXPECTED_MARKER_KEY);
  const marker = storageProbeMarkerBytes();
  try {
    await storage.putObject(key, marker, "application/json");
    const readBack = await storage.getObject(key);
    if (
      readBack.byteLength !== marker.byteLength ||
      sha256Bytes(readBack) !== sha256Bytes(marker)
    ) {
      fail("R2_READBACK_MISMATCH");
    }
  } catch (error) {
    if (error instanceof Error && /^[A-Z0-9_]+$/.test(error.message))
      throw error;
    fail(storageErrorCode(error));
  }
}

function planProbe(env: NodeJS.ProcessEnv): ProbePlan {
  if (value(env, "VERCEL_GIT_COMMIT_REF") !== REQUIRED_BRANCH) {
    return { action: "skip", reason: "BRANCH_NOT_AUTHORIZED" };
  }
  if (value(env, "VERCEL_ENV") !== "preview") {
    return { action: "skip", reason: "NON_PREVIEW_RUNTIME" };
  }
  if (value(env, "VERCEL_ORG_ID") !== REQUIRED_ORG_ID)
    fail("VERCEL_ORG_MISMATCH");
  if (value(env, "VERCEL_PROJECT_ID") !== REQUIRED_PROJECT_ID)
    fail("VERCEL_PROJECT_MISMATCH");
  if (
    value(env, "TIVVLEJOY_EP012_STORAGE_PROBE_AUTHORIZATION") !==
    REQUIRED_AUTHORIZATION
  ) {
    fail("STORAGE_PROBE_AUTHORIZATION_MISMATCH");
  }

  const host = value(env, "VERCEL_URL")
    .replace(/^https?:\/\//, "")
    .split("/")[0];
  if (!/^[a-z0-9-]+\.vercel\.app$/.test(host))
    fail("VERCEL_PREVIEW_HOST_INVALID");
  const token = value(env, "TIVVLEJOY_VOICE_TEST_TOKEN");
  if (!token) fail("VOICE_TEST_TOKEN_MISSING");
  if (!storageValue(env, "TIVVLEJOY_EP012_AUDIO_BUCKET", "R2_BUCKET"))
    fail("R2_BUCKET_MISSING");
  if (!storageValue(env, "TIVVLEJOY_EP012_AUDIO_ENDPOINT", "R2_ENDPOINT"))
    fail("R2_ENDPOINT_MISSING");
  if (
    !storageValue(
      env,
      "TIVVLEJOY_EP012_AUDIO_ACCESS_KEY_ID",
      "R2_ACCESS_KEY_ID",
    )
  ) {
    fail("R2_ACCESS_KEY_ID_MISSING");
  }
  if (
    !storageValue(
      env,
      "TIVVLEJOY_EP012_AUDIO_SECRET_ACCESS_KEY",
      "R2_SECRET_ACCESS_KEY",
    )
  ) {
    fail("R2_SECRET_ACCESS_KEY_MISSING");
  }
  return { action: "execute", host, token };
}

async function jsonBody<T>(response: Response, code: string): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    fail(code);
  }
}

function assertLedgerClean(
  preflight: Ep012NoProviderPreflight,
  stage: string,
): void {
  if (
    !preflight.ok ||
    preflight.status !== "READY" ||
    preflight.blockers.length !== 0 ||
    !preflight.serverGates.previewOnlyRuntime ||
    preflight.serverGates.productionRuntime ||
    !preflight.serverGates.executionLedgerReadable ||
    !preflight.serverGates.allPassed ||
    !preflight.ledger.executionLedgerReadable ||
    !preflight.ledger.allPassed ||
    preflight.ledger.globalPaidRequests !== EXPECTED_GLOBAL.requests ||
    preflight.ledger.globalPaidCharactersUsed !== EXPECTED_GLOBAL.characters ||
    preflight.ledger.ep012SucceededRequests !== EXPECTED_EP012.requests ||
    preflight.ledger.ep012SucceededCharacters !== EXPECTED_EP012.characters ||
    preflight.ledger.failedAttempts !== 0 ||
    preflight.ledger.reservedRequests !== 0 ||
    preflight.ledger.reservedCharacters !== 0 ||
    preflight.ledger.unfinalizedCount !== 0 ||
    preflight.ledger.reservations !== 0 ||
    preflight.ledger.unfinalized !== 0 ||
    preflight.ledger.recoveryRequired !== 0 ||
    preflight.ledger.providerRequestsMade !== 0 ||
    preflight.providerContacted ||
    preflight.providerRequestsMade !== 0 ||
    preflight.sceneryAccessed ||
    preflight.sceneryRequestsMade !== 0 ||
    preflight.commercialBytesDownloaded !== 0 ||
    preflight.dialogueLockMutated ||
    preflight.productionEnabled
  ) {
    fail(`${stage}_LEDGER_IDENTITY_MISMATCH`);
  }
}

function assertStorageProbe(
  result: Ep012StorageProbeResult,
): asserts result is Ep012StorageProbeResult & {
  status: "VERIFIED";
  sha256: string;
  byteCount: number;
} {
  if (
    !result.ok ||
    result.status !== "VERIFIED" ||
    result.episodeId !== "EP012" ||
    result.markerKey !== EXPECTED_MARKER_KEY ||
    !/^[a-f0-9]{64}$/.test(String(result.sha256 ?? "")) ||
    !Number.isInteger(result.byteCount) ||
    Number(result.byteCount) <= 0 ||
    !result.idempotent ||
    result.providerContacted ||
    result.providerRequestsMade !== 0 ||
    result.sceneryAccessed ||
    result.sceneryRequestsMade !== 0 ||
    result.commercialBytesDownloaded !== 0 ||
    result.productionEnabled ||
    result.blockers.length !== 0
  ) {
    fail("STORAGE_PROBE_RESULT_MISMATCH");
  }
}

async function preflight(stage: string): Promise<Ep012NoProviderPreflight> {
  const response = await getEp012Preflight();
  if (response.status !== 200) fail(`${stage}_PREFLIGHT_HTTP_STATUS_MISMATCH`);
  const result = await jsonBody<Ep012NoProviderPreflight>(
    response,
    `${stage}_PREFLIGHT_JSON_INVALID`,
  );
  assertLedgerClean(result, stage);
  return result;
}

async function runStorageProbe(
  env: NodeJS.ProcessEnv,
): Promise<SanitizedStorageProbeResult | SkipPlan> {
  const plan = planProbe(env);
  if (plan.action === "skip") return plan;

  await preflight("BEFORE");
  await directStorageDiagnostic(env);

  const request = new Request(
    `https://${plan.host}/api/voice-production/ep012/storage-probe`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: `https://${plan.host}`,
        host: plan.host,
        "x-tivvlejoy-voice-test-token": plan.token,
      },
      body: JSON.stringify({ confirmed: true }),
    },
  );
  const response = await postEp012StorageProbe(request);
  const result = await jsonBody<Ep012StorageProbeResult>(
    response,
    "STORAGE_PROBE_JSON_INVALID",
  );
  if (response.status !== 200) {
    const blocker =
      result.blockers.length === 1 ? String(result.blockers[0] ?? "") : "";
    fail(
      /^[A-Z0-9_]+$/.test(blocker)
        ? blocker
        : `STORAGE_PROBE_HTTP_${response.status}`,
    );
  }
  assertStorageProbe(result);

  const after = await preflight("AFTER");
  return {
    status: "VERIFIED",
    markerKey: EXPECTED_MARKER_KEY,
    sha256: result.sha256,
    byteCount: result.byteCount,
    idempotent: true,
    globalPaidRequests: after.ledger.globalPaidRequests,
    globalPaidCharactersUsed: after.ledger.globalPaidCharactersUsed,
    ep012SucceededRequests: after.ledger.ep012SucceededRequests,
    ep012SucceededCharacters: after.ledger.ep012SucceededCharacters,
    providerRequestsMade: after.ledger.providerRequestsMade,
    reservations: after.ledger.reservations,
    unfinalized: after.ledger.unfinalized,
    failedAttempts: after.ledger.failedAttempts,
  };
}

async function main(): Promise<void> {
  try {
    const result = await runStorageProbe(process.env);
    if ("action" in result) {
      console.log(
        `TIVVLEJOY_EP012_STORAGE_PROBE_CARRIER SKIPPED ${result.reason}`,
      );
    } else {
      console.log(
        `TIVVLEJOY_EP012_STORAGE_PROBE_CARRIER ${JSON.stringify(result)}`,
      );
    }
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
        ? error.message
        : "UNKNOWN";
    console.error(`TIVVLEJOY_EP012_STORAGE_PROBE_CARRIER BLOCKED ${code}`);
    process.exitCode = 1;
  }
}

void main();

// Preview storage-probe rerun after the branch-scoped R2 endpoint correction.

// Preview storage-probe rerun after the branch-scoped R2 bucket correction.

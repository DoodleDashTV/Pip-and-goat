import { SanitizedError } from "./errors";

export const CANONICAL_OWNER = "DoodleDash Production";

export const DEFAULT_PROTECTED_BRANCHES = [
  "main",
  "master",
  "production",
  "cursor/setup-dev-environment-ba2f",
  "cursor/canonical-ddp-baseline-ba2f",
] as const;

export const DEFAULT_WORKER_BRANCH_PREFIX = "agent/";

export const DEFAULT_REPO_URL_PLACEHOLDER =
  "https://github.com/example/ddp-control-center";

export type RuntimeMode = "development" | "test" | "live";

export interface ControlCenterConfig {
  dataDir: string;
  authToken: string;
  sessionSecret: string;
  openaiApiKey?: string;
  openaiModel: string;
  cursorApiKey?: string;
  cursorApiBaseUrl: string;
  safeMode: boolean;
  runtimeMode: RuntimeMode;
  killSwitchEnv: boolean;
  cloudRenderEnabled: boolean;
  allowPaidGpuLaunch: boolean;
  repoUrl: string;
  canonicalOwner: string;
  protectedBranches: string[];
  workerBranchPrefix: string;
  loginRateLimitMax: number;
  loginRateLimitWindowMs: number;
  maxRequestBytes: number;
  sessionTtlSeconds: number;
  pollIntervalMs: number;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function resolveRuntimeMode(): RuntimeMode {
  const raw = (process.env.CONTROL_CENTER_RUNTIME_MODE || "").trim().toLowerCase();
  if (raw === "development" || raw === "dev") return "development";
  if (raw === "test") return "test";
  if (raw === "live" || raw === "production") return "live";
  // Do NOT infer DEV from missing secrets.
  if (process.env.NODE_ENV === "test") return "test";
  if (process.env.NODE_ENV === "development") return "development";
  return "live";
}

export function loadConfig(overrides: Partial<ControlCenterConfig> = {}): ControlCenterConfig {
  const runtimeMode = overrides.runtimeMode || resolveRuntimeMode();
  const openaiApiKey = process.env.OPENAI_API_KEY?.trim() || undefined;
  const cursorApiKey = process.env.CURSOR_API_KEY?.trim() || undefined;

  const safeModeExplicit = process.env.CONTROL_CENTER_SAFE_MODE;
  let safeMode: boolean;
  if (overrides.safeMode !== undefined) {
    safeMode = overrides.safeMode;
  } else if (safeModeExplicit !== undefined && safeModeExplicit !== "") {
    safeMode = envBool("CONTROL_CENTER_SAFE_MODE", true);
  } else if (runtimeMode === "development" || runtimeMode === "test") {
    safeMode = true;
  } else {
    // live defaults to unsafe only when keys present; otherwise refuse below
    safeMode = false;
  }

  const protectedRaw = process.env.CONTROL_CENTER_PROTECTED_BRANCHES;
  const protectedBranches = protectedRaw
    ? protectedRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [...DEFAULT_PROTECTED_BRANCHES];

  const authToken =
    process.env.CONTROL_CENTER_AUTH_TOKEN?.trim() ||
    overrides.authToken ||
    "";
  const sessionSecret =
    process.env.CONTROL_CENTER_SESSION_SECRET?.trim() ||
    overrides.sessionSecret ||
    "";
  const repoUrl =
    process.env.CONTROL_CENTER_REPO_URL?.trim() ||
    overrides.repoUrl ||
    "";

  const config: ControlCenterConfig = {
    dataDir:
      process.env.CONTROL_CENTER_DATA_DIR?.trim() ||
      overrides.dataDir ||
      ".control-center-data",
    authToken,
    sessionSecret,
    openaiApiKey,
    openaiModel: process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini",
    cursorApiKey,
    cursorApiBaseUrl:
      process.env.CURSOR_API_BASE_URL?.trim() || "https://api.cursor.com",
    safeMode,
    runtimeMode,
    killSwitchEnv: envBool("CONTROL_CENTER_KILL_SWITCH", false),
    cloudRenderEnabled: envBool("CLOUD_RENDER_ENABLED", false),
    allowPaidGpuLaunch: envBool("ALLOW_PAID_GPU_LAUNCH", false),
    repoUrl,
    canonicalOwner: CANONICAL_OWNER,
    protectedBranches,
    workerBranchPrefix:
      process.env.CONTROL_CENTER_WORKER_BRANCH_PREFIX?.trim() ||
      DEFAULT_WORKER_BRANCH_PREFIX,
    loginRateLimitMax: Number(process.env.CONTROL_CENTER_LOGIN_MAX || 10),
    loginRateLimitWindowMs: Number(
      process.env.CONTROL_CENTER_LOGIN_WINDOW_MS || 60_000,
    ),
    maxRequestBytes: Number(process.env.CONTROL_CENTER_MAX_BODY_BYTES || 32_768),
    sessionTtlSeconds: Number(process.env.CONTROL_CENTER_SESSION_TTL || 12 * 3600),
    pollIntervalMs: Number(process.env.CONTROL_CENTER_POLL_MS || 5000),
    ...overrides,
    // keep explicit overrides for nested after spread for critical fields
    ...(overrides.dataDir ? { dataDir: overrides.dataDir } : {}),
    ...(overrides.safeMode !== undefined ? { safeMode: overrides.safeMode } : {}),
    ...(overrides.runtimeMode ? { runtimeMode: overrides.runtimeMode } : {}),
    ...(overrides.authToken !== undefined ? { authToken: overrides.authToken } : {}),
    ...(overrides.sessionSecret !== undefined
      ? { sessionSecret: overrides.sessionSecret }
      : {}),
    ...(overrides.repoUrl !== undefined ? { repoUrl: overrides.repoUrl } : {}),
  };

  validateConfig(config);
  return config;
}

const WEAK_DEFAULTS = new Set([
  "",
  "change-me",
  "change-me-session",
  "ddp-dev-token-change-me",
  "ddp-session-secret-change-me",
  "test-token",
  "test-session",
  "t",
  "s",
]);

export function validateConfig(config: ControlCenterConfig): void {
  if (config.cloudRenderEnabled) {
    throw new SanitizedError({
      message: "CLOUD_RENDER_ENABLED must remain false for Control Center",
      category: "config",
      statusCode: 500,
    });
  }
  if (config.allowPaidGpuLaunch) {
    throw new SanitizedError({
      message: "ALLOW_PAID_GPU_LAUNCH must remain false for Control Center",
      category: "config",
      statusCode: 500,
    });
  }

  const isDevOrTest =
    config.runtimeMode === "development" || config.runtimeMode === "test";

  if (!isDevOrTest) {
    if (!config.authToken || WEAK_DEFAULTS.has(config.authToken) || config.authToken.length < 16) {
      throw new SanitizedError({
        message: "CONTROL_CENTER_AUTH_TOKEN must be an explicit strong secret in live mode",
        category: "config",
        statusCode: 500,
      });
    }
    if (
      !config.sessionSecret ||
      WEAK_DEFAULTS.has(config.sessionSecret) ||
      config.sessionSecret.length < 16
    ) {
      throw new SanitizedError({
        message:
          "CONTROL_CENTER_SESSION_SECRET must be an explicit strong secret in live mode",
        category: "config",
        statusCode: 500,
      });
    }
    if (!config.repoUrl || config.repoUrl.includes("example/ddp-control-center")) {
      throw new SanitizedError({
        message: "CONTROL_CENTER_REPO_URL is required in live mode",
        category: "config",
        statusCode: 500,
      });
    }
  } else {
    // Dev/test may use weak tokens, but still need some value for tests.
    if (!config.authToken) config.authToken = "test-token-dev-only-0001";
    if (!config.sessionSecret) config.sessionSecret = "test-session-dev-only-0001";
    if (!config.repoUrl) config.repoUrl = DEFAULT_REPO_URL_PLACEHOLDER;
  }

  if (!config.safeMode) {
    // Live dispatch mode — refuse missing keys entirely.
    if (!config.openaiApiKey) {
      throw new SanitizedError({
        message: "OPENAI_API_KEY required when CONTROL_CENTER_SAFE_MODE=false",
        category: "config",
        statusCode: 500,
      });
    }
    if (!config.cursorApiKey) {
      throw new SanitizedError({
        message: "CURSOR_API_KEY required when CONTROL_CENTER_SAFE_MODE=false",
        category: "config",
        statusCode: 500,
      });
    }
    if (!config.repoUrl || config.repoUrl.includes("example/ddp-control-center")) {
      throw new SanitizedError({
        message: "CONTROL_CENTER_REPO_URL required when CONTROL_CENTER_SAFE_MODE=false",
        category: "config",
        statusCode: 500,
      });
    }
    if (!config.authToken || WEAK_DEFAULTS.has(config.authToken)) {
      throw new SanitizedError({
        message: "Strong CONTROL_CENTER_AUTH_TOKEN required when SAFE_MODE=false",
        category: "config",
        statusCode: 500,
      });
    }
    if (!config.sessionSecret || WEAK_DEFAULTS.has(config.sessionSecret)) {
      throw new SanitizedError({
        message: "Strong CONTROL_CENTER_SESSION_SECRET required when SAFE_MODE=false",
        category: "config",
        statusCode: 500,
      });
    }
  }
}

export function assertSafetyDefaults(config: ControlCenterConfig): string[] {
  try {
    validateConfig(config);
    return [];
  } catch (err) {
    return [err instanceof Error ? err.message : String(err)];
  }
}

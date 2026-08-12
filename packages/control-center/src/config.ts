export const CANONICAL_OWNER = "DoodleDash Production";

export const DEFAULT_PROTECTED_BRANCHES = [
  "main",
  "master",
  "cursor/setup-dev-environment-ba2f",
  "cursor/canonical-ddp-baseline-ba2f",
] as const;

export const DEFAULT_WORKER_BRANCH_PREFIX = "agent/";

// Placeholder only — set CONTROL_CENTER_REPO_URL for real dispatches.
export const DEFAULT_REPO_URL = "https://github.com/example/ddp-control-center";

export interface ControlCenterConfig {
  dataDir: string;
  authToken: string;
  sessionSecret: string;
  openaiApiKey?: string;
  openaiModel: string;
  cursorApiKey?: string;
  cursorApiBaseUrl: string;
  safeMode: boolean;
  killSwitchEnv: boolean;
  cloudRenderEnabled: boolean;
  allowPaidGpuLaunch: boolean;
  repoUrl: string;
  canonicalOwner: string;
  protectedBranches: string[];
  workerBranchPrefix: string;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export function loadConfig(overrides: Partial<ControlCenterConfig> = {}): ControlCenterConfig {
  const openaiApiKey = process.env.OPENAI_API_KEY?.trim() || undefined;
  const cursorApiKey = process.env.CURSOR_API_KEY?.trim() || undefined;
  const safeModeExplicit = process.env.CONTROL_CENTER_SAFE_MODE;
  const safeMode =
    safeModeExplicit !== undefined && safeModeExplicit !== ""
      ? envBool("CONTROL_CENTER_SAFE_MODE", true)
      : !(openaiApiKey && cursorApiKey);

  const protectedRaw = process.env.CONTROL_CENTER_PROTECTED_BRANCHES;
  const protectedBranches = protectedRaw
    ? protectedRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [...DEFAULT_PROTECTED_BRANCHES];

  return {
    dataDir:
      process.env.CONTROL_CENTER_DATA_DIR?.trim() ||
      overrides.dataDir ||
      ".control-center-data",
    authToken:
      process.env.CONTROL_CENTER_AUTH_TOKEN?.trim() ||
      overrides.authToken ||
      "ddp-dev-token-change-me",
    sessionSecret:
      process.env.CONTROL_CENTER_SESSION_SECRET?.trim() ||
      overrides.sessionSecret ||
      "ddp-session-secret-change-me",
    openaiApiKey,
    openaiModel: process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini",
    cursorApiKey,
    cursorApiBaseUrl:
      process.env.CURSOR_API_BASE_URL?.trim() || "https://api.cursor.com",
    safeMode,
    killSwitchEnv: envBool("CONTROL_CENTER_KILL_SWITCH", false),
    cloudRenderEnabled: envBool("CLOUD_RENDER_ENABLED", false),
    allowPaidGpuLaunch: envBool("ALLOW_PAID_GPU_LAUNCH", false),
    repoUrl: process.env.CONTROL_CENTER_REPO_URL?.trim() || DEFAULT_REPO_URL,
    canonicalOwner: CANONICAL_OWNER,
    protectedBranches,
    workerBranchPrefix:
      process.env.CONTROL_CENTER_WORKER_BRANCH_PREFIX?.trim() ||
      DEFAULT_WORKER_BRANCH_PREFIX,
    ...overrides,
  };
}

export function assertSafetyDefaults(config: ControlCenterConfig): string[] {
  const violations: string[] = [];
  if (config.cloudRenderEnabled) {
    violations.push("CLOUD_RENDER_ENABLED must remain false for Control Center");
  }
  if (config.allowPaidGpuLaunch) {
    violations.push("ALLOW_PAID_GPU_LAUNCH must remain false for Control Center");
  }
  return violations;
}

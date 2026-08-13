#!/usr/bin/env tsx
/**
 * Local $0 Control Center loop (mock when keys absent / SAFE_MODE).
 * Never launches Runpod. Never enables paid GPU flags.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ControlCenterOrchestrator,
  loadConfig,
} from "../../packages/control-center/src/index.ts";

async function main() {
  process.env.CLOUD_RENDER_ENABLED = "false";
  process.env.ALLOW_PAID_GPU_LAUNCH = "false";
  process.env.CONTROL_CENTER_RUNTIME_MODE =
    process.env.CONTROL_CENTER_RUNTIME_MODE || "test";
  process.env.CONTROL_CENTER_SAFE_MODE =
    process.env.CONTROL_CENTER_SAFE_MODE || "true";

  const dataDir =
    process.env.CONTROL_CENTER_DATA_DIR ||
    mkdtempSync(join(tmpdir(), "ddp-cc-cli-"));

  const config = loadConfig({
    dataDir,
    runtimeMode: "test",
    safeMode: true,
    authToken: process.env.CONTROL_CENTER_AUTH_TOKEN || "test-token-dev-only-0001",
    sessionSecret:
      process.env.CONTROL_CENTER_SESSION_SECRET || "test-session-dev-only-0001",
    pollIntervalMs: 60_000,
  });
  const orch = new ControlCenterOrchestrator(config);
  orch.poller.stop();
  if (!orch.config.killSwitchEnv) orch.clearDispatchDenied("safe-zero-cli");

  const result = await orch.runSafeZeroLoop(
    process.argv.slice(2).join(" ") ||
      "Safe $0 Control Center loop: reply SAFE_TEST_OK and stop.",
  );

  const dash = orch.getDashboard();
  console.log(
    JSON.stringify(
      {
        ok: ["succeeded", "result_requires_integration_review"].includes(
          result.job.status,
        ),
        safeMode: config.safeMode,
        loop: result.loop,
        job: {
          id: result.job.id,
          status: result.job.status,
          workerBranchPolicy: result.job.workerBranchPolicy,
          observedBranches: result.job.observedBranches,
          cursorAgentId: result.job.cursorAgentId,
          cursorUrl: result.job.cursorUrl,
          resultSummary: result.job.resultSummary,
          outcomeReview: result.job.outcomeReview,
        },
        credentials: dash.credentials,
        killSwitch: dash.killSwitch,
        branchIsolationGuarantee: dash.branchIsolationGuarantee,
        auditTail: dash.audit.slice(0, 5).map((a) => ({
          action: a.action,
          detail: a.detail,
        })),
      },
      null,
      2,
    ),
  );

  if (!["succeeded", "result_requires_integration_review"].includes(result.job.status)) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

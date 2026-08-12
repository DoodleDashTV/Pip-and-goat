#!/usr/bin/env tsx
/**
 * Local $0 Control Center loop:
 * create job → OpenAI director (mock if no key) → Cursor agent (mock if no key)
 * → store result → print dashboard snapshot.
 *
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

  const dataDir =
    process.env.CONTROL_CENTER_DATA_DIR ||
    mkdtempSync(join(tmpdir(), "ddp-cc-cli-"));

  const config = loadConfig({ dataDir });
  const orch = new ControlCenterOrchestrator(config);
  const result = await orch.runSafeZeroLoop(
    process.argv.slice(2).join(" ") ||
      "Safe $0 Control Center loop: reply SAFE_TEST_OK and stop.",
  );

  const dash = orch.getDashboard();
  console.log(
    JSON.stringify(
      {
        ok: result.job.status === "succeeded",
        safeMode: config.safeMode,
        loop: result.loop,
        job: {
          id: result.job.id,
          status: result.job.status,
          workerBranch: result.job.workerBranch,
          cursorAgentId: result.job.cursorAgentId,
          cursorUrl: result.job.cursorUrl,
          resultSummary: result.job.resultSummary,
        },
        credentials: dash.credentials,
        killSwitch: dash.killSwitch,
        auditTail: dash.audit.slice(0, 5).map((a) => ({
          action: a.action,
          detail: a.detail,
        })),
      },
      null,
      2,
    ),
  );

  if (result.job.status !== "succeeded") {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

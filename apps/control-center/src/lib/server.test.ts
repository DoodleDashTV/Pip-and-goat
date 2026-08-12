import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ControlCenterOrchestrator,
  loadConfig,
} from "@doodle-dash/control-center";

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
  delete globalThis.__ddpControlCenter;
});

describe("control center web wiring", () => {
  it("serves dashboard snapshot after safe loop", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ddp-cc-web-"));
    dirs.push(dir);
    const orch = new ControlCenterOrchestrator(
      loadConfig({
        dataDir: dir,
        runtimeMode: "test",
        safeMode: true,
        authToken: "test-token-dev-only-0001",
        sessionSecret: "test-session-dev-only-0001",
        pollIntervalMs: 60_000,
      }),
    );
    orch.poller.stop();
    orch.clearDispatchDenied("test");
    globalThis.__ddpControlCenter = orch;
    const { job } = await orch.runSafeZeroLoop("web wiring");
    const dash = orch.getDashboard();
    expect(dash.jobs.some((j) => j.id === job.id)).toBe(true);
    expect(dash.safeMode).toBe(true);
    expect(dash.canonicalOwner).toBe("DoodleDash Production");
    expect(dash.branchIsolationGuarantee).toMatch(/workOnCurrentBranch=false/);
  });
});

declare global {
  var __ddpControlCenter: ControlCenterOrchestrator | undefined;
}

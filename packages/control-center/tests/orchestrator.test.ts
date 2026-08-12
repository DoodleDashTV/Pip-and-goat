import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ControlCenterOrchestrator,
  loadConfig,
  issueSessionToken,
  verifySessionToken,
  authenticateBearer,
  assertWorkerBranchPolicyAllowed,
  isProtectedBranch,
  MockCursorClient,
} from "../src/index";

const dirs: string[] = [];

function tempOrchestrator(overrides: Record<string, unknown> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ddp-cc-"));
  dirs.push(dir);
  const config = loadConfig({
    dataDir: dir,
    runtimeMode: "test",
    authToken: "test-token-dev-only-0001",
    sessionSecret: "test-session-dev-only-0001",
    safeMode: true,
    cloudRenderEnabled: false,
    allowPaidGpuLaunch: false,
    pollIntervalMs: 60_000,
    ...overrides,
  });
  const orch = new ControlCenterOrchestrator(config);
  orch.poller.stop();
  if (!orch.config.killSwitchEnv) orch.clearDispatchDenied("test");
  return orch;
}

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

describe("branch protection", () => {
  it("blocks canonical and lookalike branches", () => {
    const project = {
      id: "p",
      name: "DDP",
      repoUrl: "https://github.com/example/ddp-control-center",
      canonicalOwner: "DoodleDash Production",
      protectedBranches: ["main", "cursor/setup-dev-environment-ba2f"],
      workerBranchPrefix: "agent/",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(isProtectedBranch("main", project.protectedBranches)).toBe(true);
    expect(assertWorkerBranchPolicyAllowed("main", project).ok).toBe(false);
    expect(assertWorkerBranchPolicyAllowed("agent/main", project).ok).toBe(false);
    expect(assertWorkerBranchPolicyAllowed("agent/ddp-cc-test", project).ok).toBe(true);
  });
});

describe("auth", () => {
  it("issues and verifies session tokens", () => {
    const token = issueSessionToken("secret-value-long-enough", "justin");
    const payload = verifySessionToken("secret-value-long-enough", token);
    expect(payload?.sub).toBe("justin");
    expect(verifySessionToken("wrong-secret-value-0001", token)).toBeNull();
  });

  it("accepts bearer auth token or session", () => {
    const session = issueSessionToken("sess-secret-value-0001", "op");
    expect(
      authenticateBearer(
        "Bearer test-token-dev-only-0001",
        "test-token-dev-only-0001",
        "sess-secret-value-0001",
      ).ok,
    ).toBe(true);
    expect(
      authenticateBearer(
        `Bearer ${session}`,
        "test-token-dev-only-0001",
        "sess-secret-value-0001",
      ).ok,
    ).toBe(true);
  });
});

describe("orchestrator safe $0 loop", () => {
  it("creates, directs, dispatches mock agent, stores result", async () => {
    const o = tempOrchestrator();
    const { job, loop } = await o.runSafeZeroLoop("Reply SAFE_TEST_OK");
    expect(loop).toEqual([
      "create_job",
      "director+dispatch",
      "capture_result",
      "dashboard_updated",
    ]);
    expect(["succeeded", "result_requires_integration_review"]).toContain(job.status);
    expect(job.safeMode).toBe(true);
    expect(job.workerBranchPolicy.startsWith("agent/")).toBe(true);
    expect(job.cursorAgentId).toMatch(/^bc-/);
    expect(job.resultSummary?.toLowerCase()).toContain("safe");
    expect(job.directorPlan?.workerPrompt).toMatch(/NO PAID EXTERNAL OPERATIONS/);
  });

  it("prevents duplicate active jobs", () => {
    const o = tempOrchestrator();
    const a = o.createJob({
      projectId: "proj_ddp_default",
      title: "Dup",
      goal: "x",
      idempotencyKey: "same-key",
    });
    const b = o.createJob({
      projectId: "proj_ddp_default",
      title: "Dup",
      goal: "x",
      idempotencyKey: "same-key",
    });
    expect(a.job.id).toBe(b.job.id);
    expect(b.blockedReason).toBe("duplicate");
  });

  it("requires approval for forced paid actions", async () => {
    const o = tempOrchestrator();
    const created = o.createJob({
      projectId: "proj_ddp_default",
      title: "Paid",
      goal: "would spend",
      forcePaid: true,
    });
    expect(created.job.status).toBe("awaiting_approval");
    expect(created.approval?.kind).toBe("paid_action");
    await expect(o.runJob(created.job.id)).rejects.toThrow(/awaiting approval/i);
  });

  it("honors kill switch and autopilot pause", async () => {
    const o = tempOrchestrator();
    o.setKillSwitch(true);
    expect(() =>
      o.createJob({
        projectId: "proj_ddp_default",
        title: "Nope",
        goal: "x",
      }),
    ).toThrow(/kill|denied/i);

    o.setKillSwitch(false);
    o.setAutopilot("paused");
    const job = o.createJob({
      projectId: "proj_ddp_default",
      title: "Paused",
      goal: "x",
    }).job;
    await expect(o.runJob(job.id, "autopilot")).rejects.toThrow(/paused/i);
  });

  it("recovers state across restart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ddp-cc-"));
    dirs.push(dir);
    const a = tempOrchestrator({ dataDir: dir });
    const { job } = await a.runSafeZeroLoop("persist me");
    const b = new ControlCenterOrchestrator(
      loadConfig({
        dataDir: dir,
        runtimeMode: "test",
        authToken: "test-token-dev-only-0001",
        sessionSecret: "test-session-dev-only-0001",
        safeMode: true,
        pollIntervalMs: 60_000,
      }),
    );
    b.poller.stop();
    const restored = b.store.getJob(job.id);
    expect(restored?.resultSummary).toBeTruthy();
  });

  it("refuses unsafe cloud flags at construction", () => {
    const dir = mkdtempSync(join(tmpdir(), "ddp-cc-"));
    dirs.push(dir);
    expect(() =>
      loadConfig({
        dataDir: dir,
        runtimeMode: "test",
        cloudRenderEnabled: true,
        safeMode: true,
        authToken: "test-token-dev-only-0001",
        sessionSecret: "test-session-dev-only-0001",
      }),
    ).toThrow(/CLOUD_RENDER_ENABLED/);
  });

  it("cancels jobs via cursor client", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ddp-cc-"));
    dirs.push(dir);
    const cursor = new MockCursorClient();
    const o = new ControlCenterOrchestrator(
      loadConfig({
        dataDir: dir,
        runtimeMode: "test",
        safeMode: true,
        authToken: "test-token-dev-only-0001",
        sessionSecret: "test-session-dev-only-0001",
        pollIntervalMs: 60_000,
      }),
      { cursor },
    );
    o.poller.stop();
    o.clearDispatchDenied("test");
    const created = o.createJob({
      projectId: "proj_ddp_default",
      title: "Cancel me",
      goal: "x",
    });
    const agent = await cursor.createAgent({
      prompt: "x",
      name: "n",
      repoUrl: "https://github.com/example/ddp-control-center",
      startingRef: "cursor/canonical-ddp-baseline-ba2f",
      agentId: "bc-cancel-me",
    });
    const job = o.store.getJob(created.job.id)!;
    job.cursorAgentId = agent.agentId;
    job.cursorRunId = agent.runId;
    job.status = "running";
    job.dispatchPhase = "created";
    o.store.upsertJob(job);
    const cancelled = await o.cancelJob(job.id);
    expect(["cancelled", "cancel_pending"]).toContain(cancelled.status);
  });
});

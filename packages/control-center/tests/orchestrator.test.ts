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
  assertWorkerBranchAllowed,
  isProtectedBranch,
  MockCursorClient,
} from "../src/index";

const dirs: string[] = [];

function tempOrchestrator(overrides: Record<string, unknown> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ddp-cc-"));
  dirs.push(dir);
  const config = loadConfig({
    dataDir: dir,
    authToken: "test-token",
    sessionSecret: "test-session",
    safeMode: true,
    cloudRenderEnabled: false,
    allowPaidGpuLaunch: false,
    ...overrides,
  });
  return new ControlCenterOrchestrator(config);
}

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

describe("branch protection", () => {
  it("blocks canonical and main branches", () => {
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
    expect(assertWorkerBranchAllowed("main", project).ok).toBe(false);
    expect(
      assertWorkerBranchAllowed("cursor/setup-dev-environment-ba2f", project).ok,
    ).toBe(false);
    expect(assertWorkerBranchAllowed("agent/ddp-cc-test", project).ok).toBe(true);
  });
});

describe("auth", () => {
  it("issues and verifies session tokens", () => {
    const token = issueSessionToken("secret", "justin");
    const payload = verifySessionToken("secret", token);
    expect(payload?.sub).toBe("justin");
    expect(verifySessionToken("wrong", token)).toBeNull();
  });

  it("accepts bearer auth token or session", () => {
    const session = issueSessionToken("sess", "op");
    expect(
      authenticateBearer("Bearer test-token", "test-token", "sess").ok,
    ).toBe(true);
    expect(authenticateBearer(`Bearer ${session}`, "test-token", "sess").ok).toBe(
      true,
    );
    expect(authenticateBearer("Bearer nope", "test-token", "sess").ok).toBe(false);
  });
});

describe("orchestrator safe $0 loop", () => {
  it("creates, directs, dispatches mock agent, stores result", async () => {
    const orch = tempOrchestrator();
    const { job, loop } = await orch.runSafeZeroLoop("Reply SAFE_TEST_OK");
    expect(loop).toEqual([
      "create_job",
      "director+dispatch",
      "capture_result",
      "dashboard_updated",
    ]);
    expect(job.status).toBe("succeeded");
    expect(job.safeMode).toBe(true);
    expect(job.workerBranch.startsWith("agent/")).toBe(true);
    expect(job.cursorAgentId).toMatch(/^bc-mock-/);
    expect(job.resultSummary?.toLowerCase()).toContain("safe");
    expect(job.resultSummary).toContain("Canonical owner untouched");

    const dash = orch.getDashboard();
    expect(dash.jobs[0]?.id).toBe(job.id);
    expect(dash.audit.some((a) => a.action === "job.result")).toBe(true);
    expect(dash.killSwitch).toBe(false);
    expect(dash.cloudRenderEnabled).toBe(false);
    expect(dash.allowPaidGpuLaunch).toBe(false);
  });

  it("prevents duplicate active jobs", () => {
    const orch = tempOrchestrator();
    const a = orch.createJob({
      projectId: "proj_ddp_default",
      title: "Dup",
      goal: "x",
      idempotencyKey: "same-key",
    });
    const b = orch.createJob({
      projectId: "proj_ddp_default",
      title: "Dup",
      goal: "x",
      idempotencyKey: "same-key",
    });
    expect(a.job.id).toBe(b.job.id);
    expect(b.blockedReason).toBe("duplicate");
  });

  it("requires approval for forced paid actions and blocks until approved", async () => {
    const orch = tempOrchestrator();
    const created = orch.createJob({
      projectId: "proj_ddp_default",
      title: "Paid",
      goal: "would spend",
      forcePaid: true,
    });
    expect(created.job.status).toBe("awaiting_approval");
    expect(created.approval?.kind).toBe("paid_action");
    await expect(orch.runJob(created.job.id)).rejects.toThrow(/awaiting approval/i);

    orch.resolveApproval(created.approval!.id, "approved");
    const done = await orch.runJob(created.job.id);
    expect(done.status).toBe("succeeded");
  });

  it("honors kill switch and autopilot pause", async () => {
    const orch = tempOrchestrator();
    orch.setKillSwitch(true);
    expect(() =>
      orch.createJob({
        projectId: "proj_ddp_default",
        title: "Nope",
        goal: "x",
      }),
    ).toThrow(/kill switch/i);

    orch.setKillSwitch(false);
    orch.setAutopilot("paused");
    const job = orch.createJob({
      projectId: "proj_ddp_default",
      title: "Paused",
      goal: "x",
    }).job;
    await expect(orch.runJob(job.id, "autopilot")).rejects.toThrow(/paused/i);
  });

  it("recovers state across restart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ddp-cc-"));
    dirs.push(dir);
    const config = loadConfig({
      dataDir: dir,
      authToken: "t",
      sessionSecret: "s",
      safeMode: true,
    });
    const a = new ControlCenterOrchestrator(config);
    const { job } = await a.runSafeZeroLoop("persist me");

    const b = new ControlCenterOrchestrator(
      loadConfig({ dataDir: dir, authToken: "t", sessionSecret: "s", safeMode: true }),
    );
    const restored = b.store.getJob(job.id);
    expect(restored?.status).toBe("succeeded");
    expect(restored?.resultSummary).toBeTruthy();
  });

  it("refuses unsafe cloud flags at construction", () => {
    const dir = mkdtempSync(join(tmpdir(), "ddp-cc-"));
    dirs.push(dir);
    expect(
      () =>
        new ControlCenterOrchestrator(
          loadConfig({
            dataDir: dir,
            cloudRenderEnabled: true,
            safeMode: true,
          }),
        ),
    ).toThrow(/CLOUD_RENDER_ENABLED/);
  });

  it("cancels jobs via cursor client", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ddp-cc-"));
    dirs.push(dir);
    const cursor = new MockCursorClient();
    const orch = new ControlCenterOrchestrator(
      loadConfig({ dataDir: dir, safeMode: true, authToken: "t", sessionSecret: "s" }),
      { cursor },
    );
    const created = orch.createJob({
      projectId: "proj_ddp_default",
      title: "Cancel me",
      goal: "x",
    });
    // Force a non-terminal running state manually
    const agent = await cursor.createAgent({
      prompt: "x",
      name: "n",
      repoUrl: "https://github.com/example/ddp-control-center",
      startingRef: "cursor/canonical-ddp-baseline-ba2f",
    });
    const job = orch.store.getJob(created.job.id)!;
    job.cursorAgentId = agent.agentId;
    job.cursorRunId = agent.runId;
    job.status = "running";
    orch.store.upsertJob(job);
    const cancelled = await orch.cancelJob(job.id);
    expect(cancelled.status).toBe("cancelled");
  });
});

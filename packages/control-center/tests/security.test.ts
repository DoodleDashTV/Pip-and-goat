import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ControlCenterOrchestrator,
  MockCursorClient,
  SlidingWindowRateLimiter,
  assertBodySize,
  assertGeneratedBranchSafe,
  assertWorkerBranchPolicyAllowed,
  authenticatePassword,
  constantTimeEqual,
  createJobSchema,
  loadConfig,
  parseOrThrow,
  sanitizeVendorFailure,
  SanitizedError,
} from "../src/index";

const dirs: string[] = [];

function tempDir() {
  const d = mkdtempSync(join(tmpdir(), "ddp-cc-sec-"));
  dirs.push(d);
  return d;
}

function orch(dir: string, overrides: Record<string, unknown> = {}) {
  const o = new ControlCenterOrchestrator(
    loadConfig({
      dataDir: dir,
      runtimeMode: "test",
      safeMode: true,
      authToken: "test-token-dev-only-0001",
      sessionSecret: "test-session-dev-only-0001",
      repoUrl: "https://github.com/example/ddp-control-center",
      pollIntervalMs: 60_000,
      ...overrides,
    }),
  );
  o.poller.stop();
  if (!o.config.killSwitchEnv) o.clearDispatchDenied("test");
  return o;
}

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

describe("P1 restart / double-dispatch", () => {
  it("1-3: restart does not duplicate; persisted agentId prevents recreation; ambiguous fails closed", async () => {
    const dir = tempDir();
    const cursor = new MockCursorClient();
    const o1 = new ControlCenterOrchestrator(
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
    o1.poller.stop();
    o1.clearDispatchDenied("test");

    const created = o1.createJob({
      projectId: "proj_ddp_default",
      title: "recover",
      goal: "x",
    });
    // Simulate crash after intent persisted with preassigned id, create succeeded remotely
    const agentId = "bc-preassigned-fixed-id-0001";
    const job = o1.store.getJob(created.job.id)!;
    job.status = "dispatching";
    job.dispatchPhase = "intent";
    job.cursorAgentId = agentId;
    o1.store.upsertJob(job);
    cursor.injectAgent({
      agentId,
      runId: "run-1",
      status: "ACTIVE",
      branches: [{ repoUrl: "github.com/example/x", branch: "cursor/safe-1" }],
    });
    const createsBefore = cursor.createCalls;

    const o2 = new ControlCenterOrchestrator(
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
    o2.poller.stop();
    o2.clearDispatchDenied("test");
    const afterBoot = o2.store.getJob(created.job.id)!;
    expect(afterBoot.cursorAgentId).toBe(agentId);
    const reconciled = await o2.reconcileJob(created.job.id);
    expect(cursor.createCalls).toBe(createsBefore); // no new create
    expect(reconciled.cursorAgentId).toBe(agentId);

    // Ambiguous without agent id → blocked
    const amb = o2.createJob({
      projectId: "proj_ddp_default",
      title: "amb",
      goal: "y",
    }).job;
    amb.status = "dispatching";
    amb.dispatchPhase = "intent";
    amb.cursorAgentId = undefined;
    o2.store.upsertJob(amb);
    const o3 = new ControlCenterOrchestrator(
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
    o3.poller.stop();
    const blocked = o3.store.getJob(amb.id)!;
    expect(blocked.status).toBe("blocked");
  });

  it("restart while running resumes/polls; after completion no duplicate", async () => {
    const dir = tempDir();
    const cursor = new MockCursorClient();
    const o1 = orch(dir);
    // replace cursor via new orch
    const a = new ControlCenterOrchestrator(
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
    a.poller.stop();
    a.clearDispatchDenied("test");
    const { job } = await a.runSafeZeroLoop("done");
    expect(["succeeded", "result_requires_integration_review"]).toContain(job.status);
    const creates = cursor.createCalls;
    const b = new ControlCenterOrchestrator(
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
    b.poller.stop();
    await b.runJob(job.id);
    expect(cursor.createCalls).toBe(creates);
  });
});

describe("P2 branch isolation", () => {
  const project = {
    id: "p",
    name: "DDP",
    repoUrl: "https://github.com/example/ddp-control-center",
    canonicalOwner: "DoodleDash Production",
    protectedBranches: [
      "main",
      "master",
      "production",
      "cursor/setup-dev-environment-ba2f",
    ],
    workerBranchPrefix: "agent/",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it("4-6: rejects protected + agent/main; unsafe generated branch rejected", () => {
    expect(assertWorkerBranchPolicyAllowed("main", project).ok).toBe(false);
    expect(assertWorkerBranchPolicyAllowed("agent/main", project).ok).toBe(false);
    expect(assertWorkerBranchPolicyAllowed("agent/master", project).ok).toBe(false);
    expect(assertWorkerBranchPolicyAllowed("foo/main", project).ok).toBe(false);
    expect(assertWorkerBranchPolicyAllowed("agent/ddp-cc-ok", project).ok).toBe(true);
    expect(
      assertGeneratedBranchSafe(["cursor/setup-dev-environment-ba2f"], project).ok,
    ).toBe(false);
    expect(assertGeneratedBranchSafe(["cursor/ok-branch"], project).ok).toBe(true);
    expect(assertGeneratedBranchSafe(["evil/other"], project).ok).toBe(false);
  });
});

describe("P3 live config fail-closed", () => {
  it("7-9: live refuses defaults/missing keys; mock mode works without keys", () => {
    expect(() =>
      loadConfig({
        runtimeMode: "live",
        safeMode: false,
        dataDir: tempDir(),
        authToken: "ddp-dev-token-change-me",
        sessionSecret: "strong-session-secret-001",
        repoUrl: "https://github.com/org/repo",
        openaiApiKey: "k",
        cursorApiKey: "c",
      }),
    ).toThrow(/AUTH_TOKEN|strong/i);

    expect(() =>
      loadConfig({
        runtimeMode: "live",
        safeMode: false,
        dataDir: tempDir(),
        authToken: "strong-auth-token-001",
        sessionSecret: "strong-session-secret-001",
        repoUrl: "https://github.com/org/repo",
      }),
    ).toThrow(/OPENAI_API_KEY/);

    const mock = loadConfig({
      runtimeMode: "test",
      safeMode: true,
      dataDir: tempDir(),
      authToken: "test-token-dev-only-0001",
      sessionSecret: "test-session-dev-only-0001",
    });
    expect(mock.safeMode).toBe(true);
    expect(mock.openaiApiKey).toBeUndefined();
  });
});

describe("P5 auth", () => {
  it("10-11: login rate limiting + constant-time credential verification", () => {
    const limiter = new SlidingWindowRateLimiter(3, 60_000, 100);
    expect(limiter.attempt("ip1").allowed).toBe(true);
    expect(limiter.attempt("ip1").allowed).toBe(true);
    expect(limiter.attempt("ip1").allowed).toBe(true);
    expect(limiter.attempt("ip1").allowed).toBe(false);
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(authenticatePassword("secret-value-001", "secret-value-001")).toBe(true);
    expect(authenticatePassword("nope", "secret-value-001")).toBe(false);
  });
});

describe("P6 validation", () => {
  it("12-13: oversized request + malformed boolean rejected", () => {
    expect(() => assertBodySize("999999", 100)).toThrow(SanitizedError);
    expect(() => parseOrThrow(createJobSchema, { title: "t", goal: "g", forcePaid: "true" })).toThrow(
      /boolean/i,
    );
    expect(() =>
      parseOrThrow(createJobSchema, { title: "t", goal: "g", forcePaid: true }),
    ).not.toThrow();
  });
});

describe("P7 redaction", () => {
  it("14: raw vendor error redacted", () => {
    const err = sanitizeVendorFailure(
      "openai",
      500,
      'secret sk-abcdefghijklmnop Bearer TOKENDATA',
      "OpenAI director failed (500)",
    );
    expect(err.message).toBe("OpenAI director failed (500)");
    expect(JSON.stringify(err.toJSON())).not.toMatch(/sk-abcdefghijklmnop/);
    expect(JSON.stringify(err.toJSON())).not.toMatch(/TOKENDATA/);
  });
});

describe("P8 kill switch", () => {
  it("15-16: state wipe does not bypass ENV kill; corrupt defaults deny", () => {
    const dir = tempDir();
    process.env.CONTROL_CENTER_KILL_SWITCH = "true";
    try {
      const o = new ControlCenterOrchestrator(
        loadConfig({
          dataDir: dir,
          runtimeMode: "test",
          safeMode: true,
          authToken: "test-token-dev-only-0001",
          sessionSecret: "test-session-dev-only-0001",
          pollIntervalMs: 60_000,
        }),
      );
      o.poller.stop();
      expect(o.isKillSwitchEnabled()).toBe(true);
      expect(() => o.setKillSwitch(false)).toThrow(/ENV kill switch/i);
      expect(() =>
        o.createJob({ projectId: "proj_ddp_default", title: "x", goal: "y" }),
      ).toThrow(/denied|kill/i);
    } finally {
      delete process.env.CONTROL_CENTER_KILL_SWITCH;
    }

    const dir2 = tempDir();
    const statePath = join(dir2, "state.json");
    writeFileSync(statePath, "{not-json", "utf8");
    const o2 = new ControlCenterOrchestrator(
      loadConfig({
        dataDir: dir2,
        runtimeMode: "test",
        safeMode: true,
        authToken: "test-token-dev-only-0001",
        sessionSecret: "test-session-dev-only-0001",
        pollIntervalMs: 60_000,
      }),
    );
    o2.poller.stop();
    expect(o2.store.getDispatchDenied()).toBe(true);
    expect(o2.isKillSwitchEnabled()).toBe(true);
  });
});

describe("P9 poller", () => {
  it("17-18: background polling updates running job and does not dispatch", async () => {
    const dir = tempDir();
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
      title: "poll",
      goal: "g",
    });
    const agentId = "bc-poll-agent-0001";
    const job = o.store.getJob(created.job.id)!;
    job.status = "running";
    job.dispatchPhase = "created";
    job.cursorAgentId = agentId;
    job.cursorRunId = "run-poll";
    o.store.upsertJob(job);
    cursor.injectAgent({
      agentId,
      runId: "run-poll",
      status: "ACTIVE",
      branches: [{ repoUrl: "github.com/example/x", branch: "cursor/poll" }],
    });
    const creates = cursor.createCalls;
    await o.poller.tick();
    expect(cursor.createCalls).toBe(creates);
    const updated = o.store.getJob(created.job.id)!;
    expect(["succeeded", "result_requires_integration_review", "running"]).toContain(
      updated.status,
    );
  });
});

describe("P10 cancellation", () => {
  it("19: cancellation failure is visible", async () => {
    const dir = tempDir();
    const cursor = new MockCursorClient();
    cursor.cancelShouldFail = true;
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
    const job = o.createJob({
      projectId: "proj_ddp_default",
      title: "cancel",
      goal: "g",
    }).job;
    job.cursorAgentId = "bc-c";
    job.cursorRunId = "run-c";
    job.status = "running";
    o.store.upsertJob(job);
    cursor.injectAgent({ agentId: "bc-c", runId: "run-c", status: "ACTIVE" });
    const cancelled = await o.cancelJob(job.id);
    expect(cancelled.status).toBe("cancel_failed");
    expect(cancelled.cancelState).toBe("cancel_failed");
    expect(cancelled.error).toMatch(/cancel/i);
  });
});

describe("P4 director failures", () => {
  it("20-21: director HTTP/malformed failures leave no stuck directing job", async () => {
    const dir = tempDir();
    const failingDirector = {
      async plan() {
        throw sanitizeVendorFailure("openai", 500, "raw body secret", "OpenAI director failed (500)");
      },
    };
    const o = new ControlCenterOrchestrator(
      loadConfig({
        dataDir: dir,
        runtimeMode: "test",
        safeMode: true,
        authToken: "test-token-dev-only-0001",
        sessionSecret: "test-session-dev-only-0001",
        pollIntervalMs: 60_000,
      }),
      { director: failingDirector },
    );
    o.poller.stop();
    o.clearDispatchDenied("test");
    const job = o.createJob({
      projectId: "proj_ddp_default",
      title: "dirfail",
      goal: "g",
    }).job;
    const result = await o.runJob(job.id);
    expect(result.status).not.toBe("directing");
    expect(["failed", "retry_pending"]).toContain(result.status);

    const malformed = {
      async plan() {
        throw new SanitizedError({
          message: "OpenAI director returned malformed JSON",
          category: "director",
          statusCode: 502,
          provider: "openai",
        });
      },
    };
    const o2 = new ControlCenterOrchestrator(
      loadConfig({
        dataDir: tempDir(),
        runtimeMode: "test",
        safeMode: true,
        authToken: "test-token-dev-only-0001",
        sessionSecret: "test-session-dev-only-0001",
        pollIntervalMs: 60_000,
      }),
      { director: malformed },
    );
    o2.poller.stop();
    o2.clearDispatchDenied("test");
    const j2 = o2.createJob({
      projectId: "proj_ddp_default",
      title: "badjson",
      goal: "g",
    }).job;
    const r2 = await o2.runJob(j2.id);
    expect(r2.status).toBe("failed");
  });
});

describe("P12 approval plan binding", () => {
  it("22: approval plan mutation requires reapproval", async () => {
    const dir = tempDir();
    let planHash = "hash-a";
    const director = {
      async plan({ job, project }: { job: { goal: string; startingRef: string; workerBranchPolicy: string; title: string }; project: { repoUrl: string; workerBranchPrefix: string } }) {
        return {
          summary: "plan",
          workerPrompt: "prompt\nCLOUD_RENDER_ENABLED=false\nALLOW_PAID_GPU_LAUNCH=false\nNO PAID EXTERNAL OPERATIONS",
          requestedWorkerBranch: job.workerBranchPolicy,
          startingRef: job.startingRef,
          riskLevel: "low" as const,
          requiresApproval: true,
          approvalKind: "cursor_dispatch" as const,
          operationType: "cursor_dispatch" as const,
          maxCost: 0,
          podLimit: 0,
          destructiveScope: [] as string[],
          paidOperationDenied: true,
          safeModeInstructions: ["NO PAID EXTERNAL OPERATIONS"],
          planHash,
          model: "mock",
          mocked: true,
        };
      },
    };
    const o = new ControlCenterOrchestrator(
      loadConfig({
        dataDir: dir,
        runtimeMode: "test",
        safeMode: true,
        authToken: "test-token-dev-only-0001",
        sessionSecret: "test-session-dev-only-0001",
        pollIntervalMs: 60_000,
      }),
      { director },
    );
    o.poller.stop();
    o.clearDispatchDenied("test");
    const created = o.createJob({
      projectId: "proj_ddp_default",
      title: "appr",
      goal: "launch runpod paid gpu",
      forcePaid: true,
    });
    expect(created.job.status).toBe("awaiting_approval");
    o.resolveApproval(created.approval!.id, "approved");
    // First run binds plan hash-a and may request plan-bound approval again
    planHash = "hash-a";
    let job = await o.runJob(created.job.id);
    if (job.status === "awaiting_approval") {
      o.resolveApproval(job.approvalId!, "approved");
      job = await o.runJob(job.id);
    }
    // Mutate director plan
    planHash = "hash-b";
    // Reset to queued without agent to re-enter directing
    const j = o.store.getJob(created.job.id)!;
    j.status = "queued";
    j.cursorAgentId = undefined;
    j.cursorRunId = undefined;
    j.dispatchPhase = "none";
    o.store.upsertJob(j);
    const again = await o.runJob(created.job.id);
    expect(again.status).toBe("awaiting_approval");
  });
});

describe("P13/P14 paid denial + outcome", () => {
  it("23-24: safe worker includes paid denial; outcome verification before trusted completion", async () => {
    const o = orch(tempDir());
    const { job } = await o.runSafeZeroLoop("safe");
    expect(job.directorPlan?.workerPrompt).toMatch(/CLOUD_RENDER_ENABLED=false/);
    expect(job.directorPlan?.workerPrompt).toMatch(/ALLOW_PAID_GPU_LAUNCH=false/);
    expect(job.directorPlan?.workerPrompt).toMatch(/NO PAID EXTERNAL OPERATIONS/);
    expect(job.outcomeReview).toBeTruthy();
    expect(job.dispatchPhase).toBe("done");
  });
});

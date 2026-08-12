import type { ControlCenterConfig } from "./config";
import { assertSafetyDefaults, CANONICAL_OWNER } from "./config";
import { JsonStore } from "./store";
import { createDirector, type DirectorClient } from "./openai-director";
import { createCursorClient, type CursorClient } from "./cursor-client";
import {
  assertStartingRefReadable,
  assertWorkerBranchAllowed,
} from "./branch-protection";
import { hashKey, newId, nowIso, slugifyBranch } from "./ids";
import type {
  ApprovalRecord,
  CreateJobInput,
  DispatchResult,
  JobRecord,
  ProjectRecord,
} from "./types";

export class ControlCenterOrchestrator {
  readonly store: JsonStore;
  readonly config: ControlCenterConfig;
  private director: DirectorClient;
  private cursor: CursorClient;

  constructor(
    config: ControlCenterConfig,
    deps?: { director?: DirectorClient; cursor?: CursorClient; store?: JsonStore },
  ) {
    const violations = assertSafetyDefaults(config);
    if (violations.length) {
      throw new Error(violations.join("; "));
    }
    this.config = config;
    this.store = deps?.store || new JsonStore(config.dataDir);
    this.director = deps?.director || createDirector(config);
    this.cursor = deps?.cursor || createCursorClient(config);
    this.ensureDefaultProject();
    this.recoverOnBoot();
  }

  private ensureDefaultProject(): ProjectRecord {
    const existing = this.store.getState().projects[0];
    if (existing) return existing;
    const project: ProjectRecord = {
      id: "proj_ddp_default",
      name: "Doodle Dash Production",
      repoUrl: this.config.repoUrl,
      canonicalOwner: CANONICAL_OWNER,
      protectedBranches: [...this.config.protectedBranches],
      workerBranchPrefix: this.config.workerBranchPrefix,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.store.upsertProject(project);
    this.audit("system.recovery", "system", "Seeded default DDP project", {
      projectId: project.id,
    });
    return project;
  }

  private recoverOnBoot(): void {
    if (this.config.killSwitchEnv) {
      this.store.setKillSwitch(true);
    }
    const interrupted = this.store
      .listJobs()
      .filter((j) =>
        ["directing", "dispatching", "running"].includes(j.status),
      );
    for (const job of interrupted) {
      // Restart recovery: leave running jobs pollable; mark directing/dispatching as queued.
      if (job.status === "directing" || job.status === "dispatching") {
        job.status = "queued";
        job.updatedAt = nowIso();
        this.store.upsertJob(job);
      }
    }
    this.audit(
      "system.recovery",
      "system",
      `Boot recovery complete (safeMode=${this.config.safeMode}, killSwitch=${this.isKillSwitchEnabled()}, interrupted=${interrupted.length})`,
    );
  }

  private audit(
    action: Parameters<JsonStore["appendAudit"]>[0]["action"],
    actor: string,
    detail: string,
    meta?: Record<string, unknown>,
    jobId?: string,
  ): void {
    this.store.appendAudit({
      id: newId("audit"),
      at: nowIso(),
      action,
      actor,
      detail,
      meta,
      jobId,
    });
  }

  isKillSwitchEnabled(): boolean {
    return this.config.killSwitchEnv || this.store.getKillSwitch();
  }

  setKillSwitch(enabled: boolean, actor = "operator"): void {
    this.store.setKillSwitch(enabled);
    this.audit(
      enabled ? "kill_switch.enabled" : "kill_switch.disabled",
      actor,
      enabled ? "Kill switch ENABLED" : "Kill switch DISABLED",
    );
  }

  setAutopilot(state: "running" | "paused", actor = "operator"): void {
    this.store.setAutopilot(state);
    this.audit(
      state === "paused" ? "autopilot.paused" : "autopilot.resumed",
      actor,
      `Autopilot ${state}`,
    );
  }

  getDashboard() {
    const state = this.store.getState();
    return {
      safeMode: this.config.safeMode,
      killSwitch: this.isKillSwitchEnabled(),
      autopilot: state.autopilot,
      canonicalOwner: CANONICAL_OWNER,
      cloudRenderEnabled: this.config.cloudRenderEnabled,
      allowPaidGpuLaunch: this.config.allowPaidGpuLaunch,
      project: state.projects[0],
      jobs: this.store.listJobs(),
      approvals: this.store.listApprovals().filter((a) => a.status === "pending"),
      audit: this.store.listAudit(50),
      credentials: {
        openai: Boolean(this.config.openaiApiKey),
        cursor: Boolean(this.config.cursorApiKey),
      },
    };
  }

  createJob(input: CreateJobInput): DispatchResult {
    if (this.isKillSwitchEnabled()) {
      throw new Error("Kill switch is enabled — refusing new jobs");
    }

    const project =
      this.store.getProject(input.projectId) || this.ensureDefaultProject();
    const actor = input.actor || "operator";
    const startingRef = input.startingRef || "cursor/canonical-ddp-baseline-ba2f";
    const requested =
      input.requestedBranch ||
      `${project.workerBranchPrefix}ddp-cc-${slugifyBranch(input.title)}`;

    const branchCheck = assertWorkerBranchAllowed(requested, project);
    if (!branchCheck.ok || !branchCheck.workerBranch) {
      this.audit("job.canonical_blocked", actor, branchCheck.reason || "blocked");
      throw new Error(branchCheck.reason || "Branch blocked");
    }
    const startCheck = assertStartingRefReadable(startingRef, project);
    if (!startCheck.ok) {
      throw new Error(startCheck.reason || "Invalid startingRef");
    }

    const idempotencyKey =
      input.idempotencyKey ||
      hashKey([project.id, input.title, input.goal, branchCheck.workerBranch]);
    const existing = this.store.findJobByIdempotency(idempotencyKey);
    if (existing && !["failed", "cancelled"].includes(existing.status)) {
      this.audit(
        "job.duplicate_blocked",
        actor,
        `Duplicate job prevented for key ${idempotencyKey}`,
        { existingJobId: existing.id },
        existing.id,
      );
      return { job: existing, blockedReason: "duplicate" };
    }

    const requiresApproval = Boolean(
      input.forcePaid || input.forceDestructive || !this.config.safeMode,
    );

    const job: JobRecord = {
      id: newId("job"),
      projectId: project.id,
      title: input.title,
      goal: input.goal,
      status: requiresApproval ? "awaiting_approval" : "queued",
      idempotencyKey,
      requestedBranch: requested,
      workerBranch: branchCheck.workerBranch,
      startingRef,
      safeMode: this.config.safeMode,
      requiresApproval,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    let approval: ApprovalRecord | undefined;
    if (requiresApproval) {
      approval = {
        id: newId("appr"),
        jobId: job.id,
        kind: input.forcePaid
          ? "paid_action"
          : input.forceDestructive
            ? "destructive"
            : "cursor_dispatch",
        status: "pending",
        reason: input.forcePaid
          ? "Paid/destructive action requires explicit approval"
          : "Live Cursor dispatch requires approval outside safe $0 mode",
        requestedAt: nowIso(),
      };
      job.approvalId = approval.id;
      this.store.upsertApproval(approval);
      this.audit(
        "approval.requested",
        actor,
        approval.reason,
        { kind: approval.kind },
        job.id,
      );
    }

    this.store.upsertJob(job);
    this.audit("job.created", actor, `Created job ${job.title}`, undefined, job.id);
    return { job, approval };
  }

  resolveApproval(
    approvalId: string,
    decision: "approved" | "rejected",
    actor = "operator",
  ): ApprovalRecord {
    const approval = this.store.getApproval(approvalId);
    if (!approval) throw new Error("Approval not found");
    if (approval.status !== "pending") {
      throw new Error(`Approval already ${approval.status}`);
    }
    approval.status = decision;
    approval.resolvedAt = nowIso();
    approval.resolvedBy = actor;
    this.store.upsertApproval(approval);

    const job = this.store.getJob(approval.jobId);
    if (job) {
      if (decision === "approved") {
        job.status = "queued";
        job.requiresApproval = false;
      } else {
        job.status = "cancelled";
        job.error = "Approval rejected";
        job.completedAt = nowIso();
      }
      job.updatedAt = nowIso();
      this.store.upsertJob(job);
    }

    this.audit(
      decision === "approved" ? "approval.approved" : "approval.rejected",
      actor,
      `Approval ${decision}`,
      undefined,
      approval.jobId,
    );
    return approval;
  }

  async runJob(jobId: string, actor = "system"): Promise<JobRecord> {
    if (this.isKillSwitchEnabled()) {
      throw new Error("Kill switch is enabled — refusing to run jobs");
    }
    if (this.store.getAutopilot() === "paused" && actor === "autopilot") {
      throw new Error("Autopilot is paused");
    }

    const job = this.store.getJob(jobId);
    if (!job) throw new Error("Job not found");
    if (job.status === "awaiting_approval") {
      throw new Error("Job is awaiting approval");
    }
    if (["succeeded", "cancelled", "running", "dispatching"].includes(job.status)) {
      return job;
    }

    const project = this.store.getProject(job.projectId);
    if (!project) throw new Error("Project missing");

    job.status = "directing";
    job.updatedAt = nowIso();
    this.store.upsertJob(job);

    const plan = await this.director.plan({ job, project });
    const branchCheck = assertWorkerBranchAllowed(plan.workerBranch, project);
    if (!branchCheck.ok || !branchCheck.workerBranch) {
      job.status = "blocked";
      job.error = branchCheck.reason;
      job.updatedAt = nowIso();
      this.store.upsertJob(job);
      this.audit(
        "job.canonical_blocked",
        actor,
        branchCheck.reason || "blocked",
        undefined,
        job.id,
      );
      return job;
    }

    job.directorPlan = { ...plan, workerBranch: branchCheck.workerBranch };
    job.workerBranch = branchCheck.workerBranch;
    job.status = "dispatching";
    job.updatedAt = nowIso();
    this.store.upsertJob(job);
    this.audit(
      "director.plan",
      actor,
      plan.summary,
      { mocked: plan.mocked, model: plan.model },
      job.id,
    );

    if (plan.requiresApproval && !job.approvalId) {
      const approval: ApprovalRecord = {
        id: newId("appr"),
        jobId: job.id,
        kind: plan.approvalKind || "cursor_dispatch",
        status: "pending",
        reason: "Director marked plan as requiring approval",
        requestedAt: nowIso(),
      };
      job.approvalId = approval.id;
      job.status = "awaiting_approval";
      job.updatedAt = nowIso();
      this.store.upsertApproval(approval);
      this.store.upsertJob(job);
      this.audit("approval.requested", actor, approval.reason, undefined, job.id);
      return job;
    }

    const agent = await this.cursor.createAgent({
      prompt: plan.workerPrompt,
      name: `DDP CC: ${job.title}`.slice(0, 100),
      repoUrl: project.repoUrl,
      startingRef: plan.startingRef || job.startingRef,
      autoCreatePR: false,
    });

    job.cursorAgentId = agent.agentId;
    job.cursorRunId = agent.runId;
    job.cursorUrl = agent.url;
    job.status = "running";
    job.updatedAt = nowIso();
    this.store.upsertJob(job);
    this.audit(
      "job.dispatch",
      actor,
      `Dispatched Cursor agent ${agent.agentId}`,
      { safeMode: this.config.safeMode, runId: agent.runId },
      job.id,
    );

    // In safe/mock mode the mock agent finishes immediately — capture result.
    if (this.config.safeMode || agent.status === "SUCCEEDED") {
      return this.captureResult(job.id, actor);
    }
    return job;
  }

  async refreshJob(jobId: string, actor = "system"): Promise<JobRecord> {
    const job = this.store.getJob(jobId);
    if (!job) throw new Error("Job not found");
    if (["succeeded", "failed", "cancelled", "blocked"].includes(job.status)) {
      return job;
    }
    if (!job.cursorAgentId) return job;

    const agent = await this.cursor.getAgent(job.cursorAgentId);
    job.cursorUrl = agent.url || job.cursorUrl;
    job.updatedAt = nowIso();

    const terminal =
      agent.status === "FINISHED" ||
      agent.status === "SUCCEEDED" ||
      agent.status === "ERROR" ||
      agent.status === "EXPIRED" ||
      agent.status === "CANCELLED";

    if (terminal) {
      if (agent.status === "CANCELLED") {
        job.status = "cancelled";
        job.completedAt = nowIso();
      } else if (agent.status === "ERROR" || agent.status === "EXPIRED") {
        job.status = "failed";
        job.error = `Cursor agent status ${agent.status}`;
        job.completedAt = nowIso();
      } else {
        return this.captureResult(job.id, actor);
      }
    } else {
      job.status = "running";
    }
    this.store.upsertJob(job);
    return job;
  }

  async captureResult(jobId: string, actor = "system"): Promise<JobRecord> {
    const job = this.store.getJob(jobId);
    if (!job) throw new Error("Job not found");
    if (job.status === "succeeded" && job.resultSummary) {
      return job;
    }

    const summary = job.directorPlan
      ? `Director: ${job.directorPlan.summary}`
      : "Completed";
    job.resultSummary = [
      summary,
      `Worker branch: ${job.workerBranch}`,
      `Cursor agent: ${job.cursorAgentId || "n/a"}`,
      `Safe mode: ${job.safeMode}`,
      "Canonical owner untouched: DoodleDash Production",
    ].join(" | ");
    job.resultPayload = {
      directorPlan: job.directorPlan,
      cursorAgentId: job.cursorAgentId,
      cursorRunId: job.cursorRunId,
      cursorUrl: job.cursorUrl,
      workerBranch: job.workerBranch,
      safeMode: job.safeMode,
    };
    job.status = "succeeded";
    job.completedAt = nowIso();
    job.updatedAt = nowIso();
    this.store.upsertJob(job);
    this.audit("job.result", actor, job.resultSummary, undefined, job.id);
    return job;
  }

  async cancelJob(jobId: string, actor = "operator"): Promise<JobRecord> {
    const job = this.store.getJob(jobId);
    if (!job) throw new Error("Job not found");
    if (job.cursorAgentId && job.cursorRunId) {
      try {
        await this.cursor.cancelRun(job.cursorAgentId, job.cursorRunId);
      } catch (err) {
        this.audit(
          "job.cancel",
          actor,
          `Cancel API error: ${err instanceof Error ? err.message : String(err)}`,
          undefined,
          job.id,
        );
      }
    }
    job.status = "cancelled";
    job.completedAt = nowIso();
    job.updatedAt = nowIso();
    this.store.upsertJob(job);
    this.audit("job.cancel", actor, "Job cancelled", undefined, job.id);
    return job;
  }

  async runSafeZeroLoop(goal = "Reply with SAFE_TEST_OK and stop."): Promise<{
    job: JobRecord;
    loop: string[];
  }> {
    const loop: string[] = [];
    loop.push("create_job");
    const created = this.createJob({
      projectId: "proj_ddp_default",
      title: "Safe $0 Cursor test",
      goal,
      idempotencyKey: hashKey(["safe-zero-loop", goal, nowIso().slice(0, 13)]),
      actor: "safe-zero-loop",
    });
    loop.push("director+dispatch");
    const running = await this.runJob(created.job.id, "safe-zero-loop");
    loop.push("capture_result");
    const done = await this.refreshJob(running.id, "safe-zero-loop");
    loop.push("dashboard_updated");
    return { job: done, loop };
  }
}

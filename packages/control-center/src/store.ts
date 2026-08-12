import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type {
  ApprovalRecord,
  AuditRecord,
  ControlCenterState,
  JobRecord,
  ProjectRecord,
} from "./types";
import { nowIso } from "./ids";

const EMPTY_STATE = (): ControlCenterState => ({
  version: 2,
  killSwitch: false,
  dispatchDenied: false,
  autopilot: "paused",
  projects: [],
  jobs: [],
  approvals: [],
  audit: [],
  updatedAt: nowIso(),
});

export class JsonStore {
  readonly path: string;
  private state: ControlCenterState;
  /** Set when recovery from corrupt/missing state denies dispatch. */
  recoveredUnsafe = false;

  constructor(dataDir: string, filename = "state.json") {
    this.path = join(dataDir, filename);
    mkdirSync(dirname(this.path), { recursive: true });
    this.state = this.load();
  }

  private load(): ControlCenterState {
    if (!existsSync(this.path)) {
      const fresh = EMPTY_STATE();
      // Missing state: deny dispatch until operator enables (fail closed).
      fresh.dispatchDenied = true;
      fresh.killSwitch = true;
      fresh.audit.push({
        id: `audit_recovery_${Date.now()}`,
        at: nowIso(),
        action: "system.recovery",
        actor: "system",
        detail:
          "No persisted state found — dispatch denied and kill switch latched until operator clears",
      });
      this.recoveredUnsafe = true;
      this.persist(fresh);
      return fresh;
    }
    try {
      const raw = readFileSync(this.path, "utf8");
      const parsed = JSON.parse(raw) as {
        version?: number;
        killSwitch?: boolean;
        dispatchDenied?: boolean;
        autopilot?: ControlCenterState["autopilot"];
        projects?: ProjectRecord[];
        jobs?: Array<JobRecord & { workerBranch?: string }>;
        approvals?: ApprovalRecord[];
        audit?: AuditRecord[];
        updatedAt?: string;
      };
      if (!parsed || (parsed.version !== 1 && parsed.version !== 2) || !Array.isArray(parsed.jobs)) {
        throw new Error("invalid state shape");
      }
      // migrate v1 → v2
      if (parsed.version === 1) {
        parsed.version = 2;
        parsed.dispatchDenied = false;
        for (const job of parsed.jobs) {
          if (!job.workerBranchPolicy && job.workerBranch) {
            job.workerBranchPolicy = job.workerBranch;
          }
          if (!job.dispatchPhase) job.dispatchPhase = job.cursorAgentId ? "created" : "none";
        }
      }
      if (typeof parsed.dispatchDenied !== "boolean") parsed.dispatchDenied = false;
      return {
        version: 2,
        killSwitch: Boolean(parsed.killSwitch),
        dispatchDenied: Boolean(parsed.dispatchDenied),
        autopilot: parsed.autopilot || "paused",
        projects: parsed.projects || [],
        jobs: parsed.jobs || [],
        approvals: parsed.approvals || [],
        audit: parsed.audit || [],
        updatedAt: parsed.updatedAt || nowIso(),
      };
    } catch {
      const backup = `${this.path}.corrupt-${Date.now()}`;
      try {
        renameSync(this.path, backup);
      } catch {
        /* ignore */
      }
      const fresh = EMPTY_STATE();
      fresh.dispatchDenied = true;
      fresh.killSwitch = true;
      fresh.audit.push({
        id: `audit_recovery_${Date.now()}`,
        at: nowIso(),
        action: "system.recovery",
        actor: "system",
        detail: `Corrupt state quarantined to ${backup}; dispatch denied until operator clears`,
      });
      this.recoveredUnsafe = true;
      this.persist(fresh);
      return fresh;
    }
  }

  private persist(state: ControlCenterState): void {
    state.updatedAt = nowIso();
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
    renameSync(tmp, this.path);
  }

  getState(): ControlCenterState {
    return structuredClone(this.state);
  }

  reload(): ControlCenterState {
    this.state = this.load();
    return this.getState();
  }

  update(mutator: (state: ControlCenterState) => void): ControlCenterState {
    mutator(this.state);
    this.persist(this.state);
    return this.getState();
  }

  upsertProject(project: ProjectRecord): ProjectRecord {
    this.update((s) => {
      const idx = s.projects.findIndex((p) => p.id === project.id);
      if (idx >= 0) s.projects[idx] = project;
      else s.projects.push(project);
    });
    return project;
  }

  getProject(id: string): ProjectRecord | undefined {
    return this.state.projects.find((p) => p.id === id);
  }

  listJobs(): JobRecord[] {
    return [...this.state.jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getJob(id: string): JobRecord | undefined {
    return this.state.jobs.find((j) => j.id === id);
  }

  upsertJob(job: JobRecord): JobRecord {
    this.update((s) => {
      const idx = s.jobs.findIndex((j) => j.id === job.id);
      if (idx >= 0) s.jobs[idx] = job;
      else s.jobs.push(job);
    });
    return job;
  }

  findJobByIdempotency(key: string): JobRecord | undefined {
    return this.state.jobs.find((j) => j.idempotencyKey === key);
  }

  listApprovals(): ApprovalRecord[] {
    return [...this.state.approvals].sort((a, b) =>
      b.requestedAt.localeCompare(a.requestedAt),
    );
  }

  getApproval(id: string): ApprovalRecord | undefined {
    return this.state.approvals.find((a) => a.id === id);
  }

  upsertApproval(approval: ApprovalRecord): ApprovalRecord {
    this.update((s) => {
      const idx = s.approvals.findIndex((a) => a.id === approval.id);
      if (idx >= 0) s.approvals[idx] = approval;
      else s.approvals.push(approval);
    });
    return approval;
  }

  appendAudit(entry: AuditRecord): AuditRecord {
    this.update((s) => {
      s.audit.unshift(entry);
      if (s.audit.length > 2000) s.audit.length = 2000;
    });
    return entry;
  }

  listAudit(limit = 100): AuditRecord[] {
    return this.state.audit.slice(0, limit);
  }

  setKillSwitch(enabled: boolean): void {
    this.update((s) => {
      s.killSwitch = enabled;
    });
  }

  getKillSwitch(): boolean {
    return this.state.killSwitch;
  }

  setDispatchDenied(denied: boolean): void {
    this.update((s) => {
      s.dispatchDenied = denied;
    });
  }

  getDispatchDenied(): boolean {
    return this.state.dispatchDenied;
  }

  setAutopilot(state: ControlCenterState["autopilot"]): void {
    this.update((s) => {
      s.autopilot = state;
    });
  }

  getAutopilot(): ControlCenterState["autopilot"] {
    return this.state.autopilot;
  }
}

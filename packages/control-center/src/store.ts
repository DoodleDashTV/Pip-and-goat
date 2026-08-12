import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
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
  version: 1,
  killSwitch: false,
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

  constructor(dataDir: string, filename = "state.json") {
    this.path = join(dataDir, filename);
    mkdirSync(dirname(this.path), { recursive: true });
    this.state = this.load();
  }

  private load(): ControlCenterState {
    if (!existsSync(this.path)) {
      const fresh = EMPTY_STATE();
      this.persist(fresh);
      return fresh;
    }
    try {
      const raw = readFileSync(this.path, "utf8");
      const parsed = JSON.parse(raw) as ControlCenterState;
      if (parsed.version !== 1 || !Array.isArray(parsed.jobs)) {
        throw new Error("invalid state shape");
      }
      return parsed;
    } catch {
      const backup = `${this.path}.corrupt-${Date.now()}`;
      try {
        renameSync(this.path, backup);
      } catch {
        /* ignore */
      }
      const fresh = EMPTY_STATE();
      fresh.audit.push({
        id: `audit_recovery_${Date.now()}`,
        at: nowIso(),
        action: "system.recovery",
        actor: "system",
        detail: `Recovered from corrupt state; previous file moved to ${backup}`,
      });
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

  setAutopilot(state: ControlCenterState["autopilot"]): void {
    this.update((s) => {
      s.autopilot = state;
    });
  }

  getAutopilot(): ControlCenterState["autopilot"] {
    return this.state.autopilot;
  }
}

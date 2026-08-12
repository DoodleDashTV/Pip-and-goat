export type JobStatus =
  | "queued"
  | "awaiting_approval"
  | "directing"
  | "dispatching"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "blocked";

export type ApprovalKind =
  | "cursor_dispatch"
  | "paid_action"
  | "destructive"
  | "merge_request";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export type AutopilotState = "running" | "paused";

export type AuditAction =
  | "job.created"
  | "job.updated"
  | "job.duplicate_blocked"
  | "job.canonical_blocked"
  | "job.dispatch"
  | "job.cancel"
  | "job.result"
  | "approval.requested"
  | "approval.approved"
  | "approval.rejected"
  | "autopilot.paused"
  | "autopilot.resumed"
  | "kill_switch.enabled"
  | "kill_switch.disabled"
  | "auth.login"
  | "auth.denied"
  | "director.plan"
  | "system.recovery";

export interface ProjectRecord {
  id: string;
  name: string;
  repoUrl: string;
  canonicalOwner: string;
  protectedBranches: string[];
  workerBranchPrefix: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobRecord {
  id: string;
  projectId: string;
  title: string;
  goal: string;
  status: JobStatus;
  idempotencyKey: string;
  requestedBranch: string;
  workerBranch: string;
  startingRef: string;
  directorPlan?: DirectorPlan;
  cursorAgentId?: string;
  cursorRunId?: string;
  cursorUrl?: string;
  resultSummary?: string;
  resultPayload?: unknown;
  error?: string;
  safeMode: boolean;
  requiresApproval: boolean;
  approvalId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ApprovalRecord {
  id: string;
  jobId: string;
  kind: ApprovalKind;
  status: ApprovalStatus;
  reason: string;
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface AuditRecord {
  id: string;
  at: string;
  action: AuditAction;
  actor: string;
  jobId?: string;
  detail: string;
  meta?: Record<string, unknown>;
}

export interface DirectorPlan {
  summary: string;
  workerPrompt: string;
  workerBranch: string;
  startingRef: string;
  riskLevel: "low" | "medium" | "high";
  requiresApproval: boolean;
  approvalKind?: ApprovalKind;
  safeModeInstructions: string[];
  model: string;
  mocked: boolean;
}

export interface ControlCenterState {
  version: 1;
  killSwitch: boolean;
  autopilot: AutopilotState;
  projects: ProjectRecord[];
  jobs: JobRecord[];
  approvals: ApprovalRecord[];
  audit: AuditRecord[];
  updatedAt: string;
}

export interface CreateJobInput {
  projectId: string;
  title: string;
  goal: string;
  requestedBranch?: string;
  startingRef?: string;
  idempotencyKey?: string;
  forcePaid?: boolean;
  forceDestructive?: boolean;
  actor?: string;
}

export interface DispatchResult {
  job: JobRecord;
  approval?: ApprovalRecord;
  blockedReason?: string;
}

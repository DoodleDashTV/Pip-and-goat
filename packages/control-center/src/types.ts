export type JobStatus =
  | "queued"
  | "awaiting_approval"
  | "directing"
  | "ready_to_dispatch"
  | "dispatching"
  | "dispatched"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "cancel_pending"
  | "cancel_failed"
  | "blocked"
  | "retry_pending"
  | "result_requires_integration_review";

export type ApprovalKind =
  | "cursor_dispatch"
  | "paid_action"
  | "destructive"
  | "merge_request";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export type AutopilotState = "running" | "paused";

export type DispatchPhase =
  | "none"
  | "intent"
  | "created"
  | "reconcile_needed"
  | "done";

export type AuditAction =
  | "job.created"
  | "job.updated"
  | "job.duplicate_blocked"
  | "job.canonical_blocked"
  | "job.dispatch_intent"
  | "job.dispatch"
  | "job.cancel"
  | "job.cancel_failed"
  | "job.result"
  | "job.reconcile"
  | "job.outcome_review"
  | "approval.requested"
  | "approval.approved"
  | "approval.rejected"
  | "approval.invalidated"
  | "autopilot.paused"
  | "autopilot.resumed"
  | "kill_switch.enabled"
  | "kill_switch.disabled"
  | "auth.login"
  | "auth.denied"
  | "auth.rate_limited"
  | "director.plan"
  | "director.failed"
  | "system.recovery"
  | "poller.tick";

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

export interface ApprovalBinding {
  planHash: string;
  operationType: ApprovalKind;
  maxCost: number;
  podLimit: number;
  destructiveScope: string[];
  repoUrl: string;
  branchPolicy: string;
  startingRef: string;
  expiry: string;
}

export interface DirectorPlan {
  summary: string;
  workerPrompt: string;
  requestedWorkerBranch: string;
  startingRef: string;
  riskLevel: "low" | "medium" | "high";
  requiresApproval: boolean;
  approvalKind?: ApprovalKind;
  operationType: ApprovalKind;
  maxCost: number;
  podLimit: number;
  destructiveScope: string[];
  paidOperationDenied: boolean;
  safeModeInstructions: string[];
  planHash: string;
  model: string;
  mocked: boolean;
}

export interface JobRecord {
  id: string;
  projectId: string;
  title: string;
  goal: string;
  status: JobStatus;
  idempotencyKey: string;
  requestedBranch: string;
  /** Policy intent / documentation only — Cursor API auto-generates cursor/* branches. */
  workerBranchPolicy: string;
  startingRef: string;
  directorPlan?: DirectorPlan;
  dispatchPhase: DispatchPhase;
  /** Pre-assigned or returned Cursor agent id (bc-...). */
  cursorAgentId?: string;
  cursorRunId?: string;
  cursorUrl?: string;
  observedBranches?: string[];
  resultSummary?: string;
  resultPayload?: unknown;
  error?: string;
  errorCategory?: string;
  safeMode: boolean;
  requiresApproval: boolean;
  approvalId?: string;
  approvalBinding?: ApprovalBinding;
  cancelState?: "none" | "cancel_pending" | "cancelled" | "cancel_failed";
  outcomeReview?: "trusted" | "result_requires_integration_review" | "rejected";
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
  binding: ApprovalBinding;
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

export interface ControlCenterState {
  version: 2;
  killSwitch: boolean;
  /** When true after corrupt recovery, refuse dispatch until operator clears. */
  dispatchDenied: boolean;
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

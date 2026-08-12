import type { ProjectRecord } from "./types";
import { slugifyBranch } from "./ids";
import { SanitizedError } from "./errors";

export interface BranchCheckResult {
  ok: boolean;
  reason?: string;
  workerBranchPolicy?: string;
}

const HARD_DENIED_NAMES = new Set([
  "main",
  "master",
  "production",
  "prod",
  "release",
  "canonical",
]);

export function normalizeBranch(branch: string): string {
  return branch.trim().replace(/^refs\/heads\//, "").toLowerCase();
}

export function isProtectedBranch(
  branch: string,
  protectedBranches: string[],
): boolean {
  const normalized = normalizeBranch(branch);
  if (!normalized) return true;
  if (HARD_DENIED_NAMES.has(normalized)) return true;
  if (protectedBranches.some((p) => normalizeBranch(p) === normalized)) {
    return true;
  }
  // Lookalike / suffix rules: */main, */master, */production
  const leaf = normalized.split("/").pop() || normalized;
  if (HARD_DENIED_NAMES.has(leaf)) return true;
  if (normalized.includes("setup-dev-environment")) return true;
  if (normalized.endsWith("/main") || normalized.endsWith("/master")) return true;
  if (normalized.includes("canonical-ddp") && !normalized.startsWith("cursor/")) {
    return true;
  }
  return false;
}

export function assertWorkerBranchPolicyAllowed(
  requestedBranch: string | undefined,
  project: ProjectRecord,
): BranchCheckResult {
  const prefix = project.workerBranchPrefix || "agent/";
  const candidate =
    requestedBranch?.trim() ||
    `${prefix}ddp-cc-${slugifyBranch(String(Date.now()))}`;
  const normalized = normalizeBranch(candidate);

  if (isProtectedBranch(candidate, project.protectedBranches)) {
    return {
      ok: false,
      reason: `Refusing protected/canonical branch policy "${candidate}". Canonical owner is ${project.canonicalOwner}.`,
    };
  }

  if (!normalized.startsWith(normalizeBranch(prefix))) {
    return {
      ok: false,
      reason: `Worker branch policy must start with "${prefix}". Got "${candidate}".`,
    };
  }

  // Explicit lookalikes under agent/
  if (
    normalized === "agent/main" ||
    normalized === "agent/master" ||
    normalized === "agent/production" ||
    normalized === "agent/prod"
  ) {
    return {
      ok: false,
      reason: `Branch policy "${candidate}" is a protected lookalike.`,
    };
  }

  return { ok: true, workerBranchPolicy: candidate };
}

/**
 * Cursor API (v1) does not accept an exact worker branch name when
 * workOnCurrentBranch=false; it auto-generates cursor/... branches.
 * We verify the observed/generated branch is not protected.
 */
export function assertGeneratedBranchSafe(
  observedBranches: string[] | undefined,
  project: ProjectRecord,
): BranchCheckResult {
  if (!observedBranches || observedBranches.length === 0) {
    return {
      ok: true,
      reason: "No pushed branches observed yet — deferred verification",
    };
  }
  for (const branch of observedBranches) {
    if (isProtectedBranch(branch, project.protectedBranches)) {
      return {
        ok: false,
        reason: `Observed Cursor branch "${branch}" violates protected-branch policy`,
      };
    }
    // Auto-generated cursor/* is expected and allowed unless protected list matches.
    const n = normalizeBranch(branch);
    if (!n.startsWith("cursor/") && !n.startsWith(normalizeBranch(project.workerBranchPrefix))) {
      return {
        ok: false,
        reason: `Observed branch "${branch}" is outside allowed cursor/* or ${project.workerBranchPrefix}* namespaces`,
      };
    }
  }
  return { ok: true };
}

export function assertStartingRefReadable(startingRef: string): BranchCheckResult {
  if (!startingRef.trim()) {
    return { ok: false, reason: "startingRef is required" };
  }
  return { ok: true };
}

export function requireSafeBranchOrThrow(
  check: BranchCheckResult,
): asserts check is BranchCheckResult & { ok: true } {
  if (!check.ok) {
    throw new SanitizedError({
      message: check.reason || "Branch policy violation",
      category: "branch_policy",
      statusCode: 400,
    });
  }
}

/** Honest API-level guarantee description for docs/UI. */
export const BRANCH_ISOLATION_GUARANTEE = [
  "Cursor Cloud Agents API does not accept an exact worker branch when workOnCurrentBranch=false.",
  "Control Center always sends workOnCurrentBranch=false and autoCreatePR=false.",
  "Cursor auto-generates cursor/* branches from startingRef; Control Center verifies observed branches are not protected.",
  "Local agent/* policy names are bookkeeping/policy labels, not a Cursor API pin.",
  "Prompt text is not a security boundary.",
].join(" ");

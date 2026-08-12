import type { ProjectRecord } from "./types";
import { slugifyBranch } from "./ids";

export interface BranchCheckResult {
  ok: boolean;
  reason?: string;
  workerBranch?: string;
}

export function isProtectedBranch(
  branch: string,
  protectedBranches: string[],
): boolean {
  const normalized = branch.trim().toLowerCase();
  return protectedBranches.some((p) => p.trim().toLowerCase() === normalized);
}

export function assertWorkerBranchAllowed(
  requestedBranch: string | undefined,
  project: ProjectRecord,
): BranchCheckResult {
  const prefix = project.workerBranchPrefix || "agent/";
  const candidate =
    requestedBranch?.trim() ||
    `${prefix}ddp-cc-${slugifyBranch(String(Date.now()))}`;

  if (isProtectedBranch(candidate, project.protectedBranches)) {
    return {
      ok: false,
      reason: `Refusing to use protected canonical branch "${candidate}". Canonical owner is ${project.canonicalOwner}.`,
    };
  }

  if (!candidate.startsWith(prefix)) {
    return {
      ok: false,
      reason: `Worker branches must start with "${prefix}". Got "${candidate}".`,
    };
  }

  if (
    candidate === "main" ||
    candidate === "master" ||
    candidate.includes("setup-dev-environment")
  ) {
    return {
      ok: false,
      reason: `Branch "${candidate}" is reserved for ${project.canonicalOwner}.`,
    };
  }

  return { ok: true, workerBranch: candidate };
}

export function assertStartingRefReadable(
  startingRef: string,
  project: ProjectRecord,
): BranchCheckResult {
  // Starting FROM a protected branch is allowed (fork workers from baseline).
  // Writing TO a protected branch is not — handled by assertWorkerBranchAllowed.
  if (!startingRef.trim()) {
    return { ok: false, reason: "startingRef is required" };
  }
  void project;
  return { ok: true };
}

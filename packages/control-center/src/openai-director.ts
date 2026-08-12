import type { ControlCenterConfig } from "./config";
import type { DirectorPlan, JobRecord, ProjectRecord } from "./types";
import { planHash, slugifyBranch } from "./ids";
import { sanitizeVendorFailure, SanitizedError } from "./errors";
import { BRANCH_ISOLATION_GUARANTEE } from "./branch-protection";

export interface DirectorClient {
  plan(input: { job: JobRecord; project: ProjectRecord }): Promise<DirectorPlan>;
}

const PAID_PATTERNS =
  /\b(runpod|paid\s*gpu|allow_paid_gpu|cloud_render_enabled\s*=\s*true|production\s*r2|destructive\s*migration|secret\s*rotation|production\s*deploy)/i;

function buildWorkerPolicyBlock(paidDenied: boolean): string[] {
  const lines = [
    "CONTROL CENTER WORKER POLICY (mandatory):",
    "CLOUD_RENDER_ENABLED=false",
    "ALLOW_PAID_GPU_LAUNCH=false",
    "NO PAID EXTERNAL OPERATIONS",
    "NO PRODUCTION DEPLOYMENT",
    "NO DESTRUCTIVE ACTIONS",
    "NO PRODUCTION R2 MUTATION",
    "Do not merge into canonical branches.",
    "Do not force-push.",
    BRANCH_ISOLATION_GUARANTEE,
  ];
  if (paidDenied) {
    lines.push("PAID/DANGEROUS operations are DENIED for this job.");
  }
  return lines;
}

function classifyDangerous(goal: string, forcePaid?: boolean, forceDestructive?: boolean) {
  const matched = Boolean(
    PAID_PATTERNS.test(goal) || forcePaid || forceDestructive,
  );
  return {
    requiresApproval: matched,
    approvalKind: forcePaid
      ? ("paid_action" as const)
      : forceDestructive
        ? ("destructive" as const)
        : matched
          ? ("paid_action" as const)
          : ("cursor_dispatch" as const),
    paidOperationDenied: !forcePaid && !forceDestructive,
    maxCost: forcePaid ? 1 : 0,
    podLimit: forcePaid ? 1 : 0,
    destructiveScope: forceDestructive ? ["explicit_destructive"] : [],
  };
}

function buildMockPlan(
  job: JobRecord,
  project: ProjectRecord,
  model: string,
  flags?: { forcePaid?: boolean; forceDestructive?: boolean },
): DirectorPlan {
  const danger = classifyDangerous(job.goal, flags?.forcePaid, flags?.forceDestructive);
  const requestedWorkerBranch =
    job.workerBranchPolicy ||
    `${project.workerBranchPrefix}ddp-cc-${slugifyBranch(job.title)}`;
  const safeModeInstructions = buildWorkerPolicyBlock(danger.paidOperationDenied);
  const workerPrompt = [
    `You are an isolated DDP side worker for project ${project.name}.`,
    `Canonical production owner is ${project.canonicalOwner} — DO NOT modify their branch.`,
    `Policy worker label: ${requestedWorkerBranch} (Cursor will auto-create a cursor/* branch; do not target protected branches).`,
    `Starting ref: ${job.startingRef}`,
    `Goal: ${job.goal}`,
    ...safeModeInstructions,
    "Stop after reporting results; do not merge.",
  ].join("\n");

  const hash = planHash({
    summary: `Safe plan for: ${job.title}`,
    workerPrompt,
    requestedWorkerBranch,
    startingRef: job.startingRef,
    operationType: danger.approvalKind,
    maxCost: danger.maxCost,
    podLimit: danger.podLimit,
    destructiveScope: danger.destructiveScope,
    repoUrl: project.repoUrl,
  });

  return {
    summary: `Safe plan for: ${job.title}`,
    workerPrompt,
    requestedWorkerBranch,
    startingRef: job.startingRef,
    riskLevel: danger.requiresApproval ? "high" : "low",
    requiresApproval: danger.requiresApproval,
    approvalKind: danger.approvalKind,
    operationType: danger.approvalKind,
    maxCost: danger.maxCost,
    podLimit: danger.podLimit,
    destructiveScope: danger.destructiveScope,
    paidOperationDenied: danger.paidOperationDenied,
    safeModeInstructions,
    planHash: hash,
    model,
    mocked: true,
  };
}

export class OpenAIDirector implements DirectorClient {
  constructor(
    private readonly config: ControlCenterConfig,
    private readonly flags: { forcePaid?: boolean; forceDestructive?: boolean } = {},
  ) {}

  async plan(input: {
    job: JobRecord;
    project: ProjectRecord;
  }): Promise<DirectorPlan> {
    const { job, project } = input;
    if (this.config.safeMode || !this.config.openaiApiKey) {
      return buildMockPlan(job, project, `${this.config.openaiModel}:mock`, this.flags);
    }

    const system = [
      "You are the DDP Control Center build director.",
      `Canonical owner is ${project.canonicalOwner}.`,
      "Never authorize paid GPU, Runpod, production R2 mutation, or canonical merges.",
      "Respond with JSON keys: summary, workerPrompt, requestedWorkerBranch, startingRef, riskLevel, requiresApproval, approvalKind, operationType, maxCost, podLimit, destructiveScope, paidOperationDenied, safeModeInstructions.",
    ].join(" ");

    const user = JSON.stringify({
      title: job.title,
      goal: job.goal,
      requestedBranch: job.requestedBranch,
      startingRef: job.startingRef,
      repoUrl: project.repoUrl,
    });

    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.openaiModel,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
    } catch {
      throw new SanitizedError({
        message: "OpenAI director network/timeout failure",
        category: "director",
        statusCode: 504,
        provider: "openai",
        retryable: true,
      });
    }

    if (!res.ok) {
      const text = await res.text();
      throw sanitizeVendorFailure(
        "openai",
        res.status,
        text,
        `OpenAI director failed (${res.status})`,
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new SanitizedError({
        message: "OpenAI director returned empty content",
        category: "director",
        statusCode: 502,
        provider: "openai",
      });
    }

    let parsed: Partial<DirectorPlan>;
    try {
      parsed = JSON.parse(content) as Partial<DirectorPlan>;
    } catch {
      throw new SanitizedError({
        message: "OpenAI director returned malformed JSON",
        category: "director",
        statusCode: 502,
        provider: "openai",
      });
    }

    if (!parsed.summary || !parsed.workerPrompt || !parsed.startingRef) {
      throw new SanitizedError({
        message: "OpenAI director response missing required fields",
        category: "director",
        statusCode: 502,
        provider: "openai",
      });
    }

    const fallback = buildMockPlan(job, project, this.config.openaiModel, this.flags);
    const operationType = parsed.operationType || parsed.approvalKind || "cursor_dispatch";
    const maxCost = typeof parsed.maxCost === "number" ? parsed.maxCost : 0;
    const podLimit = typeof parsed.podLimit === "number" ? parsed.podLimit : 0;
    const destructiveScope = Array.isArray(parsed.destructiveScope)
      ? parsed.destructiveScope.map(String)
      : [];
    const paidOperationDenied =
      typeof parsed.paidOperationDenied === "boolean"
        ? parsed.paidOperationDenied
        : true;

    const safeModeInstructions = [
      ...(parsed.safeModeInstructions || fallback.safeModeInstructions),
      ...buildWorkerPolicyBlock(paidOperationDenied),
    ];

    const requestedWorkerBranch =
      parsed.requestedWorkerBranch || fallback.requestedWorkerBranch;
    const workerPrompt = `${parsed.workerPrompt}\n\n${safeModeInstructions.join("\n")}`;

    const hash = planHash({
      summary: parsed.summary,
      workerPrompt,
      requestedWorkerBranch,
      startingRef: parsed.startingRef,
      operationType,
      maxCost,
      podLimit,
      destructiveScope,
      repoUrl: project.repoUrl,
    });

    return {
      summary: parsed.summary,
      workerPrompt,
      requestedWorkerBranch,
      startingRef: parsed.startingRef,
      riskLevel: parsed.riskLevel || "low",
      requiresApproval: Boolean(
        parsed.requiresApproval || maxCost > 0 || podLimit > 0 || destructiveScope.length,
      ),
      approvalKind: parsed.approvalKind || operationType,
      operationType,
      maxCost,
      podLimit,
      destructiveScope,
      paidOperationDenied,
      safeModeInstructions,
      planHash: hash,
      model: this.config.openaiModel,
      mocked: false,
    };
  }
}

export function createDirector(
  config: ControlCenterConfig,
  flags?: { forcePaid?: boolean; forceDestructive?: boolean },
): DirectorClient {
  return new OpenAIDirector(config, flags);
}

export { buildMockPlan, PAID_PATTERNS, buildWorkerPolicyBlock };

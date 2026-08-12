import type { ControlCenterConfig } from "./config";
import type { DirectorPlan, JobRecord, ProjectRecord } from "./types";
import { slugifyBranch } from "./ids";

export interface DirectorClient {
  plan(input: {
    job: JobRecord;
    project: ProjectRecord;
  }): Promise<DirectorPlan>;
}

function buildMockPlan(
  job: JobRecord,
  project: ProjectRecord,
  model: string,
): DirectorPlan {
  const workerBranch =
    job.workerBranch ||
    `${project.workerBranchPrefix}ddp-cc-${slugifyBranch(job.title)}`;
  return {
    summary: `Safe $0 plan for: ${job.title}`,
    workerPrompt: [
      `You are an isolated DDP side worker for project ${project.name}.`,
      `Canonical production owner is ${project.canonicalOwner} — DO NOT modify their branch.`,
      `Work only on branch ${workerBranch} forked from ${job.startingRef}.`,
      `Goal: ${job.goal}`,
      `Keep CLOUD_RENDER_ENABLED=false and ALLOW_PAID_GPU_LAUNCH=false.`,
      `Do not launch Runpod or spend GPU money.`,
      `Stop after reporting results; do not merge.`,
    ].join("\n"),
    workerBranch,
    startingRef: job.startingRef,
    riskLevel: "low",
    requiresApproval: false,
    safeModeInstructions: [
      "No paid GPU",
      "No R2 production writes",
      "No canonical branch edits",
      "Isolated agent/* worker branch only",
    ],
    model,
    mocked: true,
  };
}

export class OpenAIDirector implements DirectorClient {
  constructor(private readonly config: ControlCenterConfig) {}

  async plan(input: {
    job: JobRecord;
    project: ProjectRecord;
  }): Promise<DirectorPlan> {
    const { job, project } = input;
    if (this.config.safeMode || !this.config.openaiApiKey) {
      return buildMockPlan(job, project, `${this.config.openaiModel}:mock`);
    }

    const system = [
      "You are the DDP Control Center build director.",
      `Canonical owner is ${project.canonicalOwner}. Never target protected branches: ${project.protectedBranches.join(", ")}.`,
      `Worker branches must start with ${project.workerBranchPrefix}.`,
      "Prefer the smallest safe isolated change. Never authorize paid GPU or Runpod.",
      "Respond with compact JSON only matching keys: summary, workerPrompt, workerBranch, startingRef, riskLevel, requiresApproval, approvalKind, safeModeInstructions.",
    ].join(" ");

    const user = JSON.stringify({
      title: job.title,
      goal: job.goal,
      requestedBranch: job.requestedBranch,
      startingRef: job.startingRef,
      repoUrl: project.repoUrl,
    });

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
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

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI director failed (${res.status}): ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI director returned empty content");

    const parsed = JSON.parse(content) as Partial<DirectorPlan>;
    const fallback = buildMockPlan(job, project, this.config.openaiModel);
    return {
      summary: parsed.summary || fallback.summary,
      workerPrompt: parsed.workerPrompt || fallback.workerPrompt,
      workerBranch: parsed.workerBranch || fallback.workerBranch,
      startingRef: parsed.startingRef || fallback.startingRef,
      riskLevel: parsed.riskLevel || "low",
      requiresApproval: Boolean(parsed.requiresApproval),
      approvalKind: parsed.approvalKind,
      safeModeInstructions:
        parsed.safeModeInstructions || fallback.safeModeInstructions,
      model: this.config.openaiModel,
      mocked: false,
    };
  }
}

export function createDirector(config: ControlCenterConfig): DirectorClient {
  return new OpenAIDirector(config);
}

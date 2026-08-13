import { createJobSchema, parseOrThrow } from "@doodle-dash/control-center";
import { errorResponse, json, requireAuth } from "@/lib/http";
import { getConfig, getOrchestrator } from "@/lib/server";

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  return json({ jobs: getOrchestrator().store.listJobs() });
}

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const config = getConfig();
    const contentLength = req.headers.get("content-length");
    if (contentLength && Number(contentLength) > config.maxRequestBytes) {
      return json(
        { error: `Request body exceeds ${config.maxRequestBytes} bytes`, category: "validation" },
        { status: 413 },
      );
    }
    const body = parseOrThrow(createJobSchema, await req.json().catch(() => ({})));
    const orch = getOrchestrator();
    const created = orch.createJob({
      projectId: "proj_ddp_default",
      title: body.title,
      goal: body.goal,
      requestedBranch: body.requestedBranch,
      startingRef: body.startingRef,
      idempotencyKey: body.idempotencyKey,
      forcePaid: body.forcePaid,
      forceDestructive: body.forceDestructive,
      actor: auth.actor,
    });

    let job = created.job;
    if (body.run && job.status === "queued") {
      job = await orch.runJob(job.id, auth.actor);
    }
    return json({
      job,
      approval: created.approval,
      blockedReason: created.blockedReason,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

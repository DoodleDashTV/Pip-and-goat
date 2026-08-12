import { json, requireAuth } from "@/lib/http";
import { getOrchestrator } from "@/lib/server";

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  return json({ jobs: getOrchestrator().store.listJobs() });
}

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    goal?: string;
    requestedBranch?: string;
    startingRef?: string;
    idempotencyKey?: string;
    forcePaid?: boolean;
    forceDestructive?: boolean;
    run?: boolean;
  };

  if (!body.title?.trim() || !body.goal?.trim()) {
    return json({ error: "title and goal are required" }, { status: 400 });
  }

  const orch = getOrchestrator();
  try {
    const created = orch.createJob({
      projectId: "proj_ddp_default",
      title: body.title.trim(),
      goal: body.goal.trim(),
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
    return json({ job, approval: created.approval, blockedReason: created.blockedReason });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}

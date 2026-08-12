import { json, requireAuth } from "@/lib/http";
import { getOrchestrator } from "@/lib/server";

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const body = (await req.json().catch(() => ({}))) as {
    state?: "running" | "paused";
  };
  if (body.state !== "running" && body.state !== "paused") {
    return json({ error: "state must be running|paused" }, { status: 400 });
  }
  const orch = getOrchestrator();
  orch.setAutopilot(body.state, auth.actor);
  return json({ autopilot: orch.store.getAutopilot() });
}

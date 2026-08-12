import { autopilotSchema, parseOrThrow } from "@doodle-dash/control-center";
import { errorResponse, json, requireAuth } from "@/lib/http";
import { getOrchestrator } from "@/lib/server";

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const body = parseOrThrow(autopilotSchema, await req.json().catch(() => ({})));
    const orch = getOrchestrator();
    orch.setAutopilot(body.state, auth.actor);
    return json({ autopilot: orch.store.getAutopilot() });
  } catch (err) {
    return errorResponse(err);
  }
}

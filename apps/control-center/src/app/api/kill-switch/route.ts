import { json, requireAuth } from "@/lib/http";
import { getOrchestrator } from "@/lib/server";

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const body = (await req.json().catch(() => ({}))) as { enabled?: boolean };
  if (typeof body.enabled !== "boolean") {
    return json({ error: "enabled boolean required" }, { status: 400 });
  }
  const orch = getOrchestrator();
  orch.setKillSwitch(body.enabled, auth.actor);
  return json({ killSwitch: orch.isKillSwitchEnabled() });
}

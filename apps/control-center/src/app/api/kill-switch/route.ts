import { killSwitchSchema, parseOrThrow } from "@doodle-dash/control-center";
import { errorResponse, json, requireAuth } from "@/lib/http";
import { getOrchestrator } from "@/lib/server";

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const body = parseOrThrow(killSwitchSchema, await req.json().catch(() => ({})));
    const orch = getOrchestrator();
    orch.setKillSwitch(body.enabled, auth.actor);
    return json({
      killSwitch: orch.isKillSwitchEnabled(),
      envKillSwitch: orch.config.killSwitchEnv,
      dispatchDenied: orch.store.getDispatchDenied(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

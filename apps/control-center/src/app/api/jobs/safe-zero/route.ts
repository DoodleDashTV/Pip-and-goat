import { errorResponse, json, requireAuth } from "@/lib/http";
import { getOrchestrator } from "@/lib/server";

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const orch = getOrchestrator();
    if (orch.store.getDispatchDenied() && !orch.config.killSwitchEnv) {
      orch.clearDispatchDenied(auth.actor);
    }
    const result = await orch.runSafeZeroLoop(
      "Safe $0 Control Center loop: reply SAFE_TEST_OK and stop. Do not modify canonical branches.",
    );
    return json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

import { newId, nowIso } from "@doodle-dash/control-center";
import { json, loginWithPassword } from "@/lib/http";
import { getOrchestrator } from "@/lib/server";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  const result = loginWithPassword(body.password || "");
  const orch = getOrchestrator();
  if (!result.ok) {
    orch.store.appendAudit({
      id: newId("audit"),
      at: nowIso(),
      action: "auth.denied",
      actor: "anonymous",
      detail: "Login failed",
    });
    return json({ error: result.error }, { status: 401 });
  }
  orch.store.appendAudit({
    id: newId("audit"),
    at: nowIso(),
    action: "auth.login",
    actor: "operator",
    detail: "Operator logged in",
  });
  return json({ token: result.token });
}

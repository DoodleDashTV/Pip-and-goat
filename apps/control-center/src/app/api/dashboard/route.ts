import { json, requireAuth } from "@/lib/http";
import { getOrchestrator } from "@/lib/server";

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const orch = getOrchestrator();
  return json({ dashboard: orch.getDashboard() });
}

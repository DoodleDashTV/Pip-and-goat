import { errorResponse, json, requireAuth } from "@/lib/http";
import { getOrchestrator } from "@/lib/server";

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    return json({ audit: getOrchestrator().store.listAudit(200) });
  } catch (err) {
    return errorResponse(err);
  }
}

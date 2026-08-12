import { errorResponse, json, requireAuth } from "@/lib/http";
import { getOrchestrator } from "@/lib/server";

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    getOrchestrator().clearDispatchDenied(auth.actor);
    return json({ ok: true, dispatchDenied: false });
  } catch (err) {
    return errorResponse(err);
  }
}

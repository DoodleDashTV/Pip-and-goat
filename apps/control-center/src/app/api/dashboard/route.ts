import { errorResponse, json, requireAuth } from "@/lib/http";
import { getOrchestrator } from "@/lib/server";

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    return json({ dashboard: getOrchestrator().getDashboard() });
  } catch (err) {
    return errorResponse(err);
  }
}

import { json, logout, requireAuth } from "@/lib/http";

export async function POST(req: Request) {
  const auth = requireAuth(req);
  // Allow logout even if session already invalid
  const init = logout(req);
  if (!auth.ok) {
    return json({ ok: true }, init);
  }
  return json({ ok: true }, init);
}

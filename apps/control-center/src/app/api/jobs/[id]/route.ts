import { json, requireAuth } from "@/lib/http";
import { getOrchestrator } from "@/lib/server";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const job = getOrchestrator().store.getJob(id);
  if (!job) return json({ error: "Not found" }, { status: 404 });
  return json({ job });
}

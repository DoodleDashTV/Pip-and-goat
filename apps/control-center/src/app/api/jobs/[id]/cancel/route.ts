import { json, requireAuth } from "@/lib/http";
import { getOrchestrator } from "@/lib/server";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  try {
    const job = await getOrchestrator().cancelJob(id, auth.actor);
    return json({ job });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}

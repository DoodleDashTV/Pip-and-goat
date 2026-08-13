import { idSchema, parseOrThrow } from "@doodle-dash/control-center";
import { errorResponse, json, requireAuth } from "@/lib/http";
import { getOrchestrator } from "@/lib/server";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await ctx.params;
    parseOrThrow(idSchema, id);
    const job = await getOrchestrator().cancelJob(id, auth.actor);
    return json({ job });
  } catch (err) {
    return errorResponse(err);
  }
}

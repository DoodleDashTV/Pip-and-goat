import { json, requireAuth } from "@/lib/http";
import { getOrchestrator } from "@/lib/server";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    decision?: "approved" | "rejected";
  };
  if (body.decision !== "approved" && body.decision !== "rejected") {
    return json({ error: "decision must be approved|rejected" }, { status: 400 });
  }
  try {
    const approval = getOrchestrator().resolveApproval(
      id,
      body.decision,
      auth.actor,
    );
    return json({ approval });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}

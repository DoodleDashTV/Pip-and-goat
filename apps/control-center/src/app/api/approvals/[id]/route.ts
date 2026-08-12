import {
  approvalDecisionSchema,
  idSchema,
  parseOrThrow,
} from "@doodle-dash/control-center";
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
    const body = parseOrThrow(
      approvalDecisionSchema,
      await req.json().catch(() => ({})),
    );
    const approval = getOrchestrator().resolveApproval(
      id,
      body.decision,
      auth.actor,
    );
    return json({ approval });
  } catch (err) {
    return errorResponse(err);
  }
}

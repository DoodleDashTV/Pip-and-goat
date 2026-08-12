import { json, requireAuth } from "@/lib/http";
import { getOrchestrator } from "@/lib/server";

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const result = await getOrchestrator().runSafeZeroLoop(
      "Safe $0 Control Center loop: reply SAFE_TEST_OK and stop. Do not modify canonical branches.",
    );
    return json(result);
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}

import { loginSchema, parseOrThrow } from "@doodle-dash/control-center";
import { errorResponse, json, loginWithPassword } from "@/lib/http";
import { getConfig } from "@/lib/server";

export async function POST(req: Request) {
  try {
    const config = getConfig();
    const contentLength = req.headers.get("content-length");
    if (contentLength && Number(contentLength) > config.maxRequestBytes) {
      return json(
        { error: `Request body exceeds ${config.maxRequestBytes} bytes`, category: "validation" },
        { status: 413 },
      );
    }
    const body = parseOrThrow(loginSchema, await req.json().catch(() => ({})));
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "local";
    const result = loginWithPassword(body.password, ip);
    if (!result.ok) {
      return json(
        { error: result.error, category: result.status === 429 ? "rate_limit" : "auth" },
        { status: result.status },
      );
    }
    return json({ token: result.token, mode: "session_cookie" }, result.responseInit);
  } catch (err) {
    return errorResponse(err);
  }
}

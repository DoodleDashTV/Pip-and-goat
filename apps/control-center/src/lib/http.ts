import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SanitizedError,
  assertBodySize,
  authenticateBearer,
  authenticatePassword,
  issueSessionToken,
  revokeSessionToken,
  verifySessionToken,
  newId,
  nowIso,
} from "@doodle-dash/control-center";
import { getConfig, getLoginLimiter, getOrchestrator } from "./server";

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function errorResponse(err: unknown) {
  if (err instanceof SanitizedError) {
    return json(err.toJSON(), { status: err.statusCode });
  }
  return json(
    {
      error: "Internal error",
      category: "internal",
      correlationId: `cc_${Date.now().toString(16)}`,
    },
    { status: 500 },
  );
}

function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie") || "";
  const parts = raw.split(";").map((p) => p.trim());
  for (const part of parts) {
    if (part.startsWith(`${name}=`)) {
      return decodeURIComponent(part.slice(name.length + 1));
    }
  }
  return undefined;
}

export function requireAuth(req: Request):
  | { ok: true; actor: string }
  | { ok: false; response: NextResponse } {
  const config = getConfig();
  assertBodySize(req.headers.get("content-length"), config.maxRequestBytes);

  const bearer = authenticateBearer(
    req.headers.get("authorization"),
    config.authToken,
    config.sessionSecret,
  );
  if (bearer.ok) return { ok: true, actor: bearer.actor };

  const cookieToken = readCookie(req, SESSION_COOKIE);
  const session = verifySessionToken(config.sessionSecret, cookieToken);
  if (session) return { ok: true, actor: session.sub };

  return {
    ok: false,
    response: json({ error: "Unauthorized", category: "auth" }, { status: 401 }),
  };
}

export function loginWithPassword(
  password: string,
  ip: string,
):
  | { ok: true; token: string; responseInit: ResponseInit }
  | { ok: false; error: string; status: number } {
  const config = getConfig();
  const limiter = getLoginLimiter();
  const limit = limiter.attempt(ip || "unknown");
  const orch = getOrchestrator();

  if (!limit.allowed) {
    orch.store.appendAudit({
      id: newId("audit"),
      at: nowIso(),
      action: "auth.rate_limited",
      actor: "anonymous",
      detail: `Login rate limited for ${ip}`,
    });
    return { ok: false, error: "Too many login attempts", status: 429 };
  }

  if (!authenticatePassword(password, config.authToken)) {
    orch.store.appendAudit({
      id: newId("audit"),
      at: nowIso(),
      action: "auth.denied",
      actor: "anonymous",
      detail: "Login failed",
    });
    return { ok: false, error: "Invalid password", status: 401 };
  }

  const token = issueSessionToken(
    config.sessionSecret,
    "operator",
    config.sessionTtlSeconds,
  );
  orch.store.appendAudit({
    id: newId("audit"),
    at: nowIso(),
    action: "auth.login",
    actor: "operator",
    detail: "Operator logged in",
  });

  const secure = process.env.NODE_ENV === "production";
  const cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${config.sessionTtlSeconds}${secure ? "; Secure" : ""}`;
  return {
    ok: true,
    token,
    responseInit: { headers: { "Set-Cookie": cookie } },
  };
}

export function logout(req: Request): ResponseInit {
  const config = getConfig();
  const cookieToken = readCookie(req, SESSION_COOKIE);
  if (cookieToken) revokeSessionToken(cookieToken, config.sessionSecret);
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    revokeSessionToken(auth.slice(7).trim(), config.sessionSecret);
  }
  const cleared = `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  return { headers: { "Set-Cookie": cleared } };
}

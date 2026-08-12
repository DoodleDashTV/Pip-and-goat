import { NextResponse } from "next/server";
import {
  authenticateBearer,
  issueSessionToken,
} from "@doodle-dash/control-center";
import { getConfig } from "./server";

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function requireAuth(req: Request):
  | { ok: true; actor: string }
  | { ok: false; response: NextResponse } {
  const config = getConfig();
  const result = authenticateBearer(
    req.headers.get("authorization"),
    config.authToken,
    config.sessionSecret,
  );
  if (!result.ok) {
    return {
      ok: false,
      response: json({ error: result.reason }, { status: 401 }),
    };
  }
  return result;
}

export function loginWithPassword(password: string):
  | { ok: true; token: string }
  | { ok: false; error: string } {
  const config = getConfig();
  if (password !== config.authToken) {
    return { ok: false, error: "Invalid password" };
  }
  return {
    ok: true,
    token: issueSessionToken(config.sessionSecret, "operator"),
  };
}

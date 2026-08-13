import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

export interface SessionPayload {
  sub: string;
  iat: number;
  exp: number;
  jti: string;
}

const revoked = new Set<string>();

function b64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString("base64url");
}

function fromB64url(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // Compare against self to keep work roughly constant on length mismatch.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export function issueSessionToken(
  secret: string,
  subject = "operator",
  ttlSeconds = 60 * 60 * 12,
): string {
  const payload: SessionPayload = {
    sub: subject,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    jti: randomBytes(12).toString("hex"),
  };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySessionToken(
  secret: string,
  token: string | undefined | null,
): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest();
  let actual: Buffer;
  try {
    actual = fromB64url(sig);
  } catch {
    return null;
  }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as SessionPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.jti || revoked.has(payload.jti)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function revokeSessionToken(token: string, secret: string): boolean {
  const payload = verifySessionToken(secret, token);
  if (!payload) return false;
  revoked.add(payload.jti);
  return true;
}

export function authenticateBearer(
  authHeader: string | null | undefined,
  authToken: string,
  sessionSecret: string,
): { ok: true; actor: string; via: "api_token" | "session" } | { ok: false; reason: string } {
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, reason: "Missing Bearer token" };
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (constantTimeEqual(token, authToken)) {
    return { ok: true, actor: "operator", via: "api_token" };
  }
  const session = verifySessionToken(sessionSecret, token);
  if (session) {
    return { ok: true, actor: session.sub, via: "session" };
  }
  return { ok: false, reason: "Invalid credentials" };
}

export function authenticatePassword(
  password: string,
  authToken: string,
): boolean {
  return constantTimeEqual(password, authToken);
}

export const SESSION_COOKIE = "ddp_cc_session";

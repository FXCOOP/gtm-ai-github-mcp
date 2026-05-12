import { createHmac, timingSafeEqual } from "node:crypto";

const CODE_TTL_SECONDS = 120;
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year — single-user, auto-approve

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromB64url(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  return Buffer.from(padded, "base64");
}

function hmac(secret: string, payload: string): string {
  return b64url(createHmac("sha256", secret).update(payload).digest());
}

function safeEqualStr(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export interface AuthorizationCodePayload {
  redirectUri: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  issuedAt: number;
}

export function issueAuthorizationCode(secret: string, payload: AuthorizationCodePayload): string {
  const json = JSON.stringify(payload);
  const body = b64url(json);
  const sig = hmac(secret, body);
  return `${body}.${sig}`;
}

export function verifyAuthorizationCode(
  secret: string,
  code: string,
): AuthorizationCodePayload | null {
  const parts = code.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = hmac(secret, body);
  if (!safeEqualStr(sig, expected)) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as AuthorizationCodePayload;
    if (typeof payload.issuedAt !== "number") return null;
    const ageSeconds = Math.floor(Date.now() / 1000) - payload.issuedAt;
    if (ageSeconds < 0 || ageSeconds > CODE_TTL_SECONDS) return null;
    return payload;
  } catch {
    return null;
  }
}

export interface AccessTokenPayload {
  sub: string;
  issuedAt: number;
}

export function issueAccessToken(secret: string, payload: AccessTokenPayload): string {
  const json = JSON.stringify(payload);
  const body = b64url(json);
  const sig = hmac(secret, body);
  return `${body}.${sig}`;
}

export function verifyAccessToken(secret: string, token: string): AccessTokenPayload | null {
  // Allow the raw shared secret to act as a service token (for curl tests).
  if (safeEqualStr(token, secret)) {
    return { sub: "shared-secret", issuedAt: Math.floor(Date.now() / 1000) };
  }
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = hmac(secret, body);
  if (!safeEqualStr(sig, expected)) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as AccessTokenPayload;
    if (typeof payload.issuedAt !== "number") return null;
    const ageSeconds = Math.floor(Date.now() / 1000) - payload.issuedAt;
    if (ageSeconds < 0 || ageSeconds > TOKEN_TTL_SECONDS) return null;
    return payload;
  } catch {
    return null;
  }
}

export function publicOrigin(req: Request): string {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  const url = new URL(req.url);
  return url.origin;
}

import { createHash } from "node:crypto";
import { issueAccessToken, verifyAuthorizationCode } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function error(status: number, code: string, description: string) {
  return json(status, { error: code, error_description: description });
}

function b64urlSha256(input: string): string {
  return createHash("sha256")
    .update(input)
    .digest()
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export async function POST(req: Request) {
  const secret = process.env.MCP_SHARED_SECRET;
  if (!secret) return error(500, "server_error", "MCP_SHARED_SECRET is not configured.");

  const contentType = req.headers.get("content-type") ?? "";
  let params: URLSearchParams;
  try {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      params = new URLSearchParams(await req.text());
    } else if (contentType.includes("application/json")) {
      const body = (await req.json()) as Record<string, string>;
      params = new URLSearchParams(body);
    } else {
      params = new URLSearchParams(await req.text());
    }
  } catch {
    return error(400, "invalid_request", "Could not parse request body.");
  }

  const grantType = params.get("grant_type");
  if (grantType !== "authorization_code") {
    return error(400, "unsupported_grant_type", "Only authorization_code is supported.");
  }

  const code = params.get("code");
  const redirectUri = params.get("redirect_uri");
  const codeVerifier = params.get("code_verifier");

  if (!code) return error(400, "invalid_request", "code is required.");
  if (!redirectUri) return error(400, "invalid_request", "redirect_uri is required.");

  const payload = verifyAuthorizationCode(secret, code);
  if (!payload) return error(400, "invalid_grant", "Authorization code is invalid or expired.");

  if (payload.redirectUri !== redirectUri) {
    return error(400, "invalid_grant", "redirect_uri does not match the original authorization request.");
  }

  if (payload.codeChallenge) {
    if (!codeVerifier) return error(400, "invalid_grant", "code_verifier is required for PKCE.");
    const method = payload.codeChallengeMethod ?? "plain";
    let computed: string;
    if (method === "S256") {
      computed = b64urlSha256(codeVerifier);
    } else if (method === "plain") {
      computed = codeVerifier;
    } else {
      return error(400, "invalid_grant", `Unsupported code_challenge_method: ${method}`);
    }
    if (computed !== payload.codeChallenge) {
      return error(400, "invalid_grant", "PKCE verification failed.");
    }
  }

  const accessToken = issueAccessToken(secret, {
    sub: "gtm-ai-github-mcp",
    issuedAt: Math.floor(Date.now() / 1000),
  });

  return json(200, {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 60 * 60 * 24 * 365,
    scope: "mcp",
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

import { issueAuthorizationCode } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(message: string) {
  return new Response(JSON.stringify({ error: "invalid_request", error_description: message }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

export function GET(req: Request) {
  const secret = process.env.MCP_SHARED_SECRET;
  if (!secret) {
    return new Response(
      JSON.stringify({ error: "server_error", error_description: "MCP_SHARED_SECRET is not configured." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const url = new URL(req.url);
  const params = url.searchParams;
  const responseType = params.get("response_type");
  const redirectUri = params.get("redirect_uri");
  const state = params.get("state");
  const codeChallenge = params.get("code_challenge") ?? undefined;
  const codeChallengeMethod = params.get("code_challenge_method") ?? undefined;

  if (responseType !== "code") return badRequest("response_type must be code");
  if (!redirectUri) return badRequest("redirect_uri is required");

  let parsedRedirect: URL;
  try {
    parsedRedirect = new URL(redirectUri);
  } catch {
    return badRequest("redirect_uri is not a valid URL");
  }

  const code = issueAuthorizationCode(secret, {
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    issuedAt: Math.floor(Date.now() / 1000),
  });

  parsedRedirect.searchParams.set("code", code);
  if (state) parsedRedirect.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: { Location: parsedRedirect.toString() },
  });
}

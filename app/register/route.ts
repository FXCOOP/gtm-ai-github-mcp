export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

interface RegistrationRequest {
  redirect_uris?: string[];
  client_name?: string;
  token_endpoint_auth_method?: string;
  grant_types?: string[];
  response_types?: string[];
  scope?: string;
}

export async function POST(req: Request) {
  let body: RegistrationRequest = {};
  try {
    body = (await req.json()) as RegistrationRequest;
  } catch {
    // Tolerate empty/invalid body — auto-approve still works.
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const response = {
    client_id: "gtm-ai-github-mcp-client",
    client_id_issued_at: nowSeconds,
    redirect_uris: body.redirect_uris ?? [],
    grant_types: body.grant_types ?? ["authorization_code"],
    response_types: body.response_types ?? ["code"],
    token_endpoint_auth_method: body.token_endpoint_auth_method ?? "none",
    client_name: body.client_name ?? "GTM AI GitHub MCP Client",
    scope: body.scope ?? "mcp",
  };

  return new Response(JSON.stringify(response), {
    status: 201,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

import { publicOrigin } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

export function GET(req: Request) {
  const origin = publicOrigin(req);
  const body = {
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    resource_documentation: `${origin}/`,
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

# gtm-ai-github-mcp

A narrow, single-tool **remote MCP server** that lets Claude Cowork update the four report files in the GitHub-backed [GTM AI Intelligence Hub](https://github.com/FXCOOP/gtm-ai-intelligence-hub) — and nothing else.

## What it does

Exposes one tool over MCP (`POST /api/mcp`):

| Tool | Effect |
|---|---|
| `update_gtm_ai_report_files` | Commits four files via the GitHub REST API: `public/data/latest.json`, `public/data/daily-index.json`, `reports/daily/{date}.md`, `reports/trend-log.md` |

Also exposes a health check at `GET /api/health` returning `{ "ok": true, "service": "gtm-ai-github-mcp" }`.

## Why it is intentionally narrow

This is **not** a general-purpose GitHub MCP. It is a daily-task automation surface for one specific repository and four specific paths:

- Path allowlist is hard-coded in [`lib/validators.ts`](lib/validators.ts). Any other path is rejected before any HTTP call to GitHub is made.
- Repo, owner, and branch are environment-scoped to one repository — the token cannot be repurposed to write elsewhere if it's a fine-grained PAT.
- One tool, one verb. No reads, no list, no delete, no PR creation.
- Shared-secret auth in front of MCP means even if the public Vercel URL leaks, the tool cannot be invoked without `MCP_SHARED_SECRET`.

This drastically reduces blast radius compared to giving Claude Cowork a generic GitHub MCP token.

## Required GitHub token permissions

Create a **fine-grained personal access token** scoped to **only the repository** `FXCOOP/gtm-ai-intelligence-hub`:

| Permission | Access |
|---|---|
| Contents | Read and write |
| Metadata | Read (mandatory) |

No other permissions. No org-wide access. No classic PATs.

## Required Vercel environment variables

Set these in **Project → Settings → Environments → Production** (also Preview if you use it):

| Variable | Value |
|---|---|
| `GITHUB_TOKEN` | The fine-grained PAT above |
| `GITHUB_OWNER` | `FXCOOP` |
| `GITHUB_REPO` | `gtm-ai-intelligence-hub` |
| `GITHUB_BRANCH` | `main` |
| `MCP_SHARED_SECRET` | A long random string (use `openssl rand -hex 32`) |

After adding, redeploy so the new variables are baked into the runtime.

## Local development

```bash
cp .env.example .env.local
# fill in real values

npm install
npm run dev
```

Verify the health endpoint:

```bash
curl http://localhost:3000/api/health
# {"ok":true,"service":"gtm-ai-github-mcp"}
```

Verify the auth gate (should be `401`):

```bash
curl -i -X POST http://localhost:3000/api/mcp
```

## Vercel deployment

1. Push this repo to GitHub (commands at the bottom).
2. In Vercel: **Add New → Project → Import** this repo.
3. **Framework Preset: Next.js**. Root directory: `./`. Leave Build/Output/Install at the framework defaults.
4. Add the environment variables above.
5. Deploy. Your URL will be something like `https://gtm-ai-github-mcp.vercel.app`.

The MCP endpoint is at:

```
https://YOUR-VERCEL-PROJECT.vercel.app/api/mcp
```

## Claude Custom Connector setup

In Claude (web → Settings → Connectors → Add custom connector):

| Field | Value |
|---|---|
| Name | GTM AI GitHub MCP |
| Remote MCP server URL | `https://YOUR-VERCEL-PROJECT.vercel.app/api/mcp` |
| OAuth Client ID (optional) | *leave empty* |
| OAuth Client Secret (optional) | *leave empty* |

Click **Add**. The server auto-approves the OAuth flow and issues Claude a long-lived access token. No login screen is shown.

### How auth actually works

The MCP route is gated by `withMcpAuth` from `mcp-handler`. A request to `/api/mcp` without a valid bearer token receives an HTTP 401 with a `WWW-Authenticate` header pointing at `/.well-known/oauth-protected-resource/api/mcp`. Claude follows that to `/.well-known/oauth-authorization-server`, then runs the OAuth 2.1 + PKCE dance against `/register`, `/authorize`, and `/token`. The token endpoint returns a signed access token derived from `MCP_SHARED_SECRET`.

For direct curl testing, the raw `MCP_SHARED_SECRET` value is also accepted as a bearer token — convenient for smoke tests, no OAuth round-trip needed.

After connecting, Claude Cowork can call `update_gtm_ai_report_files`.

## Example tool payload

```json
{
  "date": "2026-05-12",
  "latestJson": {
    "date": "2026-05-12",
    "priority": "High",
    "executiveSignal": ["..."],
    "topUpdates": [],
    "todayActions": { "learn": "...", "test": "...", "publishOrMention": "..." },
    "architectureTakeaway": "...",
    "linkedinAngle": { "hook": "...", "corePoint": "...", "whyItPositionsMeWell": "..." }
  },
  "dailyIndexJson": [
    {
      "date": "2026-05-12",
      "priority": "High",
      "markdownPath": "/reports/daily/2026-05-12.md",
      "topVendors": ["Claude", "OpenAI"],
      "topCategories": ["AI agents"],
      "architectureTakeaway": "..."
    },
    {
      "date": "2026-05-11",
      "priority": "High",
      "markdownPath": "/reports/daily/2026-05-11.md",
      "topVendors": ["Claude"],
      "topCategories": ["GTM architecture"],
      "architectureTakeaway": "..."
    }
  ],
  "dailyMarkdown": "# GTM AI Intelligence — 2026-05-12\n\n...",
  "trendLogMarkdown": "# GTM AI Architecture — Trend Log\n\n...",
  "commitMessage": "daily-report: 2026-05-12"
}
```

### Validation rules

- `date` matches `YYYY-MM-DD`.
- `latestJson.date` must equal `date`.
- `dailyIndexJson` must include an entry whose `date` equals `date`.
- `dailyMarkdown` non-empty and ≤ 50,000 chars.
- `trendLogMarkdown` non-empty and ≤ 200,000 chars.

### Returns (success)

```json
{
  "ok": true,
  "date": "2026-05-12",
  "updatedFiles": [
    "public/data/latest.json",
    "public/data/daily-index.json",
    "reports/daily/2026-05-12.md",
    "reports/trend-log.md"
  ],
  "commitUrls": [
    "https://github.com/FXCOOP/gtm-ai-intelligence-hub/commit/<sha>",
    "..."
  ]
}
```

### Returns (failure)

If one file write fails, the remaining writes are aborted and the response identifies the failing file:

```json
{
  "ok": false,
  "date": "2026-05-12",
  "failedFile": "public/data/daily-index.json",
  "error": "Failed to write public/data/daily-index.json (status 409): ...",
  "partialResults": [ ... ]
}
```

## Git: push to GitHub

```bash
git init
git add .
git commit -m "Initial commit: gtm-ai-github-mcp"
git branch -M main
git remote add origin https://github.com/FXCOOP/gtm-ai-github-mcp.git
git push -u origin main
```

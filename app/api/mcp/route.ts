import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z, ZodError } from "zod";
import {
  GithubWriteError,
  type FileUpdate,
  type GithubConfig,
  writeAllowedFiles,
} from "@/lib/github";
import { verifyAccessToken } from "@/lib/oauth";
import { allowedPathsForDate, updateInputSchema } from "@/lib/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function readGithubConfig(): GithubConfig | string {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER ?? "FXCOOP";
  const repo = process.env.GITHUB_REPO ?? "gtm-ai-intelligence-hub";
  const branch = process.env.GITHUB_BRANCH ?? "main";
  if (!token) return "GITHUB_TOKEN is not configured on the server.";
  return { token, owner, repo, branch };
}

const updateInputShape = {
  date: z.string().describe("Report date in YYYY-MM-DD format."),
  latestJson: z
    .record(z.unknown())
    .describe("Full latest daily report object. Will be written to public/data/latest.json."),
  dailyIndexJson: z
    .array(z.record(z.unknown()))
    .describe("Full daily index array. Will be written to public/data/daily-index.json."),
  dailyMarkdown: z
    .string()
    .describe("Markdown body of the daily report. Will be written to reports/daily/{date}.md."),
  trendLogMarkdown: z
    .string()
    .describe("Full Markdown content of the trend log. Will be written to reports/trend-log.md."),
  commitMessage: z.string().optional().describe("Optional override for the commit message."),
} as const;

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "update_gtm_ai_report_files",
      "Update the four GTM AI Intelligence Hub report files in GitHub: public/data/latest.json, public/data/daily-index.json, reports/daily/{date}.md, reports/trend-log.md. No other paths are permitted.",
      updateInputShape,
      async (rawArgs) => {
        let input;
        try {
          input = updateInputSchema.parse(rawArgs);
        } catch (err) {
          const message =
            err instanceof ZodError
              ? err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")
              : err instanceof Error
                ? err.message
                : "Invalid input";
          return {
            isError: true,
            content: [{ type: "text", text: `Validation failed: ${message}` }],
          };
        }

        const config = readGithubConfig();
        if (typeof config === "string") {
          return { isError: true, content: [{ type: "text", text: config }] };
        }

        const commitMessage =
          input.commitMessage?.trim() ||
          `daily-report: update GTM AI intelligence for ${input.date}`;

        const updates: FileUpdate[] = [
          {
            path: "public/data/latest.json",
            content: JSON.stringify(input.latestJson, null, 2) + "\n",
          },
          {
            path: "public/data/daily-index.json",
            content: JSON.stringify(input.dailyIndexJson, null, 2) + "\n",
          },
          {
            path: `reports/daily/${input.date}.md`,
            content: input.dailyMarkdown.endsWith("\n") ? input.dailyMarkdown : input.dailyMarkdown + "\n",
          },
          {
            path: "reports/trend-log.md",
            content: input.trendLogMarkdown.endsWith("\n")
              ? input.trendLogMarkdown
              : input.trendLogMarkdown + "\n",
          },
        ];

        try {
          const results = await writeAllowedFiles(config, input.date, updates, commitMessage);
          const failed = results.find((r) => !r.ok);
          if (failed) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      ok: false,
                      date: input.date,
                      failedFile: failed.path,
                      error: failed.error ?? "Unknown error",
                      partialResults: results,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          const response = {
            ok: true,
            date: input.date,
            updatedFiles: allowedPathsForDate(input.date).map((p) => p),
            commitUrls: results.map((r) => r.commitUrl).filter((u): u is string => Boolean(u)),
          };
          return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
        } catch (err) {
          const message =
            err instanceof GithubWriteError
              ? `${err.message} (path: ${err.path})`
              : err instanceof Error
                ? err.message
                : "Unknown GitHub error";
          return { isError: true, content: [{ type: "text", text: `GitHub write failed: ${message}` }] };
        }
      },
    );
  },
  {
    serverInfo: { name: "gtm-ai-github-mcp", version: "0.2.0" },
  },
  {
    basePath: "/api",
    verboseLogs: false,
  },
);

const authedHandler = withMcpAuth(
  handler,
  (_req, bearerToken) => {
    const secret = process.env.MCP_SHARED_SECRET;
    if (!secret || !bearerToken) return undefined;
    const payload = verifyAccessToken(secret, bearerToken);
    if (!payload) return undefined;
    return {
      token: bearerToken,
      clientId: payload.sub,
      scopes: ["mcp"],
    };
  },
  { required: true },
);

export { authedHandler as GET, authedHandler as POST, authedHandler as DELETE };

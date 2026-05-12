import { isAllowedPath } from "./validators";

const GITHUB_API = "https://api.github.com";

export interface GithubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

export interface FileUpdate {
  path: string;
  content: string;
}

export interface FileUpdateResult {
  path: string;
  ok: boolean;
  commitSha?: string;
  commitUrl?: string;
  error?: string;
}

export class GithubWriteError extends Error {
  constructor(message: string, public readonly path: string, public readonly status?: number) {
    super(message);
    this.name = "GithubWriteError";
  }
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "gtm-ai-github-mcp",
  };
}

function toBase64(content: string): string {
  return Buffer.from(content, "utf8").toString("base64");
}

async function getFileSha(config: GithubConfig, path: string): Promise<string | undefined> {
  const url = `${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${encodeURIComponent(config.branch)}`;
  const res = await fetch(url, { headers: authHeaders(config.token), cache: "no-store" });
  if (res.status === 404) return undefined;
  if (!res.ok) {
    throw new GithubWriteError(`Failed to read ${path} (status ${res.status})`, path, res.status);
  }
  const body = (await res.json()) as { sha?: string };
  return body.sha;
}

async function putFile(
  config: GithubConfig,
  path: string,
  content: string,
  commitMessage: string,
): Promise<{ commitSha: string; commitUrl: string }> {
  const sha = await getFileSha(config, path);
  const url = `${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`;
  const payload: Record<string, unknown> = {
    message: commitMessage,
    content: toBase64(content),
    branch: config.branch,
  };
  if (sha) payload.sha = sha;

  const res = await fetch(url, {
    method: "PUT",
    headers: { ...authHeaders(config.token), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { message?: string };
      if (body?.message) detail = `: ${body.message}`;
    } catch {
      // ignore
    }
    throw new GithubWriteError(
      `Failed to write ${path} (status ${res.status})${detail}`,
      path,
      res.status,
    );
  }

  const body = (await res.json()) as { commit?: { sha?: string; html_url?: string } };
  return {
    commitSha: body.commit?.sha ?? "",
    commitUrl: body.commit?.html_url ?? "",
  };
}

export async function writeAllowedFiles(
  config: GithubConfig,
  date: string,
  updates: FileUpdate[],
  commitMessage: string,
): Promise<FileUpdateResult[]> {
  for (const update of updates) {
    if (!isAllowedPath(update.path, date)) {
      throw new GithubWriteError(`Path not allowed: ${update.path}`, update.path);
    }
  }

  const results: FileUpdateResult[] = [];
  for (const update of updates) {
    try {
      const { commitSha, commitUrl } = await putFile(config, update.path, update.content, commitMessage);
      results.push({ path: update.path, ok: true, commitSha, commitUrl });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      results.push({ path: update.path, ok: false, error: message });
      break;
    }
  }
  return results;
}

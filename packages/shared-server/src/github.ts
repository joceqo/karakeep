import { and, eq } from "drizzle-orm";

import type { DB } from "@karakeep/db";
import { db } from "@karakeep/db";
import { accounts } from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";

const LOGTO_PROVIDER = "custom";
const TOKEN_REFRESH_LEEWAY_SEC = 60;

interface LogtoTokenRefreshResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

interface LogtoAccountApiAccessTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  expires_at?: number;
}

export interface GithubTokenInfo {
  token: string;
  scope?: string;
}

function getWellKnownBase(): string {
  const wellKnown = serverConfig.auth.oauth.wellKnownUrl;
  if (!wellKnown) {
    throw new Error("OAUTH_WELLKNOWN_URL is not configured");
  }
  const u = new URL(wellKnown);
  return `${u.protocol}//${u.host}`;
}

async function fetchOidcConfig(): Promise<{
  token_endpoint: string;
  issuer: string;
}> {
  const wellKnown = serverConfig.auth.oauth.wellKnownUrl;
  if (!wellKnown) {
    throw new Error("OAUTH_WELLKNOWN_URL is not configured");
  }
  const res = await fetch(wellKnown);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch OIDC discovery document: ${res.status} ${res.statusText}`,
    );
  }
  return (await res.json()) as { token_endpoint: string; issuer: string };
}

async function refreshLogtoAccessToken(
  database: DB,
  userId: string,
  refreshToken: string,
): Promise<string> {
  const { clientId, clientSecret } = serverConfig.auth.oauth;
  if (!clientId || !clientSecret) {
    throw new Error("OAUTH client credentials are not configured");
  }
  const { token_endpoint } = await fetchOidcConfig();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch(token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to refresh Logto access token: ${res.status} ${text}`,
    );
  }
  const data = (await res.json()) as LogtoTokenRefreshResponse;
  const newExpiresAt = Math.floor(Date.now() / 1000) + data.expires_in;
  await database
    .update(accounts)
    .set({
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? refreshToken,
      expires_at: newExpiresAt,
      scope: data.scope,
    })
    .where(
      and(eq(accounts.userId, userId), eq(accounts.provider, LOGTO_PROVIDER)),
    );
  return data.access_token;
}

export async function getValidLogtoAccessToken(
  database: DB,
  userId: string,
): Promise<string | null> {
  const [account] = await database
    .select()
    .from(accounts)
    .where(
      and(eq(accounts.userId, userId), eq(accounts.provider, LOGTO_PROVIDER)),
    )
    .limit(1);
  if (!account?.access_token) {
    return null;
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const expiresAt = account.expires_at ?? 0;
  if (expiresAt > nowSec + TOKEN_REFRESH_LEEWAY_SEC) {
    return account.access_token;
  }
  if (!account.refresh_token) {
    logger.warn(
      `[github] Logto access token for user ${userId} is expired but no refresh token is available`,
    );
    return account.access_token;
  }
  try {
    return await refreshLogtoAccessToken(
      database,
      userId,
      account.refresh_token,
    );
  } catch (err) {
    logger.error(
      `[github] Failed to refresh Logto token for user ${userId}: ${err}`,
    );
    return account.access_token;
  }
}

export async function getGithubToken(
  userId: string,
  database: DB = db,
): Promise<GithubTokenInfo | null> {
  const logtoToken = await getValidLogtoAccessToken(database, userId);
  if (!logtoToken) {
    return null;
  }
  const base = getWellKnownBase();
  const url = `${base}/api/my-account/identities/github/access-token`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${logtoToken}`,
      Accept: "application/json",
    },
  });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to fetch GitHub access token from Logto: ${res.status} ${text}`,
    );
  }
  const data = (await res.json()) as LogtoAccountApiAccessTokenResponse;
  if (!data.access_token) {
    return null;
  }
  return {
    token: data.access_token,
    scope: data.scope,
  };
}

export interface GithubUser {
  id: number;
  login: string;
  avatar_url: string;
  name: string | null;
  email: string | null;
}

export async function fetchGithubUser(
  token: string,
): Promise<GithubUser | null> {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${token}`,
        "User-Agent": "karakeep",
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as GithubUser;
  } catch {
    return null;
  }
}

export class GithubApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "GithubApiError";
  }
}

async function githubFetch(
  token: string,
  path: string,
  init?: RequestInit & { query?: Record<string, string | number | undefined> },
): Promise<Response> {
  const url = new URL(
    path.startsWith("http") ? path : `https://api.github.com${path}`,
  );
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${token}`,
      "User-Agent": "karakeep",
      ...(init?.headers ?? {}),
    },
  });
  return res;
}

export async function githubGet<T>(
  token: string,
  path: string,
  query?: Record<string, string | number | undefined>,
): Promise<T> {
  const res = await githubFetch(token, path, { method: "GET", query });
  if (!res.ok) {
    const text = await res.text();
    throw new GithubApiError(
      `GitHub API ${path} failed: ${res.status} ${text}`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

export interface GithubStarredRepo {
  starred_at: string;
  repo: GithubRepo;
}

export interface GithubRepo {
  id: number;
  full_name: string;
  name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  topics?: string[];
  owner: { login: string; avatar_url: string };
  updated_at: string;
  pushed_at: string;
  homepage: string | null;
  archived: boolean;
  fork: boolean;
}

/**
 * Fetches the raw README markdown for a repo.
 */
export async function fetchRepoReadme(
  token: string,
  owner: string,
  repo: string,
): Promise<string | null> {
  try {
    const res = await githubFetch(token, `/repos/${owner}/${repo}/readme`, {
      method: "GET",
      headers: { Accept: "application/vnd.github.raw" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Extracts the first image URL from README markdown, resolving relative paths.
 */
export function extractFirstReadmeImage(
  markdown: string,
  owner: string,
  repo: string,
): string | null {
  const mdMatch = markdown.match(/!\[[^\]]*\]\(([^)\s]+)/);
  const htmlMatch = markdown.match(/<img[^>]+src=["']([^"']+)["']/i);
  const candidate = mdMatch?.[1] ?? htmlMatch?.[1];
  if (!candidate) return null;
  if (/^https?:\/\//i.test(candidate)) {
    return candidate.replace(
      /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:raw|blob)\/([^\s)]+)/i,
      "https://raw.githubusercontent.com/$1/$2/$3",
    );
  }
  const clean = candidate.replace(/^\.?\/?/, "");
  return `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${clean}`;
}

/**
 * Renders markdown to HTML via GitHub's /markdown API, so relative links and
 * images resolve correctly against the repo.
 */
export async function renderMarkdownToHtml(
  token: string,
  markdown: string,
  contextRepo: string,
): Promise<string | null> {
  try {
    const res = await githubFetch(token, `/markdown`, {
      method: "POST",
      body: JSON.stringify({
        text: markdown,
        mode: "gfm",
        context: contextRepo,
      }),
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function fetchStarredPage(
  token: string,
  page: number,
  perPage = 100,
): Promise<GithubStarredRepo[]> {
  const res = await githubFetch(token, "/user/starred", {
    method: "GET",
    query: { per_page: perPage, page },
    headers: {
      Accept: "application/vnd.github.star+json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new GithubApiError(
      `GitHub /user/starred failed: ${res.status} ${text}`,
      res.status,
    );
  }
  return (await res.json()) as GithubStarredRepo[];
}

export interface GithubGistFile {
  filename: string;
  type: string;
  language: string | null;
  raw_url: string;
  size: number;
  truncated?: boolean;
  content?: string;
}

export interface GithubGist {
  id: string;
  html_url: string;
  description: string | null;
  public: boolean;
  created_at: string;
  updated_at: string;
  owner: { login: string; avatar_url: string } | null;
  files: Record<string, GithubGistFile>;
}

export async function fetchGist(
  token: string,
  gistId: string,
): Promise<GithubGist> {
  return githubGet<GithubGist>(token, `/gists/${gistId}`);
}

export interface GithubRepoEvent {
  id: string;
  type: string;
  created_at: string;
  actor: { login: string; avatar_url: string };
  repo: { name: string };
  payload: Record<string, unknown>;
}

export async function fetchRepoEvents(
  token: string,
  owner: string,
  repo: string,
  perPage = 30,
): Promise<GithubRepoEvent[]> {
  return githubGet<GithubRepoEvent[]>(token, `/repos/${owner}/${repo}/events`, {
    per_page: perPage,
  });
}

export interface GithubSearchRepoResult {
  total_count: number;
  incomplete_results: boolean;
  items: GithubRepo[];
}

export async function searchRepos(
  token: string,
  query: string,
  page = 1,
  perPage = 20,
): Promise<GithubSearchRepoResult> {
  return githubGet<GithubSearchRepoResult>(token, "/search/repositories", {
    q: query,
    per_page: perPage,
    page,
  });
}

export function parseGistUrl(
  url: string,
): { gistId: string; owner?: string } | null {
  try {
    const u = new URL(url);
    if (u.hostname !== "gist.github.com") return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length === 1) return { gistId: parts[0] };
    if (parts.length >= 2) return { owner: parts[0], gistId: parts[1] };
    return null;
  } catch {
    return null;
  }
}

const RELEVANT_EVENT_TYPES = new Set([
  "PullRequestEvent",
  "PullRequestReviewEvent",
  "IssuesEvent",
  "ReleaseEvent",
  "PushEvent",
  "CreateEvent",
]);

export function isRelevantEvent(type: string): boolean {
  return RELEVANT_EVENT_TYPES.has(type);
}

export function summarizeEvent(event: GithubRepoEvent): {
  title: string;
  url: string | null;
} {
  const p = event.payload as Record<string, unknown>;
  switch (event.type) {
    case "PullRequestEvent": {
      const pr = p.pull_request as
        | { title?: string; html_url?: string; number?: number }
        | undefined;
      const action = (p.action as string | undefined) ?? "updated";
      return {
        title: `PR #${pr?.number ?? "?"} ${action}: ${pr?.title ?? ""}`,
        url: pr?.html_url ?? null,
      };
    }
    case "PullRequestReviewEvent": {
      const pr = p.pull_request as
        | { title?: string; html_url?: string; number?: number }
        | undefined;
      return {
        title: `Review on PR #${pr?.number ?? "?"}: ${pr?.title ?? ""}`,
        url: pr?.html_url ?? null,
      };
    }
    case "IssuesEvent": {
      const issue = p.issue as
        | { title?: string; html_url?: string; number?: number }
        | undefined;
      const action = (p.action as string | undefined) ?? "updated";
      return {
        title: `Issue #${issue?.number ?? "?"} ${action}: ${issue?.title ?? ""}`,
        url: issue?.html_url ?? null,
      };
    }
    case "ReleaseEvent": {
      const release = p.release as
        | { name?: string; tag_name?: string; html_url?: string }
        | undefined;
      return {
        title: `Release: ${release?.name ?? release?.tag_name ?? ""}`,
        url: release?.html_url ?? null,
      };
    }
    case "PushEvent": {
      const commits = (p.commits as unknown[] | undefined) ?? [];
      const ref = (p.ref as string | undefined) ?? "";
      return {
        title: `Pushed ${commits.length} commit${
          commits.length === 1 ? "" : "s"
        } to ${ref.replace(/^refs\/heads\//, "")}`,
        url: `https://github.com/${event.repo.name}`,
      };
    }
    case "CreateEvent": {
      const refType = (p.ref_type as string | undefined) ?? "ref";
      const ref = (p.ref as string | undefined) ?? "";
      return {
        title: `Created ${refType}${ref ? ` ${ref}` : ""}`,
        url: `https://github.com/${event.repo.name}`,
      };
    }
    default:
      return {
        title: event.type,
        url: `https://github.com/${event.repo.name}`,
      };
  }
}

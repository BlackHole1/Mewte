export type GitHubErrorKind =
  | "unauthorized"
  | "rate_limited"
  | "forbidden"
  | "not_found"
  | "network"
  | "http";

export class GitHubError extends Error {
  readonly kind: GitHubErrorKind;
  readonly status: number;
  /** Epoch milliseconds after which a rate-limited request may be retried. */
  readonly retryAt: number | undefined;

  constructor(kind: GitHubErrorKind, status: number, message: string, retryAt?: number) {
    super(message);
    this.name = "GitHubError";
    this.kind = kind;
    this.status = status;
    this.retryAt = retryAt;
  }

  /** True when the resource simply is not visible to this token. */
  get unavailable(): boolean {
    return this.kind === "not_found" || this.kind === "forbidden";
  }
}

export interface GitHubUser {
  id: number;
  login: string;
  avatarUrl: string;
  scopes: string[];
}

export interface GitHubNotification {
  id: string;
  reason: string;
  /** False for a notification that was read, and for one that was marked as done. */
  unread: boolean;
  updated_at: string;
  subject: {
    title: string;
    url: string | null;
    latest_comment_url: string | null;
    type: string;
  };
  repository: {
    full_name: string;
    html_url: string;
    private?: boolean;
    owner: { login: string };
  };
}

export type NotificationList = {
  pollIntervalSec: number | undefined;
  /** The token's scopes as of this response. Undefined when GitHub did not report them. */
  scopes: string[] | undefined;
} & (
  | { notModified: true }
  | {
      notModified: false;
      notifications: GitHubNotification[];
      lastModified: string | undefined;
    }
);

export interface GitHubClientOptions {
  token: string;
  apiUrl: string;
  fetch?: typeof fetch | undefined;
  now?: (() => number) | undefined;
}

export interface GitHubClient {
  getAuthenticatedUser(): Promise<GitHubUser>;
  /**
   * Lists unread and read notifications. GitHub also returns the ones marked as done, as read,
   * and offers no way to tell them from the read ones still in the inbox.
   */
  listNotifications(options?: { ifModifiedSince?: string | undefined }): Promise<NotificationList>;
  markThreadDone(threadId: string): Promise<void>;
  /** GETs a URL the API handed back. Refuses anything outside the configured API origin. */
  getJson<T>(url: string): Promise<T>;
  /** GETs every page of a list endpoint. */
  getAllPages<T>(url: string): Promise<T[]>;
  graphql<T>(query: string, variables: Record<string, unknown>): Promise<T>;
}

const USER_AGENT = "Mewte (+https://github.com/BlackHole1/Mewte)";
const MAX_PAGES = 1000;

function nextLink(header: string | null): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(",")) {
    const match = /<([^>]+)>\s*;\s*rel="next"/.exec(part);
    if (match) return match[1];
  }
  return undefined;
}

/** Classic tokens get their scopes back on every response, so a change shows up at once. */
function parseScopes(headers: Headers): string[] | undefined {
  const header = headers.get("x-oauth-scopes");
  if (header === null) return undefined;
  return header
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function parseInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function createGitHubClient(options: GitHubClientOptions): GitHubClient {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const apiUrl = options.apiUrl.replace(/\/+$/, "");
  const apiOrigin = new URL(apiUrl).origin;
  // GitHub Enterprise Server serves REST under /api/v3 and GraphQL under /api/graphql.
  const graphqlUrl = apiUrl.endsWith("/api/v3")
    ? `${apiUrl.slice(0, -"/v3".length)}/graphql`
    : `${apiUrl}/graphql`;

  function resolve(pathOrUrl: string): string {
    const url = pathOrUrl.startsWith("/") ? `${apiUrl}${pathOrUrl}` : pathOrUrl;
    if (new URL(url).origin !== apiOrigin) {
      throw new GitHubError("http", 0, "Refusing to send the token to a non-GitHub URL");
    }
    return url;
  }

  async function toError(response: Response): Promise<GitHubError> {
    let message = `GitHub responded with ${response.status}`;
    try {
      const body = (await response.json()) as { message?: unknown };
      if (typeof body.message === "string") message = `${message}: ${body.message}`;
    } catch {
      // The body is optional context only.
    }

    if (response.status === 401) return new GitHubError("unauthorized", 401, message);

    const retryAfter = parseInteger(response.headers.get("retry-after"));
    const remaining = response.headers.get("x-ratelimit-remaining");
    const reset = parseInteger(response.headers.get("x-ratelimit-reset"));
    if (
      response.status === 429 ||
      (response.status === 403 && (retryAfter !== undefined || remaining === "0"))
    ) {
      const retryAt =
        retryAfter !== undefined
          ? now() + retryAfter * 1000
          : reset !== undefined
            ? reset * 1000
            : now() + 60_000;
      return new GitHubError("rate_limited", response.status, message, retryAt);
    }

    if (response.status === 403) return new GitHubError("forbidden", 403, message);
    if (response.status === 404 || response.status === 410) {
      return new GitHubError("not_found", response.status, message);
    }
    return new GitHubError("http", response.status, message);
  }

  async function request(
    pathOrUrl: string,
    init: { method?: string; headers?: Record<string, string>; body?: string } = {},
  ): Promise<Response> {
    const url = resolve(pathOrUrl);
    let response: Response;
    try {
      response = await doFetch(url, {
        method: init.method ?? "GET",
        body: init.body,
        redirect: "error",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${options.token}`,
          "User-Agent": USER_AGENT,
          "X-GitHub-Api-Version": "2022-11-28",
          ...init.headers,
        },
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new GitHubError("network", 0, `Could not reach GitHub: ${reason}`);
    }
    if (response.ok || response.status === 304) return response;
    throw await toError(response);
  }

  async function getAllPages<T>(url: string): Promise<T[]> {
    const first = new URL(resolve(url));
    if (!first.searchParams.has("per_page")) first.searchParams.set("per_page", "100");
    const items: T[] = [];
    let next: string | undefined = first.toString();
    for (let page = 0; next && page < MAX_PAGES; page++) {
      const response = await request(next);
      items.push(...((await response.json()) as T[]));
      next = nextLink(response.headers.get("link"));
    }
    return items;
  }

  return {
    async getAuthenticatedUser() {
      const response = await request("/user");
      const body = (await response.json()) as { id: number; login: string; avatar_url: string };
      return {
        id: body.id,
        login: body.login,
        avatarUrl: body.avatar_url,
        scopes: parseScopes(response.headers) ?? [],
      };
    },

    async listNotifications({ ifModifiedSince } = {}) {
      const headers: Record<string, string> = {};
      if (ifModifiedSince) headers["If-Modified-Since"] = ifModifiedSince;

      const first = await request("/notifications?all=true&per_page=50", { headers });
      const pollIntervalSec = parseInteger(first.headers.get("x-poll-interval"));
      const scopes = parseScopes(first.headers);
      if (first.status === 304) return { notModified: true, pollIntervalSec, scopes };

      const notifications = (await first.json()) as GitHubNotification[];
      let next = nextLink(first.headers.get("link"));
      for (let page = 1; next && page < MAX_PAGES; page++) {
        const response = await request(next);
        notifications.push(...((await response.json()) as GitHubNotification[]));
        next = nextLink(response.headers.get("link"));
      }
      return {
        notModified: false,
        notifications,
        lastModified: first.headers.get("last-modified") ?? undefined,
        pollIntervalSec,
        scopes,
      };
    },

    async markThreadDone(threadId) {
      await request(`/notifications/threads/${encodeURIComponent(threadId)}`, { method: "DELETE" });
    },

    async getJson<T>(url: string) {
      const response = await request(url);
      return (await response.json()) as T;
    },

    getAllPages,

    async graphql<T>(query: string, variables: Record<string, unknown>) {
      const response = await request(graphqlUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
      const body = (await response.json()) as { data?: T; errors?: { message: string }[] };
      if (body.errors?.length || !body.data) {
        const message = body.errors?.map((e) => e.message).join("; ") ?? "empty response";
        const kind = /rate limit/i.test(message) ? "rate_limited" : "http";
        throw new GitHubError(kind, response.status, `GitHub GraphQL error: ${message}`);
      }
      return body.data;
    },
  };
}

/** Whether two scope lists name the same scopes, in any order. */
export function sameScopes(a: string[], b: string[]): boolean {
  return a.toSorted().join() === b.toSorted().join();
}

/** Scopes a classic token needs, and what is lost without the optional one. */
export function checkScopes(scopes: string[]): { canReadNotifications: boolean; hasRepo: boolean } {
  const hasRepo = scopes.includes("repo");
  return { canReadNotifications: hasRepo || scopes.includes("notifications"), hasRepo };
}

/** Turns an API URL into the page a person would open, when the mapping is mechanical. */
export function apiUrlToHtmlUrl(apiUrl: string | null, repoHtmlUrl: string): string {
  if (!apiUrl) return repoHtmlUrl;
  const match = /\/repos\/[^/]+\/[^/]+\/(pulls|issues|commits)\/([^/?#]+)/.exec(apiUrl);
  if (!match) return repoHtmlUrl;
  const segment = { pulls: "pull", issues: "issues", commits: "commit" }[match[1] as "pulls"];
  return `${repoHtmlUrl}/${segment}/${match[2]}`;
}

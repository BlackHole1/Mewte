import type { GitHubNotification } from "../github/client";

export interface FakeNotificationInput {
  id: string;
  repo?: string;
  type?: string;
  title?: string;
  reason?: string;
  /** Path below the repository, e.g. `pulls/7`. `null` mimics Discussions. */
  subjectPath?: string | null;
  latestCommentPath?: string | null;
  updatedAt?: string;
  /** False for a notification that was already read. */
  unread?: boolean;
  private?: boolean;
}

interface Call {
  method: string;
  path: string;
  headers: Headers;
}

type Handler = (request: { url: URL; headers: Headers; body: unknown }) => Response | unknown;

const DEFAULT_API = "https://api.github.test";

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

/** An in-memory stand-in for the parts of the GitHub API Mewte calls. */
export class FakeGitHub {
  readonly apiUrl: string;
  readonly calls: Call[] = [];
  /** token -> user. Unknown tokens get a 401. */
  readonly users = new Map<
    string,
    { id: number; login: string; scopes: string; avatarUrl?: string }
  >();
  notifications: GitHubNotification[] = [];
  lastModified = "Mon, 05 Oct 2026 10:00:00 GMT";
  pollInterval = 60;
  pageSize = 50;
  readonly done: string[] = [];
  /** Exact `METHOD path` -> canned response, checked before the built-in routes. */
  readonly overrides = new Map<string, Handler>();
  /** GET path -> JSON body for subject, comment and list endpoints. */
  readonly resources = new Map<string, unknown>();
  graphql: Handler = () => json({ data: { search: { nodes: [] } } });

  constructor(apiUrl: string = DEFAULT_API) {
    this.apiUrl = apiUrl;
    this.users.set("ghp_valid_token_0000000000", {
      id: 1,
      login: "octocat",
      scopes: "notifications, repo",
    });
  }

  addNotification(input: FakeNotificationInput): GitHubNotification {
    const repo = input.repo ?? "acme/widgets";
    const url = (path: string | null | undefined) =>
      path === null || path === undefined ? null : `${this.apiUrl}/repos/${repo}/${path}`;
    const notification: GitHubNotification = {
      id: input.id,
      reason: input.reason ?? "subscribed",
      unread: input.unread ?? true,
      updated_at: input.updatedAt ?? "2026-10-05T10:00:00Z",
      subject: {
        title: input.title ?? `Notification ${input.id}`,
        type: input.type ?? "PullRequest",
        url: input.subjectPath === undefined ? url(`pulls/${input.id}`) : url(input.subjectPath),
        latest_comment_url: url(input.latestCommentPath),
      },
      repository: {
        full_name: repo,
        html_url: `https://github.test/${repo}`,
        private: input.private ?? false,
        owner: { login: repo.split("/")[0]! },
      },
    };
    this.notifications.push(notification);
    return notification;
  }

  /** Registers the JSON returned for `GET /repos/<repo>/<path>`. */
  resource(repoPath: string, body: unknown): void {
    this.resources.set(`/repos/${repoPath}`, body);
  }

  count(method: string, pathPrefix: string): number {
    return this.calls.filter((c) => c.method === method && c.path.startsWith(pathPrefix)).length;
  }

  reset(): void {
    this.calls.length = 0;
  }

  readonly fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    this.calls.push({ method, path: url.pathname, headers });

    const user = this.users.get((headers.get("authorization") ?? "").replace(/^Bearer /, ""));
    if (!user) return json({ message: "Bad credentials" }, { status: 401 });

    const override = this.overrides.get(`${method} ${url.pathname}`);
    if (override) {
      const result = override({ url, headers, body });
      return result instanceof Response ? result : json(result);
    }

    if (method === "GET" && url.pathname === "/user") {
      return json(
        {
          id: user.id,
          login: user.login,
          avatar_url: user.avatarUrl ?? `https://avatars.github.test/${user.login}`,
        },
        { headers: { "x-oauth-scopes": user.scopes } },
      );
    }

    if (method === "GET" && url.pathname === "/notifications") {
      const common = {
        "x-poll-interval": String(this.pollInterval),
        "last-modified": this.lastModified,
        "x-oauth-scopes": user.scopes,
      };
      if (headers.get("if-modified-since") === this.lastModified) {
        return new Response(null, { status: 304, headers: common });
      }
      const page = Number(url.searchParams.get("page") ?? "1");
      const start = (page - 1) * this.pageSize;
      // Like GitHub: `all` adds the read notifications, the ones marked as done among them.
      const all = url.searchParams.get("all") === "true";
      const items = this.notifications.filter((n) => all || n.unread);
      const link =
        start + this.pageSize < items.length
          ? {
              link: `<${this.apiUrl}/notifications?${all ? "all=true&" : ""}per_page=${this.pageSize}&page=${page + 1}>; rel="next"`,
            }
          : undefined;
      return json(items.slice(start, start + this.pageSize), { headers: { ...common, ...link } });
    }

    const thread = /^\/notifications\/threads\/(.+)$/.exec(url.pathname);
    if (method === "DELETE" && thread) {
      const id = decodeURIComponent(thread[1]!);
      this.done.push(id);
      // A done notification stays in the list, as a read one.
      for (const notification of this.notifications) {
        if (notification.id === id) notification.unread = false;
      }
      return new Response(null, { status: 204 });
    }

    if (method === "POST" && url.pathname === "/graphql") {
      const result = this.graphql({ url, headers, body });
      return result instanceof Response ? result : json(result);
    }

    if (method === "GET" && this.resources.has(url.pathname)) {
      return json(this.resources.get(url.pathname));
    }

    return json({ message: "Not Found" }, { status: 404 });
  }) as typeof fetch;
}

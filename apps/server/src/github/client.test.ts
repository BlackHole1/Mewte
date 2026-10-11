import { describe, expect, it } from "vitest";
import { FakeGitHub } from "../testing/fake-github";
import { VALID_TOKEN } from "../testing/harness";
import { GitHubError, apiUrlToHtmlUrl, checkScopes, createGitHubClient } from "./client";

function setup(token = VALID_TOKEN) {
  const github = new FakeGitHub();
  const client = createGitHubClient({
    token,
    apiUrl: github.apiUrl,
    fetch: github.fetch,
    now: () => 1_000_000,
  });
  return { github, client };
}

async function failure(promise: Promise<unknown>): Promise<GitHubError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof GitHubError) return error;
    throw error;
  }
  throw new Error("expected a GitHubError");
}

describe("GitHub client", () => {
  it("reads the authenticated user and token scopes", async () => {
    const { client, github } = setup();
    expect(await client.getAuthenticatedUser()).toEqual({
      id: 1,
      login: "octocat",
      avatarUrl: "https://avatars.github.test/octocat",
      scopes: ["notifications", "repo"],
    });
    const headers = github.calls[0]!.headers;
    expect(headers.get("authorization")).toBe(`Bearer ${VALID_TOKEN}`);
    expect(headers.get("x-github-api-version")).toBe("2022-11-28");
    expect(headers.get("user-agent")).toContain("Mewte");
  });

  it("follows pagination for notifications", async () => {
    const { client, github } = setup();
    github.pageSize = 2;
    for (let i = 1; i <= 5; i++) github.addNotification({ id: String(i) });
    const list = await client.listNotifications();
    if (list.notModified) throw new Error("unexpected 304");
    expect(list.notifications.map((n) => n.id)).toEqual(["1", "2", "3", "4", "5"]);
    expect(list.lastModified).toBe(github.lastModified);
    expect(list.pollIntervalSec).toBe(60);
    expect(github.count("GET", "/notifications")).toBe(3);
  });

  it("returns notModified on 304 and still reports the poll interval", async () => {
    const { client, github } = setup();
    github.pollInterval = 120;
    const list = await client.listNotifications({ ifModifiedSince: github.lastModified });
    expect(list).toEqual({ notModified: true, pollIntervalSec: 120 });
  });

  it("marks a thread as done with DELETE", async () => {
    const { client, github } = setup();
    await client.markThreadDone("42");
    expect(github.done).toEqual(["42"]);
    expect(github.calls.at(-1)).toMatchObject({
      method: "DELETE",
      path: "/notifications/threads/42",
    });
  });

  it("collects every page of a list", async () => {
    const { client, github } = setup();
    github.overrides.set("GET /repos/acme/widgets/issues/1/comments", ({ url }) => {
      const page = Number(url.searchParams.get("page") ?? "1");
      expect(url.searchParams.get("per_page")).toBe("100");
      const link =
        page < 3
          ? {
              link: `<${github.apiUrl}/repos/acme/widgets/issues/1/comments?per_page=100&page=${page + 1}>; rel="next", <x>; rel="last"`,
            }
          : undefined;
      return new Response(JSON.stringify([{ n: page }]), { headers: { ...link } });
    });
    expect(
      await client.getAllPages(`${github.apiUrl}/repos/acme/widgets/issues/1/comments`),
    ).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
  });

  it("never sends the token to another origin", async () => {
    const { client, github } = setup();
    const error = await failure(client.getJson("https://evil.example/steal"));
    expect(error.message).toMatch(/non-GitHub/);
    expect(github.calls).toHaveLength(0);
  });

  it("classifies errors", async () => {
    const { github, client } = setup();
    expect(
      (await failure(setup("ghp_revoked_token_000000000").client.getAuthenticatedUser())).kind,
    ).toBe("unauthorized");

    const respond = (status: number, headers: Record<string, string> = {}) =>
      github.overrides.set(
        "GET /x",
        () => new Response(JSON.stringify({ message: "nope" }), { status, headers }),
      );

    respond(404);
    expect(await failure(client.getJson("/x"))).toMatchObject({
      kind: "not_found",
      unavailable: true,
    });
    respond(410);
    expect((await failure(client.getJson("/x"))).kind).toBe("not_found");
    respond(403);
    expect(await failure(client.getJson("/x"))).toMatchObject({
      kind: "forbidden",
      unavailable: true,
    });
    respond(500);
    expect(await failure(client.getJson("/x"))).toMatchObject({
      kind: "http",
      status: 500,
      unavailable: false,
    });
    expect((await failure(client.getJson("/x"))).message).toContain("nope");
  });

  it("recognises rate limits and when to retry", async () => {
    const { github, client } = setup();
    const respond = (status: number, headers: Record<string, string>) =>
      github.overrides.set("GET /x", () => new Response("{}", { status, headers }));

    respond(403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "2000" });
    expect(await failure(client.getJson("/x"))).toMatchObject({
      kind: "rate_limited",
      retryAt: 2_000_000,
    });
    respond(403, { "retry-after": "30" });
    expect(await failure(client.getJson("/x"))).toMatchObject({
      kind: "rate_limited",
      retryAt: 1_030_000,
    });
    respond(429, {});
    expect(await failure(client.getJson("/x"))).toMatchObject({
      kind: "rate_limited",
      retryAt: 1_060_000,
    });
  });

  it("reports network failures", async () => {
    const client = createGitHubClient({
      token: VALID_TOKEN,
      apiUrl: "https://api.github.test",
      fetch: (async () => {
        throw new Error("socket hang up");
      }) as unknown as typeof fetch,
    });
    expect(await failure(client.getJson("/x"))).toMatchObject({ kind: "network" });
  });

  it("posts GraphQL queries and surfaces their errors", async () => {
    const { github, client } = setup();
    github.graphql = ({ body }) => ({ data: { echo: (body as { variables: unknown }).variables } });
    expect(await client.graphql("query", { a: 1 })).toEqual({ echo: { a: 1 } });
    expect(github.calls.at(-1)).toMatchObject({ method: "POST", path: "/graphql" });

    github.graphql = () => ({ errors: [{ message: "Field 'x' doesn't exist" }] });
    expect(await failure(client.graphql("query", {}))).toMatchObject({ kind: "http" });
    github.graphql = () => ({ errors: [{ message: "API rate limit exceeded" }] });
    expect((await failure(client.graphql("query", {}))).kind).toBe("rate_limited");
  });

  it("uses the Enterprise Server GraphQL path", async () => {
    const paths: string[] = [];
    const client = createGitHubClient({
      token: VALID_TOKEN,
      apiUrl: "https://ghe.example.com/api/v3/",
      fetch: (async (input: string) => {
        paths.push(input);
        return new Response(JSON.stringify({ data: {} }));
      }) as unknown as typeof fetch,
    });
    await client.graphql("query", {});
    await client.getJson("/user");
    expect(paths).toEqual([
      "https://ghe.example.com/api/graphql",
      "https://ghe.example.com/api/v3/user",
    ]);
  });
});

describe("helpers", () => {
  it("checks token scopes", () => {
    expect(checkScopes(["notifications"])).toEqual({ canReadNotifications: true, hasRepo: false });
    expect(checkScopes(["repo"])).toEqual({ canReadNotifications: true, hasRepo: true });
    expect(checkScopes(["read:user"])).toEqual({ canReadNotifications: false, hasRepo: false });
    expect(checkScopes([])).toEqual({ canReadNotifications: false, hasRepo: false });
  });

  it("maps API URLs to web URLs", () => {
    const repo = "https://github.com/acme/widgets";
    const api = "https://api.github.com/repos/acme/widgets";
    expect(apiUrlToHtmlUrl(`${api}/pulls/7`, repo)).toBe(`${repo}/pull/7`);
    expect(apiUrlToHtmlUrl(`${api}/issues/8`, repo)).toBe(`${repo}/issues/8`);
    expect(apiUrlToHtmlUrl(`${api}/commits/abc123`, repo)).toBe(`${repo}/commit/abc123`);
    expect(apiUrlToHtmlUrl(`${api}/releases/99`, repo)).toBe(repo);
    expect(apiUrlToHtmlUrl(null, repo)).toBe(repo);
  });
});

import {
  getAccount,
  insertRule,
  listAccounts,
  queryHistory,
  queryRunLogs,
  releaseLease,
} from "@mewte/db";
import type { Condition, ConditionLeaf, RuleInput } from "@mewte/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Harness, VALID_TOKEN, createHarness } from "../testing/harness";
import { bindAccount } from "./accounts";
import { dryRun, rulesForAccount, runAccount, scopeIncludes } from "./runner";
import { createScheduler } from "./scheduler";

type LeafInput = ConditionLeaf extends infer L
  ? L extends unknown
    ? Omit<L, "type">
    : never
  : never;
const leaf = (l: LeafInput) => ({ type: "leaf", ...l }) as ConditionLeaf;
const all = (...children: Condition[]): RuleInput["condition"] => ({
  type: "group",
  op: "and",
  children,
});

let h: Harness;
let accountId: string;
let ruleCount = 0;

async function addRule(condition: RuleInput["condition"], patch: Partial<RuleInput> = {}) {
  return insertRule(
    h.deps.conn,
    `rule-${++ruleCount}`,
    {
      name: `Rule ${ruleCount}`,
      enabled: true,
      priority: 10,
      accountScope: { type: "all" },
      condition,
      action: "mark_done",
      ...patch,
    },
    h.clock.now + ruleCount,
  );
}

async function run(trigger: "manual" | "schedule" = "manual") {
  const outcome = await runAccount(h.deps, accountId, trigger);
  if (outcome.kind !== "done") throw new Error(`run was ${outcome.kind}`);
  return outcome.run;
}

beforeEach(async () => {
  h = await createHarness();
  accountId = (await bindAccount(h.deps, { token: VALID_TOKEN, intervalSec: 300 })).id;
  h.github.reset();
});

afterEach(async () => {
  await h.cleanup();
});

describe("scope helpers", () => {
  it("matches accounts by scope", () => {
    expect(scopeIncludes({ type: "all" }, "a")).toBe(true);
    expect(scopeIncludes({ type: "accounts", accountIds: ["a"] }, "a")).toBe(true);
    expect(scopeIncludes({ type: "accounts", accountIds: ["b"] }, "a")).toBe(false);
  });

  it("keeps enabled rules in scope, ordered by priority", async () => {
    const cond = all(leaf({ field: "repo", operator: "matches", value: ["*"] }));
    await addRule(cond, { priority: 5, name: "second" });
    await addRule(cond, { priority: 1, name: "first" });
    await addRule(cond, { priority: 0, enabled: false, name: "disabled" });
    await addRule(cond, {
      priority: 0,
      accountScope: { type: "accounts", accountIds: ["other"] },
      name: "other",
    });
    const { listRules } = await import("@mewte/db");
    expect(rulesForAccount(await listRules(h.deps.conn), accountId).map((r) => r.name)).toEqual([
      "first",
      "second",
    ]);
  });
});

describe("runAccount", () => {
  it("marks matching notifications as done and records history", async () => {
    h.github.addNotification({
      id: "1",
      repo: "acme/widgets",
      title: "Bump lodash",
      reason: "subscribed",
    });
    h.github.addNotification({ id: "2", repo: "other/repo", title: "Hello" });
    const rule = await addRule(
      all(leaf({ field: "repo", operator: "matches", value: ["acme/*"] })),
    );

    const result = await run();
    expect(result).toMatchObject({
      status: "success",
      trigger: "manual",
      fetched: 2,
      matched: 1,
      processed: 1,
      errors: [],
    });
    expect(h.github.done).toEqual(["1"]);

    const history = await queryHistory(h.deps.conn, { page: 1, pageSize: 10 });
    expect(history.items).toHaveLength(1);
    expect(history.items[0]).toMatchObject({
      accountId,
      accountLogin: "octocat",
      threadId: "1",
      title: "Bump lodash",
      repo: "acme/widgets",
      subjectType: "PullRequest",
      reason: "subscribed",
      url: "https://github.test/acme/widgets/pull/1",
      ruleId: rule.id,
      ruleName: rule.name,
      processedAt: h.clock.now,
    });

    const logs = await queryRunLogs(h.deps.conn, { page: 1, pageSize: 10 });
    expect(logs.items).toEqual([result]);

    const account = await getAccount(h.deps.conn, accountId);
    expect(account).toMatchObject({
      status: "ok",
      lastError: null,
      lastRunAt: h.clock.now,
      lastModified: h.github.lastModified,
      pollIntervalSec: 60,
      nextRunAt: h.clock.now + 300_000,
      lockOwner: null,
    });
  });

  it("stops at the first matching rule by priority", async () => {
    h.github.addNotification({ id: "1" });
    const everything = all(leaf({ field: "repo", operator: "matches", value: ["*"] }));
    await addRule(everything, { priority: 20, name: "low" });
    const winner = await addRule(everything, { priority: 1, name: "high" });
    await run();
    const history = await queryHistory(h.deps.conn, { page: 1, pageSize: 10 });
    expect(history.items.map((i) => i.ruleName)).toEqual([winner.name]);
  });

  it("does not call GitHub when no rule applies to the account", async () => {
    h.github.addNotification({ id: "1" });
    await addRule(all(leaf({ field: "repo", operator: "matches", value: ["*"] })), {
      enabled: false,
    });
    expect(await run()).toMatchObject({ status: "success", fetched: 0, processed: 0 });
    expect(h.github.calls).toHaveLength(0);
  });

  it("fetches subject details only when a rule cannot be decided without them", async () => {
    h.github.addNotification({ id: "7", repo: "acme/widgets" });
    h.github.addNotification({ id: "8", repo: "other/repo" });
    h.github.resource("acme/widgets/pulls/7", {
      html_url: "https://github.test/acme/widgets/pull/7#top",
      user: { login: "dependabot[bot]", type: "Bot" },
      state: "closed",
      merged: true,
      labels: [{ name: "dependencies" }],
      assignees: [],
      requested_reviewers: [],
    });
    await addRule(
      all(
        leaf({ field: "repo", operator: "matches", value: ["acme/*"] }),
        leaf({ field: "state", operator: "in", value: ["merged"] }),
        leaf({ field: "author_is_bot", operator: "is", value: true }),
        leaf({ field: "label", operator: "any", value: ["dependencies"] }),
      ),
    );

    expect(await run()).toMatchObject({ fetched: 2, processed: 1 });
    expect(h.github.done).toEqual(["7"]);
    // The repo leaf already rules out notification 8, so its subject is never requested.
    expect(h.github.count("GET", "/repos/acme/widgets/pulls/7")).toBe(1);
    expect(h.github.count("GET", "/repos/other/repo")).toBe(0);
    const history = await queryHistory(h.deps.conn, { page: 1, pageSize: 10 });
    expect(history.items[0]?.url).toBe("https://github.test/acme/widgets/pull/7#top");
  });

  it("does not match when the needed data is not visible to the token", async () => {
    h.github.addNotification({ id: "9", repo: "private/repo" });
    await addRule(all(leaf({ field: "state", operator: "not_in", value: ["open"] })));
    expect(await run()).toMatchObject({ status: "success", fetched: 1, matched: 0, errors: [] });
    expect(h.github.done).toEqual([]);

    // The "not visible" answer is cached, so a second run does not ask again.
    h.github.reset();
    await run();
    expect(h.github.count("GET", "/repos/private/repo")).toBe(0);
  });

  it("refetches details when the notification has new activity", async () => {
    const notification = h.github.addNotification({ id: "7" });
    h.github.resource("acme/widgets/pulls/7", {
      user: { login: "a" },
      state: "open",
      labels: [],
      assignees: [],
    });
    await addRule(all(leaf({ field: "state", operator: "in", value: ["merged"] })));

    await run();
    await run();
    expect(h.github.count("GET", "/repos/acme/widgets/pulls/7")).toBe(1);

    notification.updated_at = "2026-10-05T11:00:00Z";
    h.github.resource("acme/widgets/pulls/7", {
      user: { login: "a" },
      state: "closed",
      merged: true,
    });
    expect(await run()).toMatchObject({ processed: 1 });
    expect(h.github.count("GET", "/repos/acme/widgets/pulls/7")).toBe(2);
  });

  it("resolves the actor from the latest comment, falling back to the author", async () => {
    h.github.addNotification({
      id: "1",
      type: "Issue",
      subjectPath: "issues/1",
      latestCommentPath: "issues/comments/55",
    });
    h.github.addNotification({
      id: "2",
      type: "Issue",
      subjectPath: "issues/2",
      latestCommentPath: "issues/2",
    });
    h.github.resource("acme/widgets/issues/comments/55", {
      user: { login: "renovate[bot]", type: "Bot" },
    });
    h.github.resource("acme/widgets/issues/2", {
      user: { login: "stale[bot]", type: "Bot" },
      state: "open",
    });
    h.github.resource("acme/widgets/issues/1", {
      user: { login: "human", type: "User" },
      state: "open",
    });
    await addRule(all(leaf({ field: "actor_is_bot", operator: "is", value: true })));

    expect(await run()).toMatchObject({ processed: 2 });
    expect(h.github.count("GET", "/repos/acme/widgets/issues/1")).toBe(0);
  });

  it("collects every commenter of a pull request from all three sources", async () => {
    h.github.addNotification({ id: "7" });
    h.github.resource("acme/widgets/issues/7/comments", [
      { user: { login: "alice" } },
      { user: null },
    ]);
    h.github.resource("acme/widgets/pulls/7/comments", [
      { user: { login: "bob" } },
      { user: { login: "alice" } },
    ]);
    h.github.resource("acme/widgets/pulls/7/reviews", [
      { user: { login: "carol" }, body: "Looks good" },
      { user: { login: "dave" }, body: "" },
    ]);
    await addRule(
      all(leaf({ field: "commenter", operator: "all", value: ["alice", "bob", "carol"] })),
    );
    expect(await run()).toMatchObject({ processed: 1 });
  });

  it("treats requested reviewers and submitted reviews as reviewers", async () => {
    h.github.addNotification({ id: "7" });
    h.github.resource("acme/widgets/pulls/7", {
      user: { login: "a" },
      state: "open",
      requested_reviewers: [{ login: "erin" }],
    });
    h.github.resource("acme/widgets/pulls/7/reviews", [{ user: { login: "frank" }, body: null }]);
    await addRule(all(leaf({ field: "reviewer", operator: "all", value: ["erin", "frank"] })));
    expect(await run()).toMatchObject({ processed: 1 });
  });

  it("reads Discussions through GraphQL, including paged comments and replies", async () => {
    h.github.addNotification({
      id: "d1",
      type: "Discussion",
      subjectPath: null,
      title: 'How do "plugins" work?',
    });
    const queries: string[] = [];
    const reply = (login: string, createdAt: string, type = "User") => ({
      author: { login, __typename: type },
      createdAt,
    });
    h.github.graphql = ({ body }) => {
      const { query, variables } = body as {
        query: string;
        variables: Record<string, string | null>;
      };
      if (query.includes("search(")) {
        queries.push(String(variables.q));
        return {
          data: {
            search: {
              nodes: [
                {
                  id: "D_other",
                  title: "Something else",
                  url: "u",
                  closed: false,
                  isAnswered: null,
                  updatedAt: "2026-10-05T10:00:00Z",
                  author: null,
                  labels: { nodes: [] },
                  comments: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
                },
                {
                  id: "D_1",
                  title: 'How do "plugins" work?',
                  url: "https://github.test/acme/widgets/discussions/3",
                  closed: true,
                  isAnswered: true,
                  updatedAt: "2026-10-05T10:00:00Z",
                  author: { login: "asker", __typename: "User" },
                  labels: { nodes: [{ name: "question" }] },
                  comments: {
                    pageInfo: { hasNextPage: true, endCursor: "c1" },
                    nodes: [
                      {
                        id: "DC_1",
                        ...reply("alice", "2026-10-01T00:00:00Z"),
                        replies: {
                          pageInfo: { hasNextPage: true, endCursor: "r1" },
                          nodes: [reply("bob", "2026-10-02T00:00:00Z")],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        };
      }
      if (query.includes("DiscussionComment")) {
        expect(variables).toEqual({ id: "DC_1", after: "r1" });
        return {
          data: {
            node: {
              replies: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [reply("carol", "2026-10-03T00:00:00Z")],
              },
            },
          },
        };
      }
      expect(variables).toEqual({ id: "D_1", after: "c1" });
      return {
        data: {
          node: {
            comments: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                {
                  id: "DC_2",
                  ...reply("github-actions", "2026-10-04T00:00:00Z", "Bot"),
                  replies: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
                },
              ],
            },
          },
        },
      };
    };

    await addRule(
      all(
        leaf({
          field: "commenter",
          operator: "all",
          value: ["alice", "bob", "carol", "github-actions[bot]"],
        }),
        leaf({ field: "state", operator: "in", value: ["closed"] }),
        leaf({ field: "label", operator: "any", value: ["question"] }),
        leaf({ field: "author", operator: "matches", value: ["asker"] }),
        leaf({ field: "actor_is_bot", operator: "is", value: true }),
      ),
    );
    expect(await run()).toMatchObject({ processed: 1, errors: [] });
    expect(queries).toEqual(['repo:acme/widgets in:title "How do  plugins  work?"']);
    const history = await queryHistory(h.deps.conn, { page: 1, pageSize: 10 });
    expect(history.items[0]?.url).toBe("https://github.test/acme/widgets/discussions/3");
  });

  it("tells answered Discussions from open and closed ones", async () => {
    const discussion = (id: string, title: string, closed: boolean, isAnswered: boolean | null) => {
      h.github.addNotification({ id, type: "Discussion", subjectPath: null, title });
      return {
        id: `D_${id}`,
        title,
        url: `https://github.test/acme/widgets/discussions/${id}`,
        closed,
        isAnswered,
        updatedAt: "2026-10-05T10:00:00Z",
        author: { login: "asker", __typename: "User" },
        labels: { nodes: [] },
        comments: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
      };
    };
    const nodes = [
      discussion("1", "Still open", false, false),
      discussion("2", "Has an answer", false, true),
      discussion("3", "Closed after an answer", true, true),
      discussion("4", "Announcement", false, null),
    ];
    h.github.graphql = ({ body }) => {
      const { variables } = body as { variables: { q: string } };
      return { data: { search: { nodes: nodes.filter((n) => variables.q.includes(n.title)) } } };
    };

    await addRule(all(leaf({ field: "state", operator: "in", value: ["answered"] })));
    expect(await run()).toMatchObject({ processed: 1, errors: [] });
    const history = await queryHistory(h.deps.conn, { page: 1, pageSize: 10 });
    expect(history.items.map((item) => item.title)).toEqual(["Has an answer"]);
  });

  it("keeps going after a per-notification failure and retries the backlog next time", async () => {
    h.github.addNotification({ id: "1" });
    h.github.addNotification({ id: "2" });
    h.github.overrides.set(
      "DELETE /notifications/threads/1",
      () => new Response("{}", { status: 500 }),
    );
    await addRule(all(leaf({ field: "repo", operator: "matches", value: ["*"] })));

    const result = await run();
    expect(result).toMatchObject({ status: "partial", fetched: 2, matched: 2, processed: 1 });
    expect(result.errors[0]).toContain("acme/widgets");
    expect(h.github.done).toEqual(["2"]);
    expect(await getAccount(h.deps.conn, accountId)).toMatchObject({
      status: "ok",
      lastModified: null,
    });
  });

  it("stops polling an account whose token was revoked", async () => {
    h.github.addNotification({ id: "1" });
    await addRule(all(leaf({ field: "repo", operator: "matches", value: ["*"] })));
    h.github.users.clear();

    const result = await run();
    expect(result).toMatchObject({ status: "error", fetched: 0 });
    expect(result.errors[0]).toContain("401");
    expect(await getAccount(h.deps.conn, accountId)).toMatchObject({ status: "unauthorized" });

    h.clock.advance(3_600_000);
    h.github.reset();
    await createScheduler(h.deps).tick();
    expect(h.github.calls).toHaveLength(0);
  });

  it("waits out a rate limit", async () => {
    await addRule(all(leaf({ field: "repo", operator: "matches", value: ["*"] })));
    const resetAt = Math.floor(h.clock.now / 1000) + 1800;
    h.github.overrides.set(
      "GET /notifications",
      () =>
        new Response("{}", {
          status: 403,
          headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(resetAt) },
        }),
    );
    expect(await run()).toMatchObject({ status: "error" });
    expect(await getAccount(h.deps.conn, accountId)).toMatchObject({
      status: "error",
      nextRunAt: resetAt * 1000,
    });
  });

  it("aborts the run when the rate limit is hit halfway", async () => {
    h.github.addNotification({ id: "1" });
    h.github.addNotification({ id: "2" });
    h.github.overrides.set(
      "DELETE /notifications/threads/1",
      () => new Response("{}", { status: 429 }),
    );
    await addRule(all(leaf({ field: "repo", operator: "matches", value: ["*"] })));
    expect(await run()).toMatchObject({ status: "error", fetched: 2, matched: 1, processed: 0 });
    expect(h.github.done).toEqual([]);
  });

  it("uses If-Modified-Since on schedule but not for a manual run", async () => {
    h.github.addNotification({ id: "1", repo: "other/repo" });
    await addRule(all(leaf({ field: "repo", operator: "matches", value: ["acme/*"] })));

    expect(await run("schedule")).toMatchObject({ fetched: 1 });
    h.clock.advance(300_000);
    expect(await run("schedule")).toMatchObject({ fetched: 0, status: "success" });
    expect(h.github.calls.at(-1)?.headers.get("if-modified-since")).toBe(h.github.lastModified);
    expect((await getAccount(h.deps.conn, accountId))?.lastModified).toBe(h.github.lastModified);

    expect(await run("manual")).toMatchObject({ fetched: 1 });
    expect(h.github.calls.at(-1)?.headers.get("if-modified-since")).toBeNull();
  });

  it("never polls faster than GitHub's X-Poll-Interval", async () => {
    h.github.pollInterval = 900;
    await addRule(all(leaf({ field: "repo", operator: "matches", value: ["*"] })));
    await run();
    expect((await getAccount(h.deps.conn, accountId))?.nextRunAt).toBe(h.clock.now + 900_000);
  });

  it("refuses to overlap with a run that holds the lease", async () => {
    const { acquireLease } = await import("@mewte/db");
    await acquireLease(h.deps.conn, {
      id: accountId,
      owner: "another-instance",
      now: h.clock.now,
      ttlMs: 60_000,
    });
    expect(await runAccount(h.deps, accountId, "manual")).toEqual({ kind: "busy" });
    await releaseLease(h.deps.conn, accountId, "another-instance");
    expect((await runAccount(h.deps, accountId, "manual")).kind).toBe("done");
  });

  it("skips a scheduled run that is not due and reports unknown accounts", async () => {
    await addRule(all(leaf({ field: "repo", operator: "matches", value: ["*"] })));
    await run("schedule");
    expect(await runAccount(h.deps, accountId, "schedule")).toEqual({ kind: "busy" });
    expect(await runAccount(h.deps, "missing", "manual")).toEqual({ kind: "not_found" });
  });
});

describe("scheduler", () => {
  it("runs due accounts once per interval", async () => {
    h.github.addNotification({ id: "1" });
    await addRule(all(leaf({ field: "repo", operator: "matches", value: ["*"] })));
    const scheduler = createScheduler(h.deps);

    await scheduler.tick();
    expect(h.github.done).toEqual(["1"]);
    expect((await queryRunLogs(h.deps.conn, { page: 1, pageSize: 10 })).items[0]).toMatchObject({
      trigger: "schedule",
    });

    h.clock.advance(60_000);
    await scheduler.tick();
    expect((await queryRunLogs(h.deps.conn, { page: 1, pageSize: 10 })).total).toBe(1);

    h.clock.advance(300_000);
    await scheduler.tick();
    expect((await queryRunLogs(h.deps.conn, { page: 1, pageSize: 10 })).total).toBe(2);
  });

  it("skips disabled accounts and ignores overlapping ticks", async () => {
    await addRule(all(leaf({ field: "repo", operator: "matches", value: ["*"] })));
    const scheduler = createScheduler(h.deps);
    await Promise.all([scheduler.tick(), scheduler.tick()]);
    expect((await queryRunLogs(h.deps.conn, { page: 1, pageSize: 10 })).total).toBe(1);

    const { updateAccount } = await import("@mewte/db");
    await updateAccount(h.deps.conn, accountId, { enabled: 0 });
    h.clock.advance(3_600_000);
    await scheduler.tick();
    expect((await queryRunLogs(h.deps.conn, { page: 1, pageSize: 10 })).total).toBe(1);
  });

  it("deletes data past the retention period", async () => {
    const { insertHistory, setSetting, countHistory } = await import("@mewte/db");
    const day = 86_400_000;
    const item = (id: string, processedAt: number) => ({
      id,
      accountId,
      accountLogin: "octocat",
      threadId: id,
      title: "t",
      repo: "a/b",
      subjectType: "Issue",
      reason: "mention",
      url: "u",
      ruleId: null,
      ruleName: "r",
      processedAt,
    });
    await insertHistory(h.deps.conn, [
      item("old", h.clock.now - 31 * day),
      item("new", h.clock.now - 29 * day),
    ]);

    await createScheduler(h.deps).tick();
    expect(await countHistory(h.deps.conn)).toBe(1);

    await setSetting(h.deps.conn, "retention_days", "0");
    h.clock.advance(400 * day);
    await createScheduler(h.deps).tick();
    expect(await countHistory(h.deps.conn)).toBe(1);
  });
});

describe("dryRun", () => {
  it("reports matches without marking anything as done", async () => {
    h.github.addNotification({ id: "1", repo: "acme/widgets", title: "Bump lodash" });
    h.github.addNotification({ id: "2", repo: "other/repo" });
    const result = await dryRun(h.deps, {
      accountScope: { type: "all" },
      condition: all(leaf({ field: "repo", operator: "matches", value: ["acme/*"] })),
    });
    expect(result.accounts).toEqual([
      {
        accountId,
        login: "octocat",
        fetched: 2,
        error: null,
        matches: [
          {
            threadId: "1",
            title: "Bump lodash",
            repo: "acme/widgets",
            subjectType: "PullRequest",
            reason: "subscribed",
            url: "https://github.test/acme/widgets/pull/1",
            updatedAt: "2026-10-05T10:00:00Z",
          },
        ],
      },
    ]);
    expect(h.github.done).toEqual([]);
    expect((await queryHistory(h.deps.conn, { page: 1, pageSize: 10 })).total).toBe(0);
    expect((await queryRunLogs(h.deps.conn, { page: 1, pageSize: 10 })).total).toBe(0);
  });

  it("limits itself to the accounts in scope and reports failures per account", async () => {
    h.github.users.set("ghp_second_token_0000000000", {
      id: 2,
      login: "hubot",
      scopes: "notifications",
    });
    const second = await bindAccount(h.deps, {
      token: "ghp_second_token_0000000000",
      intervalSec: 300,
    });
    expect(await listAccounts(h.deps.conn)).toHaveLength(2);
    const condition = all(leaf({ field: "repo", operator: "matches", value: ["*"] }));

    const scoped = await dryRun(h.deps, {
      accountScope: { type: "accounts", accountIds: [second.id] },
      condition,
    });
    expect(scoped.accounts.map((a) => a.login)).toEqual(["hubot"]);

    h.github.users.delete(VALID_TOKEN);
    const everyone = await dryRun(h.deps, { accountScope: { type: "all" }, condition });
    expect(everyone.accounts.find((a) => a.login === "octocat")?.error).toContain("401");
    expect(everyone.accounts.find((a) => a.login === "hubot")?.error).toBeNull();
  });
});

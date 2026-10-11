import { testDialects } from "@mewte/db/testing";
import type {
  Account,
  Dashboard,
  HistoryItem,
  Paginated,
  Rule,
  RuleInput,
  RunLog,
  Status,
} from "@mewte/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LOGIN_WINDOW_MS, failureDelayMs } from "./services/auth";
import { argon2Hasher } from "./services/password";
import { currentTotp } from "./services/totp";
import { type Harness, OWNER, VALID_TOKEN, body, createHarness, setUp } from "./testing/harness";

const ruleInput = (patch: Partial<RuleInput> = {}): RuleInput => ({
  name: "Everything in acme",
  enabled: true,
  priority: 10,
  accountScope: { type: "all" },
  condition: {
    type: "group",
    op: "and",
    children: [{ type: "leaf", field: "repo", operator: "matches", value: ["acme/*"] }],
  },
  action: "mark_done",
  ...patch,
});

describe.each(testDialects())("API on %s", (kind) => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness(kind);
  });
  afterAll(async () => {
    await h.cleanup();
  });

  it("walks through setup, accounts, rules, a run, history and settings", async () => {
    // Nothing is reachable before setup except the public endpoints.
    expect(await body<Status>(await h.request("GET", "/api/status"))).toEqual({
      initialized: false,
      setupTokenRequired: false,
      user: null,
    });
    expect((await h.request("GET", "/api/accounts")).status).toBe(401);
    expect((await h.request("POST", "/api/auth/login", OWNER)).status).toBe(409);

    await setUp(h);
    expect(await body<Status>(await h.request("GET", "/api/status"))).toEqual({
      initialized: true,
      setupTokenRequired: false,
      user: { username: "admin", totpEnabled: false },
    });
    const again = await h.request("POST", "/api/setup", OWNER);
    expect(again.status).toBe(409);
    expect((await body(again)).error.code).toBe("already_initialized");

    // Accounts
    const created = await h.request("POST", "/api/accounts", { token: VALID_TOKEN });
    expect(created.status).toBe(201);
    const account = await body<Account>(created);
    expect(account).toMatchObject({
      login: "octocat",
      avatarUrl: "https://avatars.github.test/octocat",
      scopes: ["notifications", "repo"],
      intervalSec: 300,
      enabled: true,
      status: "ok",
      running: false,
    });
    expect(JSON.stringify(account)).not.toContain(VALID_TOKEN);
    const listed = await h.request("GET", "/api/accounts");
    expect(await listed.text()).not.toMatch(/ghp_|token/i);

    const duplicate = await h.request("POST", "/api/accounts", { token: VALID_TOKEN });
    expect(duplicate.status).toBe(409);
    expect((await body(duplicate)).error.code).toBe("account_exists");
    const badToken = await h.request("POST", "/api/accounts", {
      token: "ghp_unknown_token_000000000",
    });
    expect((await body(badToken)).error.code).toBe("github_token_invalid");
    h.github.users.set("github_pat_fine_grained_0000", { id: 5, login: "fine", scopes: "" });
    const fineGrained = await h.request("POST", "/api/accounts", {
      token: "github_pat_fine_grained_0000",
    });
    expect((await body(fineGrained)).error.code).toBe("github_token_missing_scope");
    expect(
      (await h.request("POST", "/api/accounts", { token: VALID_TOKEN, intervalSec: 30 })).status,
    ).toBe(400);

    const patched = await h.request("PATCH", `/api/accounts/${account.id}`, {
      intervalSec: 60,
      enabled: false,
    });
    expect(await body<Account>(patched)).toMatchObject({
      intervalSec: 60,
      enabled: false,
      nextRunAt: null,
    });
    h.github.users.set("ghp_someone_else_0000000000", {
      id: 9,
      login: "intruder",
      scopes: "notifications",
    });
    const mismatch = await h.request("PATCH", `/api/accounts/${account.id}`, {
      token: "ghp_someone_else_0000000000",
    });
    expect((await body(mismatch)).error.code).toBe("account_mismatch");
    expect((await h.request("PATCH", "/api/accounts/missing", { enabled: true })).status).toBe(404);
    await h.request("PATCH", `/api/accounts/${account.id}`, { enabled: true });

    // Rules
    expect((await h.request("POST", "/api/rules", ruleInput({ name: "" }))).status).toBe(400);
    const emptyGroup = ruleInput({ condition: { type: "group", op: "and", children: [] } });
    expect((await h.request("POST", "/api/rules", emptyGroup)).status).toBe(400);
    const ruleResponse = await h.request("POST", "/api/rules", ruleInput());
    expect(ruleResponse.status).toBe(201);
    const rule = await body<Rule>(ruleResponse);
    expect(rule).toMatchObject(ruleInput());
    expect(await body<Rule>(await h.request("GET", `/api/rules/${rule.id}`))).toEqual(rule);
    expect((await h.request("GET", "/api/rules/missing")).status).toBe(404);
    const renamed = await h.request(
      "PUT",
      `/api/rules/${rule.id}`,
      ruleInput({ name: "Renamed", priority: 1 }),
    );
    expect(await body<Rule>(renamed)).toMatchObject({ id: rule.id, name: "Renamed", priority: 1 });
    expect((await h.request("PUT", "/api/rules/missing", ruleInput())).status).toBe(404);
    expect(await body<Rule[]>(await h.request("GET", "/api/rules"))).toHaveLength(1);

    // Dry run, then a real run
    h.github.addNotification({ id: "1", repo: "acme/widgets", title: "Bump lodash" });
    h.github.addNotification({ id: "2", repo: "other/repo", title: "Unrelated" });
    const preview = await body(
      await h.request("POST", "/api/rules/dry-run", {
        accountScope: { type: "all" },
        condition: ruleInput().condition,
      }),
    );
    expect(preview.accounts[0]).toMatchObject({ login: "octocat", fetched: 2, error: null });
    expect(preview.accounts[0].matches.map((m: { threadId: string }) => m.threadId)).toEqual(["1"]);
    expect(h.github.done).toEqual([]);

    const ran = await h.request("POST", `/api/accounts/${account.id}/run`);
    expect(ran.status).toBe(200);
    expect(await body<RunLog>(ran)).toMatchObject({
      trigger: "manual",
      status: "success",
      fetched: 2,
      matched: 1,
      processed: 1,
    });
    expect(h.github.done).toEqual(["1"]);
    expect((await h.request("POST", "/api/accounts/missing/run")).status).toBe(404);

    const backlog = await h.request("POST", `/api/accounts/${account.id}/backlog`);
    expect(backlog.status).toBe(200);
    expect(await body<RunLog>(backlog)).toMatchObject({ trigger: "backlog", status: "success" });
    expect((await h.request("POST", "/api/accounts/missing/backlog")).status).toBe(404);

    // History and run logs
    const history = await body<Paginated<HistoryItem>>(
      await h.request("GET", "/api/history?q=LODASH&pageSize=5"),
    );
    expect(history).toMatchObject({ total: 1, page: 1, pageSize: 5 });
    expect(history.items[0]).toMatchObject({
      title: "Bump lodash",
      repo: "acme/widgets",
      ruleName: "Renamed",
      accountLogin: "octocat",
    });
    expect(
      (await body<Paginated<HistoryItem>>(await h.request("GET", "/api/history?q=nothing"))).total,
    ).toBe(0);
    expect(
      (
        await body<Paginated<HistoryItem>>(
          await h.request("GET", `/api/history?accountId=${account.id}&reason=subscribed`),
        )
      ).total,
    ).toBe(1);
    expect((await h.request("GET", "/api/history?pageSize=1000")).status).toBe(400);
    const runs = await body<Paginated<RunLog>>(await h.request("GET", "/api/runs?status=success"));
    expect(runs.items.map((run) => run.trigger).toSorted()).toEqual(["backlog", "manual"]);
    expect((await h.request("GET", "/api/runs?status=bogus")).status).toBe(400);

    // Dashboard
    const dashboard = await body<Dashboard>(await h.request("GET", "/api/dashboard?tzOffset=480"));
    expect(dashboard).toMatchObject({
      accounts: { total: 1, enabled: 1, unhealthy: 0 },
      rules: { total: 1, enabled: 1 },
      processed: { last24h: 1, last7d: 1, total: 1 },
    });
    expect(dashboard.daily).toHaveLength(14);
    expect(dashboard.daily.at(-1)).toEqual({ date: "2026-10-05", count: 1 });
    expect(dashboard.daily[0]).toEqual({ date: "2026-09-22", count: 0 });
    expect(dashboard.recentRuns).toHaveLength(2);

    // Settings
    expect(await body(await h.request("GET", "/api/settings"))).toEqual({ retentionDays: 30 });
    expect(await body(await h.request("PUT", "/api/settings", { retentionDays: 7 }))).toEqual({
      retentionDays: 7,
    });
    expect(await body(await h.request("GET", "/api/settings"))).toEqual({ retentionDays: 7 });
    expect((await h.request("PUT", "/api/settings", { retentionDays: -1 })).status).toBe(400);

    // Deleting keeps history
    expect((await h.request("DELETE", `/api/rules/${rule.id}`)).status).toBe(200);
    expect((await h.request("DELETE", `/api/rules/${rule.id}`)).status).toBe(404);
    expect((await h.request("DELETE", `/api/accounts/${account.id}`)).status).toBe(200);
    expect((await h.request("DELETE", `/api/accounts/${account.id}`)).status).toBe(404);
    expect((await body<Paginated<HistoryItem>>(await h.request("GET", "/api/history"))).total).toBe(
      1,
    );

    // Sign out
    expect((await h.request("POST", "/api/auth/logout")).status).toBe(200);
    expect(h.cookie()).toBeUndefined();
    expect((await h.request("GET", "/api/rules")).status).toBe(401);
  });

  it("keeps a burst of parallel guesses within the limit", async () => {
    const statuses = await Promise.all(
      Array.from({ length: 12 }, async () => {
        const wrong = { ...OWNER, password: "wrong-wrong" };
        return (await h.request("POST", "/api/auth/login", wrong)).status;
      }),
    );
    // Each request reads the count after its own increment, so on a networked database a
    // burst may see its neighbours' attempts too. It errs towards refusing, never allowing.
    expect(statuses.filter((status) => status === 401).length).toBeLessThanOrEqual(5);
    expect(statuses.every((status) => status === 401 || status === 429)).toBe(true);
  });
});

describe("authentication", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
  });
  afterEach(async () => {
    await h.cleanup();
  });

  it("stores an argon2id hash and sets a hardened cookie", async () => {
    await h.cleanup();
    h = await createHarness("sqlite", { hasher: argon2Hasher });
    const response = await h.request("POST", "/api/setup", OWNER);
    const cookie = response.headers.getSetCookie()[0]!;
    expect(cookie).toMatch(/^mewte_session=[\w-]{43};/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toContain("Secure");

    const { getOwner } = await import("@mewte/db");
    const owner = await getOwner(h.deps.conn);
    expect(owner?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(owner?.passwordHash).not.toContain(OWNER.password);

    h.signOutLocally();
    expect((await h.request("POST", "/api/auth/login", OWNER)).status).toBe(200);
  });

  it("marks the cookie Secure behind an HTTPS proxy or when forced", async () => {
    await h.cleanup();
    h = await createHarness("sqlite", { trustProxy: true });
    const proxied = await h.request("POST", "/api/setup", OWNER, { "x-forwarded-proto": "https" });
    expect(proxied.headers.getSetCookie()[0]).toContain("Secure");

    await h.cleanup();
    h = await createHarness("sqlite", { cookieSecure: "true" });
    const forced = await h.request("POST", "/api/setup", OWNER);
    expect(forced.headers.getSetCookie()[0]).toContain("Secure");
  });

  it("requires the setup token when one is configured", async () => {
    await h.cleanup();
    h = await createHarness("sqlite", { setupToken: "open-sesame" });
    expect((await body<Status>(await h.request("GET", "/api/status"))).setupTokenRequired).toBe(
      true,
    );
    for (const attempt of [OWNER, { ...OWNER, setupToken: "wrong" }]) {
      const response = await h.request("POST", "/api/setup", attempt);
      expect(response.status).toBe(403);
      expect((await body(response)).error.code).toBe("setup_token_invalid");
    }
    expect(
      (await h.request("POST", "/api/setup", { ...OWNER, setupToken: "open-sesame" })).status,
    ).toBe(200);
  });

  it("validates the setup input", async () => {
    expect(
      (await h.request("POST", "/api/setup", { username: "admin", password: "short" })).status,
    ).toBe(400);
    expect(
      (await h.request("POST", "/api/setup", { username: "bad name!", password: OWNER.password }))
        .status,
    ).toBe(400);
    const response = await h.request("POST", "/api/setup", {});
    expect((await body(response)).error.code).toBe("validation_error");
  });

  it("rejects wrong credentials without saying which part was wrong", async () => {
    await setUp(h);
    h.signOutLocally();
    const wrongPassword = await h.request("POST", "/api/auth/login", {
      ...OWNER,
      password: "nope-nope",
    });
    const wrongUser = await h.request("POST", "/api/auth/login", { ...OWNER, username: "root" });
    expect(wrongPassword.status).toBe(401);
    expect(await body(wrongPassword)).toEqual(await body(wrongUser));
    expect(h.cookie()).toBeUndefined();
  });

  const WRONG = { ...OWNER, password: "wrong-wrong" };
  const wrongLogin = (headers: Record<string, string> = {}) =>
    h.request("POST", "/api/auth/login", WRONG, headers);

  it("locks a client out after repeated failures, then recovers", async () => {
    await setUp(h);
    h.signOutLocally();
    for (let i = 0; i < 5; i++) expect((await wrongLogin()).status).toBe(401);

    const locked = await h.request("POST", "/api/auth/login", OWNER);
    expect(locked.status).toBe(429);
    expect((await body(locked)).error.code).toBe("rate_limited");
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(0);

    h.clock.advance(15 * 60 * 1000);
    expect((await h.request("POST", "/api/auth/login", OWNER)).status).toBe(200);
  });

  it("counts each browser on an address separately", async () => {
    await setUp(h);
    h.signOutLocally();
    for (let i = 0; i < 5; i++) await wrongLogin({ "user-agent": "guesser/1.0" });
    expect((await wrongLogin({ "user-agent": "guesser/1.0" })).status).toBe(429);

    // Someone else behind the same address is not locked out with them.
    const other = { "user-agent": "Mozilla/5.0", "accept-language": "en" };
    expect((await h.request("POST", "/api/auth/login", OWNER, other)).status).toBe(200);
  });

  it("limits an address that keeps changing its User-Agent", async () => {
    await setUp(h);
    h.signOutLocally();
    for (let i = 0; i < 20; i++) {
      expect((await wrongLogin({ "user-agent": `rotating/${i}` })).status).toBe(401);
    }
    expect(
      (await h.request("POST", "/api/auth/login", OWNER, { "user-agent": "fresh/1.0" })).status,
    ).toBe(429);
  });

  it("caps guesses at one account from many addresses", async () => {
    await h.cleanup();
    h = await createHarness("sqlite", { trustProxy: true });
    await setUp(h);
    h.signOutLocally();
    for (let i = 0; i < 50; i++) {
      expect((await wrongLogin({ "x-forwarded-for": `203.0.113.${i}` })).status).toBe(401);
    }
    expect(
      (await h.request("POST", "/api/auth/login", OWNER, { "x-forwarded-for": "192.0.2.1" }))
        .status,
    ).toBe(429);
  });

  it("does not let a locked-out client use up anyone else's attempts", async () => {
    await setUp(h);
    h.signOutLocally();
    const bot = { "user-agent": "bot/1" };
    for (let i = 0; i < 5; i++) expect((await wrongLogin(bot)).status).toBe(401);
    // Hammering on after the lockout is refused at once and counts for nothing.
    for (let i = 0; i < 60; i++) expect((await wrongLogin(bot)).status).toBe(429);

    const owner = { "user-agent": "Mozilla/5.0" };
    expect((await h.request("POST", "/api/auth/login", OWNER, owner)).status).toBe(200);
  });

  it("trusts X-Forwarded-For only when told to", async () => {
    await setUp(h);
    h.signOutLocally();
    for (let i = 0; i < 20; i++) {
      await h.request(
        "POST",
        "/api/auth/login",
        { username: `guess-${i}`, password: "wrong-wrong" },
        { "x-forwarded-for": `10.0.0.${i}`, "user-agent": `rotating/${i}` },
      );
    }
    // Spoofed headers did not spread the attempts over many buckets.
    expect(
      (
        await h.request("POST", "/api/auth/login", OWNER, {
          "x-forwarded-for": "10.9.9.9",
          "user-agent": "fresh/1.0",
        })
      ).status,
    ).toBe(429);
  });

  it("holds back the answer to a wrong guess, longer each time", async () => {
    await setUp(h);
    h.signOutLocally();
    expect(h.sleeps).toEqual([]);

    await wrongLogin();
    await wrongLogin();
    await h.request("POST", "/api/auth/login", { username: "nobody", password: OWNER.password });
    expect(h.sleeps).toHaveLength(3);
    expect(h.sleeps[0]).toBeGreaterThanOrEqual(2000);
    expect(h.sleeps[0]).toBeLessThan(3000);
    expect(h.sleeps[1]).toBeGreaterThanOrEqual(3000);
    expect(h.sleeps[1]).toBeLessThan(4000);
    expect(h.sleeps[2]).toBeGreaterThanOrEqual(4000);

    // A correct sign-in is answered at once, and so is a locked-out one.
    expect((await h.request("POST", "/api/auth/login", OWNER)).status).toBe(200);
    expect(h.sleeps).toHaveLength(3);
    h.signOutLocally();
    for (let i = 0; i < 5; i++) await wrongLogin();
    const waits = h.sleeps.length;
    expect((await wrongLogin()).status).toBe(429);
    expect(h.sleeps).toHaveLength(waits);

    expect(failureDelayMs(1, () => 0)).toBe(2000);
    expect(failureDelayMs(1, () => 0.999)).toBe(2999);
    expect(failureDelayMs(100, () => 0)).toBe(8000);
  });

  it("counts a wrong guess before it starts waiting", async () => {
    await setUp(h);
    h.signOutLocally();
    const { getAttempts } = await import("@mewte/db");
    const seen: number[] = [];
    h.deps.sleep = async () => {
      const bucket = `user:${OWNER.username}`;
      seen.push((await getAttempts(h.deps.conn, bucket, h.clock.now, LOGIN_WINDOW_MS)).attempts);
    };
    await wrongLogin();
    await wrongLogin();
    expect(seen).toEqual([1, 2]);
  });

  it("does not let a burst of parallel guesses past the limit", async () => {
    await setUp(h);
    h.signOutLocally();
    const statuses = await Promise.all(
      Array.from({ length: 12 }, async () => (await wrongLogin()).status),
    );
    expect(statuses.filter((status) => status === 401)).toHaveLength(5);
    expect(statuses.filter((status) => status === 429)).toHaveLength(7);
  });

  it("forgets a client's failures once it signs in", async () => {
    await setUp(h);
    h.signOutLocally();
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 4; i++) expect((await wrongLogin()).status).toBe(401);
      expect((await h.request("POST", "/api/auth/login", OWNER)).status).toBe(200);
      h.signOutLocally();
    }
  });

  it("delays and limits wrong setup tokens and wrong current passwords", async () => {
    await h.cleanup();
    h = await createHarness("sqlite", { setupToken: "open-sesame" });
    await h.request("POST", "/api/setup", { ...OWNER, setupToken: "wrong" });
    expect(h.sleeps).toHaveLength(1);
    expect(
      (await h.request("POST", "/api/setup", { ...OWNER, setupToken: "open-sesame" })).status,
    ).toBe(200);
    expect(h.sleeps).toHaveLength(1);

    for (let i = 0; i < 5; i++) {
      const response = await h.request("POST", "/api/auth/password", {
        currentPassword: "wrong-wrong",
        newPassword: "another long password",
      });
      expect(response.status).toBe(403);
    }
    expect(h.sleeps).toHaveLength(6);
    const locked = await h.request("POST", "/api/auth/password", {
      currentPassword: OWNER.password,
      newPassword: "another long password",
    });
    expect(locked.status).toBe(429);
  });

  it("expires sessions and slides the expiry while in use", async () => {
    await setUp(h);
    h.clock.advance(20 * 24 * 60 * 60 * 1000);
    expect((await h.request("GET", "/api/rules")).status).toBe(200);
    h.clock.advance(20 * 24 * 60 * 60 * 1000);
    expect((await h.request("GET", "/api/rules")).status).toBe(200);
    h.clock.advance(31 * 24 * 60 * 60 * 1000);
    expect((await h.request("GET", "/api/rules")).status).toBe(401);
  });

  it("changes the password and signs out other sessions", async () => {
    await setUp(h);
    const first = h.cookie();
    h.signOutLocally();
    await h.request("POST", "/api/auth/login", OWNER);

    const wrong = await h.request("POST", "/api/auth/password", {
      currentPassword: "nope-nope",
      newPassword: "a brand new password",
    });
    expect(wrong.status).toBe(403);
    expect((await body(wrong)).error.code).toBe("wrong_password");
    expect(
      (
        await h.request("POST", "/api/auth/password", {
          currentPassword: OWNER.password,
          newPassword: "short",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await h.request("POST", "/api/auth/password", {
          currentPassword: OWNER.password,
          newPassword: "a brand new password",
        })
      ).status,
    ).toBe(200);

    expect((await h.request("GET", "/api/rules")).status).toBe(200);
    const stale = await h.app.request("http://mewte.test/api/rules", {
      headers: { cookie: `mewte_session=${first}` },
    });
    expect(stale.status).toBe(401);

    h.signOutLocally();
    expect((await h.request("POST", "/api/auth/login", OWNER)).status).toBe(401);
    expect(
      (await h.request("POST", "/api/auth/login", { ...OWNER, password: "a brand new password" }))
        .status,
    ).toBe(200);
  });

  it("refuses cross-site writes", async () => {
    await setUp(h);
    const foreign = await h.request("POST", "/api/auth/logout", undefined, {
      origin: "https://evil.example",
    });
    expect(foreign.status).toBe(403);
    const crossSite = await h.request("POST", "/api/auth/logout", undefined, {
      "sec-fetch-site": "cross-site",
    });
    expect(crossSite.status).toBe(403);
    const sameOrigin = await h.request(
      "PUT",
      "/api/settings",
      { retentionDays: 5 },
      { origin: "http://mewte.test", host: "mewte.test" },
    );
    expect(sameOrigin.status).toBe(200);
    expect(
      (await h.request("GET", "/api/rules", undefined, { origin: "https://evil.example" })).status,
    ).toBe(200);
  });

  it("answers unknown API paths and bad JSON in the error shape", async () => {
    await setUp(h);
    const missing = await h.request("GET", "/api/nope");
    expect(missing.status).toBe(404);
    expect((await body(missing)).error.code).toBe("not_found");
    const malformed = await h.app.request("http://mewte.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect(malformed.status).toBe(400);
  });
});

describe("two-factor authentication", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
    await setUp(h);
  });
  afterEach(async () => {
    await h.cleanup();
  });

  async function enable(): Promise<{ secret: string; recoveryCodes: string[] }> {
    const { secret } = await body(await h.request("POST", "/api/auth/totp/setup"));
    const enabled = await h.request("POST", "/api/auth/totp/enable", {
      code: currentTotp(secret, h.clock.now),
    });
    expect(enabled.status).toBe(200);
    return { secret, recoveryCodes: (await body(enabled)).recoveryCodes };
  }

  it("is off by default and stays off until a code confirms the secret", async () => {
    expect(await body(await h.request("GET", "/api/auth/totp"))).toEqual({
      enabled: false,
      recoveryCodesLeft: 0,
    });
    expect((await h.request("POST", "/api/auth/totp/enable", { code: "123456" })).status).toBe(409);

    const setup = await body(await h.request("POST", "/api/auth/totp/setup"));
    expect(setup.otpauthUrl).toContain("otpauth://totp/Mewte:admin");
    const wrong = await h.request("POST", "/api/auth/totp/enable", { code: "000000" });
    expect((await body(wrong)).error.code).toBe("totp_invalid");
    expect((await body<Status>(await h.request("GET", "/api/status"))).user?.totpEnabled).toBe(
      false,
    );

    // Still able to sign in with the password alone.
    h.signOutLocally();
    expect((await h.request("POST", "/api/auth/login", OWNER)).status).toBe(200);
  });

  it("requires a code at sign-in once enabled and rejects replays", async () => {
    const { secret, recoveryCodes } = await enable();
    expect(recoveryCodes).toHaveLength(10);
    expect(await body(await h.request("GET", "/api/auth/totp"))).toEqual({
      enabled: true,
      recoveryCodesLeft: 10,
    });
    expect((await h.request("POST", "/api/auth/totp/setup")).status).toBe(409);

    h.signOutLocally();
    const noCode = await h.request("POST", "/api/auth/login", OWNER);
    expect(noCode.status).toBe(401);
    expect((await body(noCode)).error.code).toBe("totp_required");
    const badCode = await h.request("POST", "/api/auth/login", { ...OWNER, code: "000000" });
    expect((await body(badCode)).error.code).toBe("totp_invalid");

    // The code that enabled TOTP belongs to a step that is already spent.
    const replay = await h.request("POST", "/api/auth/login", {
      ...OWNER,
      code: currentTotp(secret, h.clock.now),
    });
    expect(replay.status).toBe(401);

    h.clock.advance(30_000);
    const code = currentTotp(secret, h.clock.now);
    expect((await h.request("POST", "/api/auth/login", { ...OWNER, code })).status).toBe(200);
    h.signOutLocally();
    expect((await h.request("POST", "/api/auth/login", { ...OWNER, code })).status).toBe(401);
  });

  it("does not count the password step of a two-step sign-in as a failure", async () => {
    await enable();
    h.signOutLocally();
    for (let i = 0; i < 8; i++) {
      const response = await h.request("POST", "/api/auth/login", OWNER);
      expect((await body(response)).error.code).toBe("totp_required");
    }
    expect(h.sleeps).toEqual([]);

    // Wrong codes, however, are guesses like any other.
    for (let i = 0; i < 5; i++) {
      const response = await h.request("POST", "/api/auth/login", { ...OWNER, code: "000000" });
      expect((await body(response)).error.code).toBe("totp_invalid");
    }
    expect(h.sleeps).toHaveLength(5);
    expect((await h.request("POST", "/api/auth/login", OWNER)).status).toBe(429);
  });

  it("accepts each recovery code once", async () => {
    const { recoveryCodes } = await enable();
    h.signOutLocally();
    const code = recoveryCodes[0]!.toUpperCase();
    expect((await h.request("POST", "/api/auth/login", { ...OWNER, code })).status).toBe(200);
    expect((await body(await h.request("GET", "/api/auth/totp"))).recoveryCodesLeft).toBe(9);
    h.signOutLocally();
    expect((await h.request("POST", "/api/auth/login", { ...OWNER, code })).status).toBe(401);
  });

  it("regenerates recovery codes and can be turned off with the password", async () => {
    const { recoveryCodes } = await enable();
    expect(
      (await h.request("POST", "/api/auth/totp/recovery-codes", { password: "wrong-wrong" }))
        .status,
    ).toBe(403);
    const fresh = await body(await h.request("POST", "/api/auth/totp/recovery-codes", OWNER));
    expect(fresh.recoveryCodes).toHaveLength(10);
    expect(fresh.recoveryCodes).not.toContain(recoveryCodes[0]);

    expect(
      (await h.request("POST", "/api/auth/totp/disable", { password: "wrong-wrong" })).status,
    ).toBe(403);
    expect((await h.request("POST", "/api/auth/totp/disable", OWNER)).status).toBe(200);
    expect(await body(await h.request("GET", "/api/auth/totp"))).toEqual({
      enabled: false,
      recoveryCodesLeft: 0,
    });
    expect((await h.request("POST", "/api/auth/totp/recovery-codes", OWNER)).status).toBe(409);

    h.signOutLocally();
    expect((await h.request("POST", "/api/auth/login", OWNER)).status).toBe(200);
  });
});

describe("OpenAPI document", () => {
  it("describes every endpoint in English with shared components", async () => {
    const h = await createHarness();
    try {
      const response = await h.request("GET", "/api/openapi.json");
      expect(response.status).toBe(200);
      const doc = await body(response);
      expect(doc.openapi).toBe("3.1.0");
      expect(doc.info.title).toBe("Mewte API");
      expect(Object.keys(doc.paths).toSorted()).toEqual(
        [
          "/api/accounts",
          "/api/accounts/{id}",
          "/api/accounts/{id}/backlog",
          "/api/accounts/{id}/run",
          "/api/auth/login",
          "/api/auth/logout",
          "/api/auth/password",
          "/api/auth/totp",
          "/api/auth/totp/disable",
          "/api/auth/totp/enable",
          "/api/auth/totp/recovery-codes",
          "/api/auth/totp/setup",
          "/api/dashboard",
          "/api/history",
          "/api/rules",
          "/api/rules/dry-run",
          "/api/rules/source",
          "/api/rules/{id}",
          "/api/runs",
          "/api/settings",
          "/api/setup",
          "/api/status",
        ].toSorted(),
      );
      for (const [path, methods] of Object.entries<
        Record<string, { summary?: string; tags?: string[] }>
      >(doc.paths)) {
        for (const [method, operation] of Object.entries(methods)) {
          expect(operation.summary, `${method} ${path} summary`).toBeTruthy();
          expect(operation.tags?.length, `${method} ${path} tags`).toBe(1);
        }
      }
      expect(Object.keys(doc.components.schemas)).toEqual(
        expect.arrayContaining(["Account", "Rule", "RuleInput", "RunLog", "Error", "Status"]),
      );
      expect(doc.components.securitySchemes.sessionCookie).toMatchObject({
        type: "apiKey",
        in: "cookie",
      });
      // Documentation must be English only.
      expect(JSON.stringify(doc)).not.toMatch(/[㐀-鿿぀-ヿ가-힯Ѐ-ӿ]/);

      const docs = await h.request("GET", "/api/docs");
      expect(docs.status).toBe(200);
      expect(await docs.text()).toContain("/api/openapi.json");
    } finally {
      await h.cleanup();
    }
  });
});

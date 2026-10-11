import type { HistoryItem, RuleInput, RunLog } from "@mewte/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseDatabaseUrl, transaction } from "./client";
import { migrateToLatest } from "./migrations";
import * as repo from "./index";
import { type TestDatabase, createTestDb, testDialects } from "./testing";
import { escapeLike, upsert } from "./upsert";

describe("parseDatabaseUrl", () => {
  it("recognises SQLite paths", () => {
    expect(parseDatabaseUrl(":memory:")).toEqual({ kind: "sqlite", target: ":memory:" });
    expect(parseDatabaseUrl("sqlite::memory:")).toEqual({ kind: "sqlite", target: ":memory:" });
    expect(parseDatabaseUrl("sqlite:///data/mewte.db")).toEqual({
      kind: "sqlite",
      target: "/data/mewte.db",
    });
    expect(parseDatabaseUrl("file:/tmp/x.db")).toEqual({ kind: "sqlite", target: "/tmp/x.db" });
    expect(parseDatabaseUrl("sqlite://./data/mewte.db").target.endsWith("/data/mewte.db")).toBe(
      true,
    );
  });

  it("recognises PostgreSQL and MySQL", () => {
    expect(parseDatabaseUrl("postgres://u:p@h/db").kind).toBe("postgres");
    expect(parseDatabaseUrl("postgresql://u:p@h/db").kind).toBe("postgres");
    expect(parseDatabaseUrl(" mysql://u:p@h/db ").kind).toBe("mysql");
  });

  it("rejects anything else without echoing the value", () => {
    expect(() => parseDatabaseUrl("mongodb://user:secret@h/db")).toThrow(
      /Unsupported DATABASE_URL/,
    );
    expect(() => parseDatabaseUrl("mongodb://user:secret@h/db")).not.toThrow(/secret/);
    expect(() => parseDatabaseUrl("sqlite:")).toThrow();
  });
});

describe("escapeLike", () => {
  it("escapes wildcards and the escape character", () => {
    expect(escapeLike("50%_off!")).toBe("50!%!_off!!");
  });
});

const account = (id: string, githubId: number, now: number): repo.NewAccount => ({
  id,
  githubId,
  login: `user-${githubId}`,
  avatarUrl: "https://example.test/a.png",
  tokenEnc: "enc",
  scopes: "notifications",
  intervalSec: 300,
  enabled: 1,
  status: "ok",
  lastError: null,
  lastModified: null,
  baselineAt: now,
  pollIntervalSec: null,
  nextRunAt: now,
  lastRunAt: null,
  lockUntil: null,
  lockOwner: null,
  createdAt: now,
  updatedAt: now,
});

const historyItem = (id: string, patch: Partial<HistoryItem> = {}): HistoryItem => ({
  id,
  accountId: "acc-1",
  accountLogin: "octocat",
  threadId: "1",
  title: "Bump lodash",
  repo: "acme/widgets",
  subjectType: "PullRequest",
  reason: "subscribed",
  url: "https://github.com/acme/widgets/pull/1",
  ruleId: "rule-1",
  ruleName: "Bots",
  processedAt: 1_000,
  ...patch,
});

describe.each(testDialects())("repositories on %s", (kind) => {
  let conn: TestDatabase;

  beforeAll(async () => {
    conn = await createTestDb(kind);
  });

  afterAll(async () => {
    await conn.cleanup();
  });

  it("migrations are idempotent", async () => {
    expect(await migrateToLatest(conn)).toEqual([]);
  });

  it("stores large integers as numbers", async () => {
    const now = Date.now();
    await repo.setSetting(conn, "probe", "1");
    await repo.insertAccount(conn, account("big", 9_007_199_254, now));
    const row = await repo.getAccount(conn, "big");
    expect(row?.githubId).toBe(9_007_199_254);
    expect(row?.nextRunAt).toBe(now);
    expect(typeof row?.createdAt).toBe("number");
    await repo.deleteAccount(conn, "big");
  });

  it("upsert inserts, then overwrites", async () => {
    await upsert(conn, "settings", { name: "k", value: "1" }, ["name"]);
    await upsert(conn, "settings", { name: "k", value: "2" }, ["name"]);
    expect(await repo.getSetting(conn, "k")).toBe("2");
    expect(await repo.getSetting(conn, "missing")).toBeUndefined();
  });

  it("transactions roll back on error", async () => {
    await expect(
      transaction(conn, async (trx) => {
        await repo.setSetting(trx, "rolled-back", "x");
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await repo.getSetting(conn, "rolled-back")).toBeUndefined();
  });

  it("allows exactly one owner", async () => {
    expect(await repo.getOwner(conn)).toBeUndefined();
    expect(await repo.createOwner(conn, { username: "admin", passwordHash: "h1", now: 1 })).toBe(
      true,
    );
    expect(await repo.createOwner(conn, { username: "other", passwordHash: "h2", now: 2 })).toBe(
      false,
    );
    expect((await repo.getOwner(conn))?.username).toBe("admin");
    await repo.updatePasswordHash(conn, "h3", 5);
    expect(await repo.getOwner(conn)).toMatchObject({ passwordHash: "h3", updatedAt: 5 });
  });

  it("sessions expire and can be revoked", async () => {
    const session = { id: "s1", userId: "owner", createdAt: 1, lastSeenAt: 1, expiresAt: 100 };
    await repo.createSession(conn, session);
    await repo.createSession(conn, { ...session, id: "s2" });
    await repo.createSession(conn, { ...session, id: "s3", expiresAt: 10 });
    expect(await repo.getSession(conn, "s1", 50)).toMatchObject({ id: "s1" });
    expect(await repo.getSession(conn, "s1", 100)).toBeUndefined();
    await repo.touchSession(conn, "s1", 60, 200);
    expect(await repo.getSession(conn, "s1", 150)).toMatchObject({
      lastSeenAt: 60,
      expiresAt: 200,
    });
    await repo.deleteExpiredSessions(conn, 20);
    expect(await repo.getSession(conn, "s3", 5)).toBeUndefined();
    await repo.deleteUserSessions(conn, "owner", "s1");
    expect(await repo.getSession(conn, "s2", 50)).toBeUndefined();
    expect(await repo.getSession(conn, "s1", 150)).toBeDefined();
    await repo.deleteSession(conn, "s1");
    expect(await repo.getSession(conn, "s1", 150)).toBeUndefined();
  });

  it("TOTP stays pending until enabled and rejects replayed steps", async () => {
    await repo.savePendingTotp(conn, { userId: "owner", secretEnc: "one", now: 1 });
    await repo.savePendingTotp(conn, { userId: "owner", secretEnc: "two", now: 2 });
    expect(await repo.getTotp(conn, "owner")).toMatchObject({ secretEnc: "two", enabled: 0 });

    await repo.enableTotp(conn, {
      userId: "owner",
      step: 10,
      recoveryCodes: [
        { id: "c1", codeHash: "hash-1" },
        { id: "c2", codeHash: "hash-2" },
      ],
    });
    expect(await repo.getTotp(conn, "owner")).toMatchObject({ enabled: 1, lastUsedStep: 10 });
    expect(await repo.claimTotpStep(conn, "owner", 10)).toBe(false);
    expect(await repo.claimTotpStep(conn, "owner", 9)).toBe(false);
    expect(await repo.claimTotpStep(conn, "owner", 11)).toBe(true);

    expect(await repo.countUnusedRecoveryCodes(conn, "owner")).toBe(2);
    expect(await repo.useRecoveryCode(conn, { userId: "owner", codeHash: "hash-1", now: 5 })).toBe(
      true,
    );
    expect(await repo.useRecoveryCode(conn, { userId: "owner", codeHash: "hash-1", now: 6 })).toBe(
      false,
    );
    expect(await repo.useRecoveryCode(conn, { userId: "owner", codeHash: "nope", now: 6 })).toBe(
      false,
    );
    expect(await repo.countUnusedRecoveryCodes(conn, "owner")).toBe(1);

    await repo.replaceRecoveryCodes(conn, "owner", [{ id: "c3", codeHash: "hash-3" }]);
    expect(await repo.countUnusedRecoveryCodes(conn, "owner")).toBe(1);
    await repo.replaceRecoveryCodes(conn, "owner", []);
    expect(await repo.countUnusedRecoveryCodes(conn, "owner")).toBe(0);

    await repo.deleteTotp(conn, "owner");
    expect(await repo.getTotp(conn, "owner")).toBeUndefined();
  });

  it("counts login attempts per window", async () => {
    const windowMs = 1_000;
    expect((await repo.getAttempts(conn, "ip:1", 0, windowMs)).attempts).toBe(0);
    expect(await repo.recordAttempt(conn, "ip:1", 0, windowMs)).toEqual({
      attempts: 1,
      resetAt: 1_000,
    });
    expect((await repo.recordAttempt(conn, "ip:1", 500, windowMs)).attempts).toBe(2);
    expect(await repo.getAttempts(conn, "ip:1", 900, windowMs)).toEqual({
      attempts: 2,
      resetAt: 1_000,
    });
    expect((await repo.getAttempts(conn, "ip:1", 1_000, windowMs)).attempts).toBe(0);
    expect((await repo.recordAttempt(conn, "ip:1", 1_500, windowMs)).attempts).toBe(1);
    expect((await repo.getAttempts(conn, "ip:1", 1_600, windowMs)).resetAt).toBe(2_500);
    await repo.recordAttempt(conn, "ip:1", 1_600, windowMs);
    await repo.refundAttempt(conn, "ip:1");
    expect((await repo.getAttempts(conn, "ip:1", 1_600, windowMs)).attempts).toBe(1);
    await repo.refundAttempt(conn, "ip:1");
    await repo.refundAttempt(conn, "ip:1");
    expect((await repo.getAttempts(conn, "ip:1", 1_600, windowMs)).attempts).toBe(0);
    await repo.clearAttempts(conn, "ip:1");
    expect((await repo.getAttempts(conn, "ip:1", 1_600, windowMs)).attempts).toBe(0);

    // Attempts made at the same moment are all counted, including the very first ones.
    const burst = await Promise.all(
      Array.from({ length: 12 }, () => repo.recordAttempt(conn, "ip:burst", 2_000, windowMs)),
    );
    expect(Math.max(...burst.map((window) => window.attempts))).toBe(12);
    expect((await repo.getAttempts(conn, "ip:burst", 2_000, windowMs)).attempts).toBe(12);

    await repo.recordAttempt(conn, "ip:old", 0, windowMs);
    await repo.recordAttempt(conn, "ip:new", 5_000, windowMs);
    await repo.deleteExpiredAttempts(conn, 5_500, windowMs);
    expect((await repo.getAttempts(conn, "ip:new", 5_500, windowMs)).attempts).toBe(1);
  });

  it("manages accounts, due selection and leases", async () => {
    await repo.insertAccount(conn, account("acc-1", 1, 100));
    await repo.insertAccount(conn, account("acc-2", 2, 500));
    await repo.insertAccount(conn, { ...account("acc-3", 3, 100), enabled: 0 });
    await repo.insertAccount(conn, { ...account("acc-4", 4, 100), status: "unauthorized" });
    await expect(repo.insertAccount(conn, account("acc-dup", 1, 100))).rejects.toThrow();

    expect((await repo.listAccounts(conn)).map((a) => a.id)).toEqual([
      "acc-1",
      "acc-3",
      "acc-4",
      "acc-2",
    ]);
    expect((await repo.getAccountByGithubId(conn, 2))?.id).toBe("acc-2");
    expect((await repo.listDueAccounts(conn, 200)).map((a) => a.id)).toEqual(["acc-1"]);
    expect((await repo.listDueAccounts(conn, 500)).map((a) => a.id)).toEqual(["acc-1", "acc-2"]);

    const lease = { id: "acc-1", owner: "a", now: 1_000, ttlMs: 100 };
    expect(await repo.acquireLease(conn, lease)).toBe(true);
    expect(await repo.acquireLease(conn, { ...lease, owner: "b", now: 1_050 })).toBe(false);
    expect(await repo.renewLease(conn, { ...lease, owner: "b", now: 1_050 })).toBe(false);
    expect(await repo.renewLease(conn, { ...lease, now: 1_050 })).toBe(true);
    expect(await repo.acquireLease(conn, { ...lease, owner: "b", now: 1_120 })).toBe(false);
    expect(await repo.acquireLease(conn, { ...lease, owner: "b", now: 1_150 })).toBe(true);
    await repo.releaseLease(conn, "acc-1", "a");
    expect((await repo.getAccount(conn, "acc-1"))?.lockOwner).toBe("b");
    await repo.releaseLease(conn, "acc-1", "b");
    expect(await repo.getAccount(conn, "acc-1")).toMatchObject({
      lockOwner: null,
      lockUntil: null,
    });
    expect(await repo.acquireLease(conn, { ...lease, id: "missing" })).toBe(false);

    const racers = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        repo.acquireLease(conn, { id: "acc-2", owner: `racer-${i}`, now: 2_000, ttlMs: 1_000 }),
      ),
    );
    expect(racers.filter(Boolean)).toHaveLength(1);

    await repo.updateAccount(conn, "acc-1", { lastModified: "Mon, 01 Jan 2026 00:00:00 GMT" });
    await repo.updateAccount(conn, "acc-1", {});
    await repo.resetPollMarkers(conn);
    expect((await repo.getAccount(conn, "acc-1"))?.lastModified).toBeNull();

    await repo.deleteAccount(conn, "acc-4");
    expect(await repo.getAccount(conn, "acc-4")).toBeUndefined();
  });

  it("stores rules with their JSON payloads", async () => {
    const input: RuleInput = {
      name: "Merged dependency bumps",
      enabled: true,
      priority: 10,
      accountScope: { type: "accounts", accountIds: ["acc-1"] },
      condition: {
        type: "group",
        op: "and",
        children: [
          { type: "leaf", field: "title", operator: "regex", value: "^chore\\(deps\\)" },
          { type: "leaf", field: "state", operator: "in", value: ["merged"] },
        ],
      },
      action: "mark_done",
    };
    const created = await repo.insertRule(conn, "rule-1", input, 10);
    expect(created).toMatchObject({ ...input, id: "rule-1", createdAt: 10, updatedAt: 10 });
    await repo.insertRule(
      conn,
      "rule-0",
      { ...input, name: "First", priority: 1, enabled: false },
      20,
    );

    expect((await repo.listRules(conn)).map((r) => r.id)).toEqual(["rule-0", "rule-1"]);
    expect(await repo.getRule(conn, "rule-1")).toEqual(created);
    expect((await repo.getRule(conn, "rule-0"))?.enabled).toBe(false);

    const updated = await repo.updateRule(
      conn,
      "rule-1",
      { ...input, name: "Renamed", priority: 0 },
      30,
    );
    expect(updated).toMatchObject({ name: "Renamed", priority: 0, createdAt: 10, updatedAt: 30 });
    expect(await repo.updateRule(conn, "missing", input, 30)).toBeUndefined();

    await repo.deleteRule(conn, "rule-0");
    expect(await repo.getRule(conn, "rule-0")).toBeUndefined();
  });

  it("filters, searches and paginates history", async () => {
    await repo.insertHistory(conn, []);
    await repo.insertHistory(conn, [
      historyItem("h1", { processedAt: 1_000 }),
      historyItem("h2", {
        processedAt: 2_000,
        title: "Fix 100% CPU_usage in parser",
        repo: "acme/Parser",
      }),
      historyItem("h3", {
        processedAt: 3_000,
        accountId: "acc-2",
        reason: "mention",
        subjectType: "Issue",
      }),
      historyItem("h4", {
        processedAt: 4_000,
        ruleId: null,
        ruleName: "Deleted rule",
        title: "中文标题 release",
      }),
    ]);
    const page = { page: 1, pageSize: 10 };
    const ids = async (filter: Partial<repo.HistoryFilter>) =>
      (await repo.queryHistory(conn, { ...page, ...filter })).items.map((i) => i.id);

    expect(await ids({})).toEqual(["h4", "h3", "h2", "h1"]);
    expect(await ids({ accountId: "acc-2" })).toEqual(["h3"]);
    expect(await ids({ ruleId: "rule-1" })).toEqual(["h3", "h2", "h1"]);
    expect(await ids({ subjectType: "Issue" })).toEqual(["h3"]);
    expect(await ids({ reason: "mention" })).toEqual(["h3"]);
    expect(await ids({ repo: "PARSER" })).toEqual(["h2"]);
    expect(await ids({ q: "bump LODASH" })).toEqual(["h3", "h1"]);
    expect(await ids({ q: "parser" })).toEqual(["h2"]);
    expect(await ids({ q: "100%" })).toEqual(["h2"]);
    expect(await ids({ q: "cpu_usage" })).toEqual(["h2"]);
    expect(await ids({ q: "cpuXusage" })).toEqual([]);
    expect(await ids({ q: "中文" })).toEqual(["h4"]);
    expect(await ids({ from: 2_000, to: 3_000 })).toEqual(["h3", "h2"]);

    const second = await repo.queryHistory(conn, { page: 2, pageSize: 3 });
    expect(second).toMatchObject({ total: 4, page: 2, pageSize: 3 });
    expect(second.items.map((i) => i.id)).toEqual(["h1"]);
    expect(second.items[0]).toEqual(historyItem("h1", { processedAt: 1_000 }));

    expect(await repo.countHistory(conn)).toBe(4);
    expect(await repo.countHistory(conn, 3_000)).toBe(2);
    expect(await repo.countHistoryBuckets(conn, { start: 1_000, size: 1_500, buckets: 3 })).toEqual(
      [2, 1, 1],
    );

    expect(await repo.deleteHistoryBefore(conn, 3_000)).toBe(2);
    expect(await repo.countHistory(conn)).toBe(2);
  });

  it("stores and filters run logs", async () => {
    const run = (id: string, patch: Partial<RunLog> = {}): RunLog => ({
      id,
      accountId: "acc-1",
      accountLogin: "octocat",
      trigger: "schedule",
      status: "success",
      fetched: 3,
      matched: 2,
      processed: 2,
      errors: [],
      startedAt: 1_000,
      finishedAt: 1_100,
      ...patch,
    });
    await repo.insertRunLog(conn, run("r1"));
    await repo.insertRunLog(
      conn,
      run("r2", { startedAt: 2_000, status: "error", errors: ["x".repeat(900)] }),
    );
    await repo.insertRunLog(
      conn,
      run("r3", {
        startedAt: 3_000,
        accountId: "acc-2",
        trigger: "manual",
        errors: Array(80).fill("e"),
      }),
    );

    const all = await repo.queryRunLogs(conn, { page: 1, pageSize: 2 });
    expect(all.total).toBe(3);
    expect(all.items.map((r) => r.id)).toEqual(["r3", "r2"]);
    expect(all.items[0]).toMatchObject({ trigger: "manual", accountId: "acc-2" });
    expect(all.items[0]?.errors).toHaveLength(50);
    expect(all.items[1]?.errors[0]).toHaveLength(500);

    const failed = await repo.queryRunLogs(conn, { page: 1, pageSize: 10, status: "error" });
    expect(failed.items.map((r) => r.id)).toEqual(["r2"]);
    const byAccount = await repo.queryRunLogs(conn, { page: 1, pageSize: 10, accountId: "acc-1" });
    expect(byAccount.items.map((r) => r.id)).toEqual(["r2", "r1"]);
    expect(byAccount.items[1]).toEqual(run("r1"));

    expect(await repo.deleteRunLogsBefore(conn, 2_500)).toBe(2);
  });

  it("caches payloads until they expire", async () => {
    await repo.setCached(conn, "k1", "one", 100);
    await repo.setCached(conn, "k1", "two", 200);
    expect(await repo.getCached(conn, "k1", 150)).toBe("two");
    expect(await repo.getCached(conn, "k1", 200)).toBeUndefined();
    await repo.setCached(conn, "k2", "x".repeat(20_000), 1_000);
    expect(await repo.getCached(conn, "k2", 500)).toHaveLength(20_000);
    await repo.deleteExpiredCache(conn, 300);
    expect(await repo.getCached(conn, "k1", 0)).toBeUndefined();
    expect(await repo.getCached(conn, "k2", 500)).toBeDefined();
  });
});

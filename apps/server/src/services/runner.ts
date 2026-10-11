import {
  type AccountPatch,
  type AccountRecord,
  acquireLease,
  getAccount,
  getCached,
  insertHistory,
  insertRunLog,
  listAccounts,
  listRules,
  releaseLease,
  renewLease,
  setCached,
  updateAccount,
} from "@mewte/db";
import {
  type AccountScope,
  type Condition,
  type DataNeed,
  type DryRunInput,
  type DryRunResult,
  type NotificationPreview,
  type Rule,
  type RunLog,
  type RunTrigger,
  evaluateCondition,
  requiredData,
  sortRules,
} from "@mewte/shared";
import type { Deps } from "../deps";
import {
  type GitHubClient,
  GitHubError,
  type GitHubNotification,
  type NotificationList,
  createGitHubClient,
} from "../github/client";
import { type Enricher, type EnrichmentCache, createEnricher } from "../github/enrich";
import { newId, sha256Hex } from "./crypto";

export const LEASE_TTL_MS = 10 * 60 * 1000;
const LEASE_RENEW_AFTER_MS = 2 * 60 * 1000;
const CACHE_TTL_MS = 30 * 60 * 1000;

/** Cheapest lookups first, so a rule can be decided before the expensive ones run. */
const LOAD_ORDER: DataNeed[] = ["subject", "actor", "reviews", "comments"];

export function scopeIncludes(scope: AccountScope, accountId: string): boolean {
  return scope.type === "all" || scope.accountIds.includes(accountId);
}

/** Enabled rules that apply to an account, in the order they are tried. */
export function rulesForAccount(rules: Rule[], accountId: string): Rule[] {
  return sortRules(
    rules.filter((rule) => rule.enabled && scopeIncludes(rule.accountScope, accountId)),
  );
}

/**
 * Decides a condition, fetching extra GitHub data only while the answer is still open.
 * A condition that stays undecided after everything is loaded does not match.
 */
export async function resolveCondition(condition: Condition, enricher: Enricher): Promise<boolean> {
  let result = evaluateCondition(condition, enricher.context);
  if (result !== null) return result;
  const needs = requiredData(condition);
  for (const need of LOAD_ORDER) {
    if (!needs.has(need)) continue;
    await enricher.load(need);
    result = evaluateCondition(condition, enricher.context);
    if (result !== null) return result;
  }
  return false;
}

/** The first rule, by priority, that matches. Later rules are not evaluated. */
export async function firstMatchingRule(
  rules: Rule[],
  enricher: Enricher,
): Promise<Rule | undefined> {
  for (const rule of rules) {
    if (await resolveCondition(rule.condition, enricher)) return rule;
  }
  return undefined;
}

/**
 * Lookup cache for one notification. The key carries the notification's `updated_at`, so
 * new activity on a thread always refetches while a quiet backlog stays cheap.
 */
function enrichmentCache(deps: Deps, accountId: string, updatedAt: string): EnrichmentCache {
  const key = (name: string) => sha256Hex(`${accountId}|${updatedAt}|${name}`);
  return {
    get: async (name) => getCached(deps.conn, await key(name), deps.now()),
    set: async (name, value) =>
      setCached(deps.conn, await key(name), value, deps.now() + CACHE_TTL_MS),
  };
}

function clientFor(deps: Deps, token: string): GitHubClient {
  return createGitHubClient({
    token,
    apiUrl: deps.config.githubApiUrl,
    fetch: deps.fetch,
    now: deps.now,
  });
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isFatal(error: unknown): boolean {
  return (
    error instanceof GitHubError && (error.kind === "unauthorized" || error.kind === "rate_limited")
  );
}

export type RunOutcome = { kind: "done"; run: RunLog } | { kind: "busy" } | { kind: "not_found" };

/**
 * Polls one account and marks matching notifications as done. The database lease keeps
 * a scheduled tick, a manual run and other instances from working the same account.
 */
export async function runAccount(
  deps: Deps,
  accountId: string,
  trigger: RunTrigger,
): Promise<RunOutcome> {
  const lease = { id: accountId, owner: deps.instanceId, ttlMs: LEASE_TTL_MS };
  if (!(await getAccount(deps.conn, accountId))) return { kind: "not_found" };
  if (!(await acquireLease(deps.conn, { ...lease, now: deps.now() }))) return { kind: "busy" };

  try {
    // Re-read under the lease: another instance may have just finished this account.
    const account = await getAccount(deps.conn, accountId);
    if (!account) return { kind: "not_found" };
    if (trigger === "schedule" && (!account.enabled || account.nextRunAt > deps.now())) {
      return { kind: "busy" };
    }
    return { kind: "done", run: await execute(deps, account, trigger) };
  } finally {
    await releaseLease(deps.conn, accountId, deps.instanceId);
  }
}

async function execute(deps: Deps, account: AccountRecord, trigger: RunTrigger): Promise<RunLog> {
  const startedAt = deps.now();
  const errors: string[] = [];
  let fetched = 0;
  let matched = 0;
  let processed = 0;
  let list: NotificationList | undefined;
  let fatal: unknown;
  let leaseRenewedAt = startedAt;

  try {
    const rules = rulesForAccount(await listRules(deps.conn), account.id);
    if (rules.length > 0) {
      const client = clientFor(deps, await deps.cipher.decrypt(account.tokenEnc));
      list = await client.listNotifications({
        // A manual run always re-reads the backlog instead of trusting the 304 shortcut.
        ifModifiedSince: trigger === "manual" ? undefined : (account.lastModified ?? undefined),
      });
      const notifications = list.notModified ? [] : list.notifications;
      fetched = notifications.length;

      for (const notification of notifications) {
        try {
          const enricher = createEnricher({
            client,
            notification,
            cache: enrichmentCache(deps, account.id, notification.updated_at),
          });
          const rule = await firstMatchingRule(rules, enricher);
          if (rule) {
            matched++;
            await client.markThreadDone(notification.id);
            processed++;
            await insertHistory(deps.conn, [
              {
                id: newId(),
                accountId: account.id,
                accountLogin: account.login,
                threadId: notification.id,
                title: notification.subject.title,
                repo: notification.repository.full_name,
                subjectType: notification.subject.type,
                reason: notification.reason,
                url: enricher.htmlUrl(),
                ruleId: rule.id,
                ruleName: rule.name,
                processedAt: deps.now(),
              },
            ]);
          }
        } catch (error) {
          if (isFatal(error)) throw error;
          errors.push(`${notification.repository.full_name}: ${describe(error)}`);
        }

        if (deps.now() - leaseRenewedAt > LEASE_RENEW_AFTER_MS) {
          leaseRenewedAt = deps.now();
          await renewLease(deps.conn, {
            id: account.id,
            owner: deps.instanceId,
            ttlMs: LEASE_TTL_MS,
            now: leaseRenewedAt,
          });
        }
      }
    }
  } catch (error) {
    fatal = error;
    errors.unshift(describe(error));
    if (!(error instanceof GitHubError))
      deps.logger.error(`Run failed for ${account.login}`, error);
  }

  const finishedAt = deps.now();
  const pollIntervalSec = list?.pollIntervalSec ?? account.pollIntervalSec;
  // GitHub's X-Poll-Interval is a floor: never poll faster than it asks.
  const delayMs = Math.max(account.intervalSec, pollIntervalSec ?? 0) * 1000;
  const patch: AccountPatch = {
    lastRunAt: finishedAt,
    updatedAt: finishedAt,
    pollIntervalSec,
    nextRunAt: finishedAt + delayMs,
  };

  if (fatal === undefined) {
    patch.status = "ok";
    patch.lastError = null;
    if (list && !list.notModified) {
      // Keep the marker only after a clean pass, so anything that failed is retried.
      patch.lastModified = errors.length === 0 ? (list.lastModified ?? null) : null;
    }
  } else {
    patch.lastError = describe(fatal).slice(0, 1000);
    patch.lastModified = null;
    if (fatal instanceof GitHubError && fatal.kind === "unauthorized") {
      // The token is dead until the user replaces it. Retrying would only earn a lockout.
      patch.status = "unauthorized";
    } else {
      patch.status = "error";
      if (fatal instanceof GitHubError && fatal.retryAt !== undefined) {
        patch.nextRunAt = Math.max(patch.nextRunAt ?? 0, fatal.retryAt);
      }
    }
  }
  await updateAccount(deps.conn, account.id, patch);

  const run: RunLog = {
    id: newId(),
    accountId: account.id,
    accountLogin: account.login,
    trigger,
    status: fatal !== undefined ? "error" : errors.length > 0 ? "partial" : "success",
    fetched,
    matched,
    processed,
    errors,
    startedAt,
    finishedAt,
  };
  await insertRunLog(deps.conn, run);
  return run;
}

function toPreview(notification: GitHubNotification, enricher: Enricher): NotificationPreview {
  return {
    threadId: notification.id,
    title: notification.subject.title,
    repo: notification.repository.full_name,
    subjectType: notification.subject.type,
    reason: notification.reason,
    url: enricher.htmlUrl(),
    updatedAt: notification.updated_at,
  };
}

/** Evaluates a condition against the live unread notifications without touching them. */
export async function dryRun(deps: Deps, input: DryRunInput): Promise<DryRunResult> {
  const accounts = (await listAccounts(deps.conn)).filter((account) =>
    scopeIncludes(input.accountScope, account.id),
  );

  const results: DryRunResult["accounts"] = [];
  for (const account of accounts) {
    const matches: NotificationPreview[] = [];
    let fetched = 0;
    let error: string | null = null;
    try {
      const client = clientFor(deps, await deps.cipher.decrypt(account.tokenEnc));
      const list = await client.listNotifications();
      const notifications = list.notModified ? [] : list.notifications;
      fetched = notifications.length;
      for (const notification of notifications) {
        const enricher = createEnricher({
          client,
          notification,
          cache: enrichmentCache(deps, account.id, notification.updated_at),
        });
        try {
          if (await resolveCondition(input.condition, enricher)) {
            matches.push(toPreview(notification, enricher));
          }
        } catch (inner) {
          if (isFatal(inner)) throw inner;
          error ??= describe(inner);
        }
      }
    } catch (outer) {
      error = describe(outer);
    }
    results.push({ accountId: account.id, login: account.login, fetched, error, matches });
  }
  return { accounts: results };
}

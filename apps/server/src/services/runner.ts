import {
  type AccountPatch,
  type AccountRecord,
  acquireLease,
  clearCache,
  getAccount,
  getCached,
  insertHistory,
  insertRunLog,
  listAccounts,
  listClearedThreads,
  listRules,
  recordClearedThread,
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
  sameScopes,
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
 * `null` means it stayed undecided after everything was loaded: GitHub did not provide what
 * the condition needs, for example the state of a pull request in a repository the token
 * cannot read.
 */
export async function decideCondition(
  condition: Condition,
  enricher: Enricher,
): Promise<boolean | null> {
  let result = evaluateCondition(condition, enricher.context);
  if (result !== null) return result;
  const needs = requiredData(condition);
  for (const need of LOAD_ORDER) {
    if (!needs.has(need)) continue;
    await enricher.load(need);
    result = evaluateCondition(condition, enricher.context);
    if (result !== null) return result;
  }
  return null;
}

/** Like `decideCondition`, with an undecided condition counted as not matching. */
export async function resolveCondition(condition: Condition, enricher: Enricher): Promise<boolean> {
  return (await decideCondition(condition, enricher)) ?? false;
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

/**
 * The notifications a run looks at. GitHub lists the read ones still in the inbox together
 * with the ones already marked as done, and nothing tells them apart, so:
 *
 * - a version of a thread that Mewte already cleared is left alone, even when someone marked
 *   it unread again: that was done on purpose, and only new activity makes it a new version;
 * - an unread notification is in the inbox for certain, so it is looked at;
 * - a read one is looked at unless it predates the account's baseline, which only a run
 *   asked to go through that backlog ignores.
 *
 * Marking a thread done a second time changes nothing on GitHub, so a read notification the
 * user already cleared by hand costs a wasted request at worst.
 */
export function selectCandidates(
  notifications: GitHubNotification[],
  input: { baselineAt: number; cleared: Map<string, number>; backlog: boolean },
): GitHubNotification[] {
  return notifications.filter((notification) => {
    const updatedAt = Date.parse(notification.updated_at);
    if (input.cleared.get(notification.id) === updatedAt) return false;
    return notification.unread || input.backlog || updatedAt >= input.baselineAt;
  });
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
    // Listed even when no rule applies, so the run reports what is waiting in the inbox.
    const rules = rulesForAccount(await listRules(deps.conn), account.id);
    const client = clientFor(deps, await deps.cipher.decrypt(account.tokenEnc));
    list = await client.listNotifications({
      // Only a scheduled run trusts the 304 shortcut; the others always re-read the list.
      ifModifiedSince: trigger === "schedule" ? (account.lastModified ?? undefined) : undefined,
    });
    const notifications = selectCandidates(list.notModified ? [] : list.notifications, {
      baselineAt: account.baselineAt,
      cleared: await listClearedThreads(deps.conn, account.id),
      backlog: trigger === "backlog",
    });
    fetched = notifications.length;

    if (rules.length > 0) {
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
            // Last, so a failure above leaves the thread to be tried again.
            await recordClearedThread(deps.conn, {
              accountId: account.id,
              threadId: notification.id,
              updatedAt: Date.parse(notification.updated_at),
              clearedAt: deps.now(),
            });
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
  // The scopes of a token can be edited on GitHub at any time, and every response reports them.
  const scopes =
    list?.scopes && !sameScopes(list.scopes, account.scopes ? account.scopes.split(",") : [])
      ? list.scopes.join(",")
      : undefined;
  if (scopes !== undefined) patch.scopes = scopes;

  if (fatal === undefined) {
    patch.status = "ok";
    patch.lastError = null;
    if (list && !list.notModified) {
      // Keep the marker only after a clean pass, so anything that failed is retried.
      patch.lastModified = errors.length === 0 ? (list.lastModified ?? null) : null;
    }
    // This run decided with the old scopes in part, so the next one must not stop at a 304.
    if (scopes !== undefined) patch.lastModified = null;
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
  // The token may now see what it could not, so lookups cached as unavailable must go.
  if (scopes !== undefined) await clearCache(deps.conn);

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
    private: notification.repository.private ?? false,
  };
}

/** Evaluates a condition against the notifications a run would look at, without touching them. */
export async function dryRun(deps: Deps, input: DryRunInput): Promise<DryRunResult> {
  const accounts = (await listAccounts(deps.conn)).filter((account) =>
    scopeIncludes(input.accountScope, account.id),
  );

  const results: DryRunResult["accounts"] = [];
  for (const account of accounts) {
    const matches: NotificationPreview[] = [];
    const undecided: NotificationPreview[] = [];
    let fetched = 0;
    let error: string | null = null;
    try {
      const client = clientFor(deps, await deps.cipher.decrypt(account.tokenEnc));
      const list = await client.listNotifications();
      const notifications = selectCandidates(list.notModified ? [] : list.notifications, {
        baselineAt: account.baselineAt,
        cleared: await listClearedThreads(deps.conn, account.id),
        backlog: false,
      });
      fetched = notifications.length;
      for (const notification of notifications) {
        const enricher = createEnricher({
          client,
          notification,
          cache: enrichmentCache(deps, account.id, notification.updated_at),
        });
        try {
          const decision = await decideCondition(input.condition, enricher);
          if (decision) matches.push(toPreview(notification, enricher));
          else if (decision === null) undecided.push(toPreview(notification, enricher));
        } catch (inner) {
          if (isFatal(inner)) throw inner;
          error ??= describe(inner);
        }
      }
    } catch (outer) {
      error = describe(outer);
    }
    results.push({
      accountId: account.id,
      login: account.login,
      fetched,
      error,
      matches,
      undecided,
      repoScope: account.scopes.split(",").includes("repo"),
    });
  }
  return { accounts: results };
}

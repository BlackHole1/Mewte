import {
  type AccountRecord,
  clearCache,
  getAccount,
  getAccountByGithubId,
  insertAccount,
  updateAccount,
} from "@mewte/db";
import type { Account, AccountStatus, UpdateAccountInput } from "@mewte/shared";
import type { Deps } from "../deps";
import { ApiError, notFound } from "../errors";
import {
  GitHubError,
  type GitHubUser,
  checkScopes,
  createGitHubClient,
  sameScopes,
} from "../github/client";
import { newId } from "./crypto";

export function toAccount(record: AccountRecord, now: number): Account {
  return {
    id: record.id,
    login: record.login,
    avatarUrl: record.avatarUrl,
    scopes: record.scopes ? record.scopes.split(",") : [],
    intervalSec: record.intervalSec,
    enabled: record.enabled === 1,
    status: record.status as AccountStatus,
    lastError: record.lastError,
    lastRunAt: record.lastRunAt,
    nextRunAt: record.enabled === 1 && record.status !== "unauthorized" ? record.nextRunAt : null,
    running: record.lockUntil !== null && record.lockUntil > now,
    createdAt: record.createdAt,
  };
}

function whoIs(deps: Deps, token: string): Promise<GitHubUser> {
  return createGitHubClient({
    token,
    apiUrl: deps.config.githubApiUrl,
    fetch: deps.fetch,
    now: deps.now,
  }).getAuthenticatedUser();
}

function unreachable(error: unknown): ApiError {
  return new ApiError(
    502,
    "github_unreachable",
    error instanceof Error ? error.message : "Could not reach GitHub",
  );
}

/** Confirms a token works for notifications and returns who it belongs to. */
async function inspectToken(deps: Deps, token: string): Promise<GitHubUser> {
  let user: GitHubUser;
  try {
    user = await whoIs(deps, token);
  } catch (error) {
    if (error instanceof GitHubError && error.kind === "unauthorized") {
      throw new ApiError(400, "github_token_invalid", "GitHub rejected this token");
    }
    throw unreachable(error);
  }
  // Fine-grained tokens report no scopes and cannot read notifications at all.
  if (!checkScopes(user.scopes).canReadNotifications) {
    throw new ApiError(
      400,
      "github_token_missing_scope",
      "The token must be a classic personal access token with the notifications scope",
    );
  }
  return user;
}

export async function bindAccount(
  deps: Deps,
  input: { token: string; intervalSec: number },
): Promise<AccountRecord> {
  const user = await inspectToken(deps, input.token);
  if (await getAccountByGithubId(deps.conn, user.id)) {
    throw new ApiError(409, "account_exists", `${user.login} is already connected`);
  }
  const now = deps.now();
  const record: AccountRecord = {
    id: newId(),
    githubId: user.id,
    login: user.login,
    avatarUrl: user.avatarUrl,
    tokenEnc: await deps.cipher.encrypt(input.token),
    scopes: user.scopes.join(","),
    intervalSec: input.intervalSec,
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
  };
  await insertAccount(deps.conn, record);
  return record;
}

export async function editAccount(
  deps: Deps,
  id: string,
  input: UpdateAccountInput,
): Promise<AccountRecord> {
  const existing = await getAccount(deps.conn, id);
  if (!existing) throw notFound("Account");

  const now = deps.now();
  const patch: Parameters<typeof updateAccount>[2] = { updatedAt: now };

  if (input.token !== undefined) {
    const user = await inspectToken(deps, input.token);
    if (user.id !== existing.githubId) {
      throw new ApiError(
        400,
        "account_mismatch",
        `This token belongs to ${user.login}, not ${existing.login}`,
      );
    }
    Object.assign(patch, {
      login: user.login,
      avatarUrl: user.avatarUrl,
      tokenEnc: await deps.cipher.encrypt(input.token),
      scopes: user.scopes.join(","),
      status: "ok",
      lastError: null,
      lastModified: null,
      nextRunAt: now,
    });
  }
  if (input.intervalSec !== undefined) {
    patch.intervalSec = input.intervalSec;
    patch.nextRunAt = now;
  }
  if (input.enabled !== undefined) {
    patch.enabled = input.enabled ? 1 : 0;
    if (input.enabled) patch.nextRunAt = now;
  }

  await updateAccount(deps.conn, id, patch);
  // A new token may see what the old one could not, so lookups cached as unavailable must go.
  if (input.token !== undefined) await clearCache(deps.conn);
  return (await getAccount(deps.conn, id)) ?? existing;
}

/**
 * Asks GitHub about the stored token again and records the answer: who it belongs to, its
 * scopes, and whether it still works. A token GitHub rejects, or one that lost the scope for
 * notifications, is a result to store rather than a failure of the check.
 */
export async function verifyAccount(deps: Deps, id: string): Promise<AccountRecord> {
  const existing = await getAccount(deps.conn, id);
  if (!existing) throw notFound("Account");

  const now = deps.now();
  let user: GitHubUser;
  try {
    user = await whoIs(deps, await deps.cipher.decrypt(existing.tokenEnc));
  } catch (error) {
    if (!(error instanceof GitHubError && error.kind === "unauthorized")) throw unreachable(error);
    await updateAccount(deps.conn, id, {
      status: "unauthorized",
      lastError: error.message.slice(0, 1000),
      lastModified: null,
      updatedAt: now,
    });
    return (await getAccount(deps.conn, id)) ?? existing;
  }

  const usable = checkScopes(user.scopes).canReadNotifications;
  const scopesChanged = !sameScopes(user.scopes, existing.scopes ? existing.scopes.split(",") : []);
  const patch: Parameters<typeof updateAccount>[2] = {
    login: user.login,
    avatarUrl: user.avatarUrl,
    scopes: user.scopes.join(","),
    status: usable ? "ok" : "error",
    lastError: usable ? null : "The token no longer has the notifications scope",
    updatedAt: now,
  };
  // Polling stopped for a rejected token, and new scopes change what the rules can decide.
  if (usable && (existing.status === "unauthorized" || scopesChanged)) {
    patch.lastModified = null;
    patch.nextRunAt = now;
  }
  await updateAccount(deps.conn, id, patch);
  // The token may now see what it could not, so lookups cached as unavailable must go.
  if (scopesChanged) await clearCache(deps.conn);
  return (await getAccount(deps.conn, id)) ?? existing;
}

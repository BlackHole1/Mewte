import {
  type AccountRecord,
  getAccount,
  getAccountByGithubId,
  insertAccount,
  updateAccount,
} from "@mewte/db";
import type { Account, AccountStatus, UpdateAccountInput } from "@mewte/shared";
import type { Deps } from "../deps";
import { ApiError, notFound } from "../errors";
import { GitHubError, type GitHubUser, checkScopes, createGitHubClient } from "../github/client";
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

/** Confirms a token works for notifications and returns who it belongs to. */
async function inspectToken(deps: Deps, token: string): Promise<GitHubUser> {
  let user: GitHubUser;
  try {
    user = await createGitHubClient({
      token,
      apiUrl: deps.config.githubApiUrl,
      fetch: deps.fetch,
      now: deps.now,
    }).getAuthenticatedUser();
  } catch (error) {
    if (error instanceof GitHubError && error.kind === "unauthorized") {
      throw new ApiError(400, "github_token_invalid", "GitHub rejected this token");
    }
    throw new ApiError(
      502,
      "github_unreachable",
      error instanceof Error ? error.message : "Could not reach GitHub",
    );
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
  return (await getAccount(deps.conn, id)) ?? existing;
}

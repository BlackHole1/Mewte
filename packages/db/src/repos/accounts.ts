import type { Insertable, Selectable, Updateable } from "kysely";
import type { Conn, GithubAccountsTable } from "../types";

export type AccountRecord = Selectable<GithubAccountsTable>;
export type NewAccount = Insertable<GithubAccountsTable>;
export type AccountPatch = Omit<Updateable<GithubAccountsTable>, "id" | "createdAt">;

export async function listAccounts(conn: Conn): Promise<AccountRecord[]> {
  return conn.db
    .selectFrom("githubAccounts")
    .selectAll()
    .orderBy("createdAt")
    .orderBy("id")
    .execute();
}

export async function getAccount(conn: Conn, id: string): Promise<AccountRecord | undefined> {
  return conn.db.selectFrom("githubAccounts").selectAll().where("id", "=", id).executeTakeFirst();
}

export async function getAccountByGithubId(
  conn: Conn,
  githubId: number,
): Promise<AccountRecord | undefined> {
  return conn.db
    .selectFrom("githubAccounts")
    .selectAll()
    .where("githubId", "=", githubId)
    .executeTakeFirst();
}

export async function insertAccount(conn: Conn, account: NewAccount): Promise<void> {
  await conn.db.insertInto("githubAccounts").values(account).execute();
}

export async function updateAccount(conn: Conn, id: string, patch: AccountPatch): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  await conn.db.updateTable("githubAccounts").set(patch).where("id", "=", id).execute();
}

export async function deleteAccount(conn: Conn, id: string): Promise<void> {
  await conn.db.deleteFrom("githubAccounts").where("id", "=", id).execute();
}

/** Enabled, healthy accounts whose next run is due. */
export async function listDueAccounts(conn: Conn, now: number): Promise<AccountRecord[]> {
  return conn.db
    .selectFrom("githubAccounts")
    .selectAll()
    .where("enabled", "=", 1)
    .where("status", "!=", "unauthorized")
    .where("nextRunAt", "<=", now)
    .orderBy("nextRunAt")
    .execute();
}

/**
 * Takes the per-account run lease. Exactly one caller wins while the lease is live, across
 * processes too, because the claim is a single conditional UPDATE.
 */
export async function acquireLease(
  conn: Conn,
  input: { id: string; owner: string; now: number; ttlMs: number },
): Promise<boolean> {
  const result = await conn.db
    .updateTable("githubAccounts")
    .set({ lockOwner: input.owner, lockUntil: input.now + input.ttlMs })
    .where("id", "=", input.id)
    .where((eb) => eb.or([eb("lockUntil", "is", null), eb("lockUntil", "<=", input.now)]))
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

/** Pushes the lease expiry out. Returns false if this owner no longer holds it. */
export async function renewLease(
  conn: Conn,
  input: { id: string; owner: string; now: number; ttlMs: number },
): Promise<boolean> {
  const result = await conn.db
    .updateTable("githubAccounts")
    .set({ lockUntil: input.now + input.ttlMs })
    .where("id", "=", input.id)
    .where("lockOwner", "=", input.owner)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export async function releaseLease(conn: Conn, id: string, owner: string): Promise<void> {
  await conn.db
    .updateTable("githubAccounts")
    .set({ lockOwner: null, lockUntil: null })
    .where("id", "=", id)
    .where("lockOwner", "=", owner)
    .execute();
}

/**
 * Forgets the Last-Modified marker so the next poll re-reads every unread notification.
 * Needed whenever rules change, since a 304 would otherwise hide the existing backlog.
 */
export async function resetPollMarkers(conn: Conn): Promise<void> {
  await conn.db
    .updateTable("githubAccounts")
    .set({ lastModified: null })
    .where("lastModified", "is not", null)
    .execute();
}

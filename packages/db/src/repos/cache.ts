import type { Conn } from "../types";
import { upsert } from "../upsert";

export async function getCached(
  conn: Conn,
  cacheKey: string,
  now: number,
): Promise<string | undefined> {
  const row = await conn.db
    .selectFrom("subjectCache")
    .select("payload")
    .where("cacheKey", "=", cacheKey)
    .where("expiresAt", ">", now)
    .executeTakeFirst();
  return row?.payload;
}

export async function setCached(
  conn: Conn,
  cacheKey: string,
  payload: string,
  expiresAt: number,
): Promise<void> {
  await upsert(conn, "subjectCache", { cacheKey, payload, expiresAt }, ["cacheKey"]);
}

export async function deleteExpiredCache(conn: Conn, now: number): Promise<void> {
  await conn.db.deleteFrom("subjectCache").where("expiresAt", "<=", now).execute();
}

/** Drops every cached lookup, for when what a token can see may have changed. */
export async function clearCache(conn: Conn): Promise<void> {
  await conn.db.deleteFrom("subjectCache").execute();
}

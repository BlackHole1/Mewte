import type { Conn } from "../types";
import { upsert } from "../upsert";

/** Thread id -> the `updated_at` (epoch milliseconds) at which Mewte marked it as done. */
export async function listClearedThreads(
  conn: Conn,
  accountId: string,
): Promise<Map<string, number>> {
  const rows = await conn.db
    .selectFrom("clearedThreads")
    .select(["threadId", "updatedAt"])
    .where("accountId", "=", accountId)
    .execute();
  return new Map(rows.map((row) => [row.threadId, Number(row.updatedAt)]));
}

export async function recordClearedThread(
  conn: Conn,
  row: { accountId: string; threadId: string; updatedAt: number; clearedAt: number },
): Promise<void> {
  await upsert(conn, "clearedThreads", row, ["accountId", "threadId"]);
}

export async function deleteClearedThreads(conn: Conn, accountId: string): Promise<void> {
  await conn.db.deleteFrom("clearedThreads").where("accountId", "=", accountId).execute();
}

export async function deleteClearedThreadsBefore(conn: Conn, cutoff: number): Promise<void> {
  await conn.db.deleteFrom("clearedThreads").where("clearedAt", "<", cutoff).execute();
}

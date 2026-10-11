import type { HistoryItem, Paginated } from "@mewte/shared";
import { type ExpressionBuilder, sql } from "kysely";
import type { Conn, DB } from "../types";
import { escapeLike } from "../upsert";

export interface HistoryFilter {
  accountId?: string | undefined;
  ruleId?: string | undefined;
  repo?: string | undefined;
  subjectType?: string | undefined;
  reason?: string | undefined;
  /** Case-insensitive substring of the title or repository. */
  q?: string | undefined;
  from?: number | undefined;
  to?: number | undefined;
  page: number;
  pageSize: number;
}

export async function insertHistory(conn: Conn, items: HistoryItem[]): Promise<void> {
  if (items.length === 0) return;
  await conn.db.insertInto("history").values(items).execute();
}

function contains(column: "title" | "repo", needle: string) {
  const pattern = `%${escapeLike(needle.toLowerCase())}%`;
  return sql<boolean>`lower(${sql.ref(column)}) like ${pattern} escape '!'`;
}

function applyFilter(filter: HistoryFilter) {
  return (eb: ExpressionBuilder<DB, "history">) => {
    const parts = [];
    if (filter.accountId) parts.push(eb("accountId", "=", filter.accountId));
    if (filter.ruleId) parts.push(eb("ruleId", "=", filter.ruleId));
    if (filter.subjectType) parts.push(eb("subjectType", "=", filter.subjectType));
    if (filter.reason) parts.push(eb("reason", "=", filter.reason));
    if (filter.repo) parts.push(contains("repo", filter.repo));
    if (filter.q) parts.push(eb.or([contains("title", filter.q), contains("repo", filter.q)]));
    if (filter.from !== undefined) parts.push(eb("processedAt", ">=", filter.from));
    if (filter.to !== undefined) parts.push(eb("processedAt", "<=", filter.to));
    return eb.and(parts);
  };
}

export async function queryHistory(
  conn: Conn,
  filter: HistoryFilter,
): Promise<Paginated<HistoryItem>> {
  const where = applyFilter(filter);
  const [items, count] = await Promise.all([
    conn.db
      .selectFrom("history")
      .selectAll()
      .where(where)
      .orderBy("processedAt", "desc")
      .orderBy("id", "desc")
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize)
      .execute(),
    conn.db
      .selectFrom("history")
      .select((eb) => eb.fn.countAll().as("total"))
      .where(where)
      .executeTakeFirstOrThrow(),
  ]);
  return { items, total: Number(count.total), page: filter.page, pageSize: filter.pageSize };
}

export async function countHistory(conn: Conn, since?: number): Promise<number> {
  let query = conn.db.selectFrom("history").select((eb) => eb.fn.countAll().as("total"));
  if (since !== undefined) query = query.where("processedAt", ">=", since);
  return Number((await query.executeTakeFirstOrThrow()).total);
}

/** Counts rows in consecutive `[start, start + size)` buckets, oldest first. */
export async function countHistoryBuckets(
  conn: Conn,
  input: { start: number; size: number; buckets: number },
): Promise<number[]> {
  const end = input.start + input.size * input.buckets;
  const rows = await conn.db
    .selectFrom("history")
    .select("processedAt")
    .where("processedAt", ">=", input.start)
    .where("processedAt", "<", end)
    .execute();
  const counts = Array.from({ length: input.buckets }, () => 0);
  for (const row of rows) {
    const index = Math.floor((row.processedAt - input.start) / input.size);
    if (index >= 0 && index < input.buckets) counts[index] = (counts[index] ?? 0) + 1;
  }
  return counts;
}

export async function deleteHistoryBefore(conn: Conn, cutoff: number): Promise<number> {
  const result = await conn.db
    .deleteFrom("history")
    .where("processedAt", "<", cutoff)
    .executeTakeFirst();
  return Number(result.numDeletedRows);
}

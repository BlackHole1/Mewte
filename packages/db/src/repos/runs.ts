import type { Paginated, RunLog, RunStatus, RunTrigger } from "@mewte/shared";
import type { Selectable } from "kysely";
import type { Conn, RunLogsTable } from "../types";

export interface RunFilter {
  accountId?: string | undefined;
  status?: RunStatus | undefined;
  page: number;
  pageSize: number;
}

/** Long error lists are trimmed so the row always fits a TEXT column. */
const MAX_ERRORS = 50;
const MAX_ERROR_LENGTH = 500;

function toRunLog(row: Selectable<RunLogsTable>): RunLog {
  return {
    id: row.id,
    accountId: row.accountId,
    accountLogin: row.accountLogin,
    trigger: row.triggerType as RunTrigger,
    status: row.status as RunStatus,
    fetched: row.fetched,
    matched: row.matched,
    processed: row.processed,
    errors: JSON.parse(row.errors) as string[],
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

export async function insertRunLog(conn: Conn, run: RunLog): Promise<void> {
  const errors = run.errors.slice(0, MAX_ERRORS).map((e) => e.slice(0, MAX_ERROR_LENGTH));
  await conn.db
    .insertInto("runLogs")
    .values({
      id: run.id,
      accountId: run.accountId,
      accountLogin: run.accountLogin,
      triggerType: run.trigger,
      status: run.status,
      fetched: run.fetched,
      matched: run.matched,
      processed: run.processed,
      errors: JSON.stringify(errors),
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
    })
    .execute();
}

export async function queryRunLogs(conn: Conn, filter: RunFilter): Promise<Paginated<RunLog>> {
  let rows = conn.db.selectFrom("runLogs").selectAll();
  let count = conn.db.selectFrom("runLogs").select((eb) => eb.fn.countAll().as("total"));
  if (filter.accountId) {
    rows = rows.where("accountId", "=", filter.accountId);
    count = count.where("accountId", "=", filter.accountId);
  }
  if (filter.status) {
    rows = rows.where("status", "=", filter.status);
    count = count.where("status", "=", filter.status);
  }
  const [items, total] = await Promise.all([
    rows
      .orderBy("startedAt", "desc")
      .orderBy("id", "desc")
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize)
      .execute(),
    count.executeTakeFirstOrThrow(),
  ]);
  return {
    items: items.map(toRunLog),
    total: Number(total.total),
    page: filter.page,
    pageSize: filter.pageSize,
  };
}

export async function deleteRunLogsBefore(conn: Conn, cutoff: number): Promise<number> {
  const result = await conn.db
    .deleteFrom("runLogs")
    .where("startedAt", "<", cutoff)
    .executeTakeFirst();
  return Number(result.numDeletedRows);
}

import type { Insertable } from "kysely";
import type { Conn, DB } from "./types";

/**
 * Inserts a row or, when `keys` already exist, overwrites the remaining columns.
 * The one place where MySQL's syntax differs from PostgreSQL and SQLite.
 */
export async function upsert<T extends keyof DB & string>(
  conn: Conn,
  table: T,
  row: Insertable<DB[T]>,
  keys: readonly (keyof DB[T] & string)[],
): Promise<void> {
  const update = Object.fromEntries(
    Object.entries(row).filter(([column]) => !(keys as readonly string[]).includes(column)),
  );
  const insert = conn.db.insertInto(table).values(row as never);
  if (conn.kind === "mysql") {
    await insert.onDuplicateKeyUpdate(update as never).execute();
  } else {
    await insert
      .onConflict((oc) => oc.columns(keys as never).doUpdateSet(update as never))
      .execute();
  }
}

/** Escapes LIKE wildcards. Pair with `like ... escape '!'`. */
export function escapeLike(value: string): string {
  return value.replace(/[!%_]/g, "!$&");
}

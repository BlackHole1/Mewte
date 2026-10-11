import { resolve } from "node:path";
import { CamelCasePlugin, type Dialect, Kysely, MysqlDialect, PostgresDialect } from "kysely";
import { createPool } from "mysql2";
import pg from "pg";
import { createSqliteDialect } from "./sqlite";
import type { Conn, DB, DbKind } from "./types";

export const DEFAULT_DATABASE_URL = "sqlite://./data/mewte.db";

export interface ParsedDatabaseUrl {
  kind: DbKind;
  /** File path for SQLite (or `:memory:`), the full connection string otherwise. */
  target: string;
}

export function parseDatabaseUrl(url: string): ParsedDatabaseUrl {
  const value = url.trim();
  if (value === ":memory:" || value === "sqlite::memory:" || value === "sqlite://:memory:") {
    return { kind: "sqlite", target: ":memory:" };
  }
  for (const prefix of ["sqlite://", "sqlite:", "file://", "file:"]) {
    if (value.startsWith(prefix)) {
      const path = value.slice(prefix.length);
      if (!path) break;
      return { kind: "sqlite", target: resolve(path) };
    }
  }
  if (value.startsWith("postgres://") || value.startsWith("postgresql://")) {
    return { kind: "postgres", target: value };
  }
  if (value.startsWith("mysql://")) {
    return { kind: "mysql", target: value };
  }
  throw new Error(
    "Unsupported DATABASE_URL. Use sqlite://<path>, postgres://... or mysql://... (credentials are not shown here).",
  );
}

function createDialect({ kind, target }: ParsedDatabaseUrl): Dialect {
  switch (kind) {
    case "sqlite":
      return createSqliteDialect(target);
    case "postgres": {
      // BIGINT columns hold epoch milliseconds, which fit a JS number.
      const types: pg.CustomTypesConfig = {
        getTypeParser: ((oid: number, format?: "text" | "binary") =>
          oid === pg.types.builtins.INT8
            ? (value: string) => Number(value)
            : pg.types.getTypeParser(
                oid,
                format as "text",
              )) as pg.CustomTypesConfig["getTypeParser"],
      };
      return new PostgresDialect({
        pool: new pg.Pool({ connectionString: target, max: 10, types }),
      });
    }
    case "mysql":
      return new MysqlDialect({
        pool: createPool({ uri: target, connectionLimit: 10, charset: "utf8mb4" }),
      });
  }
}

export interface Database extends Conn {
  destroy(): Promise<void>;
}

export function createDb(url: string = DEFAULT_DATABASE_URL): Database {
  const parsed = parseDatabaseUrl(url);
  const db = new Kysely<DB>({ dialect: createDialect(parsed), plugins: [new CamelCasePlugin()] });
  return { db, kind: parsed.kind, destroy: () => db.destroy() };
}

/** Runs `fn` in a transaction, handing it a connection of the same dialect. */
export function transaction<T>(conn: Conn, fn: (trx: Conn) => Promise<T>): Promise<T> {
  return conn.db.transaction().execute((trx) => fn({ db: trx, kind: conn.kind }));
}

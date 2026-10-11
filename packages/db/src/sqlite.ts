import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { type SqliteDatabase, SqliteDialect, type SqliteStatement } from "kysely";

type Params = Parameters<ReturnType<Database["prepare"]>["all"]>;

/** Adapts bun:sqlite to the better-sqlite3 shape Kysely's SQLite dialect expects. */
function adapt(database: Database): SqliteDatabase {
  return {
    close: () => database.close(),
    prepare(query: string): SqliteStatement {
      const statement = database.prepare(query);
      return {
        reader: statement.columnNames.length > 0,
        all: (parameters) => statement.all(...(parameters as Params)),
        run: (parameters) => statement.run(...(parameters as Params)),
        iterate: (parameters) => statement.iterate(...(parameters as Params)),
      };
    },
  };
}

export function createSqliteDialect(path: string): SqliteDialect {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const database = new Database(path, { create: true });
  database.run("PRAGMA journal_mode = WAL");
  database.run("PRAGMA busy_timeout = 5000");
  database.run("PRAGMA foreign_keys = ON");
  return new SqliteDialect({ database: adapt(database) });
}

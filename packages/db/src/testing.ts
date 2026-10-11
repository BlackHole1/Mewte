import { randomBytes } from "node:crypto";
import { sql } from "kysely";
import { type Database, createDb } from "./client";
import { migrateToLatest } from "./migrations";
import type { DbKind } from "./types";

/**
 * Dialects the test run should cover. SQLite always runs in memory; PostgreSQL and MySQL
 * join when TEST_POSTGRES_URL / TEST_MYSQL_URL point at a server where the user may
 * create databases.
 */
export function testDialects(): DbKind[] {
  const kinds: DbKind[] = ["sqlite"];
  if (process.env.TEST_POSTGRES_URL) kinds.push("postgres");
  if (process.env.TEST_MYSQL_URL) kinds.push("mysql");
  return kinds;
}

export interface TestDatabase extends Database {
  /** Drops the scratch database and closes every connection. */
  cleanup(): Promise<void>;
}

/** Creates an isolated, fully migrated database for one test file. */
export async function createTestDb(kind: DbKind): Promise<TestDatabase> {
  if (kind === "sqlite") {
    const database = createDb(":memory:");
    await migrateToLatest(database);
    return { ...database, cleanup: () => database.destroy() };
  }

  const adminUrl = kind === "postgres" ? process.env.TEST_POSTGRES_URL : process.env.TEST_MYSQL_URL;
  if (!adminUrl) throw new Error(`No test server configured for ${kind}`);
  const name = `mewte_test_${randomBytes(6).toString("hex")}`;

  const admin = createDb(adminUrl);
  await sql`create database ${sql.id(name)}`.execute(admin.db);

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const database = createDb(url.toString());
  await migrateToLatest(database);

  return {
    ...database,
    async cleanup() {
      await database.destroy();
      await sql`drop database if exists ${sql.id(name)}`.execute(admin.db);
      await admin.destroy();
    },
  };
}

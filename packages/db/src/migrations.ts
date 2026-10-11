import type { Kysely } from "kysely";
import { type Migration, type MigrationProvider, Migrator } from "kysely/migration";
import type { Conn } from "./types";

// Migrations are bundled as code so the server ships without loose files. They use only
// portable column types; see the conventions in types.ts. Never edit a released migration.

const id = "varchar(36)";

const init: Migration = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable("users")
      .addColumn("id", id, (c) => c.primaryKey())
      .addColumn("username", "varchar(64)", (c) => c.notNull().unique())
      .addColumn("passwordHash", "varchar(255)", (c) => c.notNull())
      .addColumn("createdAt", "bigint", (c) => c.notNull())
      .addColumn("updatedAt", "bigint", (c) => c.notNull())
      .execute();

    await db.schema
      .createTable("sessions")
      .addColumn("id", "varchar(64)", (c) => c.primaryKey())
      .addColumn("userId", id, (c) => c.notNull())
      .addColumn("createdAt", "bigint", (c) => c.notNull())
      .addColumn("lastSeenAt", "bigint", (c) => c.notNull())
      .addColumn("expiresAt", "bigint", (c) => c.notNull())
      .execute();
    await db.schema.createIndex("sessions_expires_at").on("sessions").column("expiresAt").execute();

    await db.schema
      .createTable("totp")
      .addColumn("userId", id, (c) => c.primaryKey())
      .addColumn("secretEnc", "text", (c) => c.notNull())
      .addColumn("enabled", "integer", (c) => c.notNull())
      .addColumn("lastUsedStep", "bigint")
      .addColumn("createdAt", "bigint", (c) => c.notNull())
      .execute();

    await db.schema
      .createTable("recoveryCodes")
      .addColumn("id", id, (c) => c.primaryKey())
      .addColumn("userId", id, (c) => c.notNull())
      .addColumn("codeHash", "varchar(64)", (c) => c.notNull())
      .addColumn("usedAt", "bigint")
      .execute();
    await db.schema
      .createIndex("recovery_codes_user_id")
      .on("recoveryCodes")
      .column("userId")
      .execute();

    await db.schema
      .createTable("loginAttempts")
      .addColumn("bucket", "varchar(191)", (c) => c.primaryKey())
      .addColumn("windowStart", "bigint", (c) => c.notNull())
      .addColumn("attempts", "integer", (c) => c.notNull())
      .execute();

    await db.schema
      .createTable("githubAccounts")
      .addColumn("id", id, (c) => c.primaryKey())
      .addColumn("githubId", "bigint", (c) => c.notNull().unique())
      .addColumn("login", "varchar(100)", (c) => c.notNull())
      .addColumn("avatarUrl", "text", (c) => c.notNull())
      .addColumn("tokenEnc", "text", (c) => c.notNull())
      .addColumn("scopes", "text", (c) => c.notNull())
      .addColumn("intervalSec", "integer", (c) => c.notNull())
      .addColumn("enabled", "integer", (c) => c.notNull())
      .addColumn("status", "varchar(20)", (c) => c.notNull())
      .addColumn("lastError", "text")
      .addColumn("lastModified", "varchar(64)")
      .addColumn("pollIntervalSec", "integer")
      .addColumn("nextRunAt", "bigint", (c) => c.notNull())
      .addColumn("lastRunAt", "bigint")
      .addColumn("lockUntil", "bigint")
      .addColumn("lockOwner", id)
      .addColumn("createdAt", "bigint", (c) => c.notNull())
      .addColumn("updatedAt", "bigint", (c) => c.notNull())
      .execute();

    await db.schema
      .createTable("rules")
      .addColumn("id", id, (c) => c.primaryKey())
      .addColumn("name", "varchar(200)", (c) => c.notNull())
      .addColumn("enabled", "integer", (c) => c.notNull())
      .addColumn("priority", "integer", (c) => c.notNull())
      .addColumn("accountScope", "text", (c) => c.notNull())
      .addColumn("conditionJson", "text", (c) => c.notNull())
      .addColumn("action", "varchar(32)", (c) => c.notNull())
      .addColumn("createdAt", "bigint", (c) => c.notNull())
      .addColumn("updatedAt", "bigint", (c) => c.notNull())
      .execute();

    await db.schema
      .createTable("history")
      .addColumn("id", id, (c) => c.primaryKey())
      .addColumn("accountId", id, (c) => c.notNull())
      .addColumn("accountLogin", "varchar(100)", (c) => c.notNull())
      .addColumn("threadId", "varchar(32)", (c) => c.notNull())
      .addColumn("title", "text", (c) => c.notNull())
      .addColumn("repo", "varchar(255)", (c) => c.notNull())
      .addColumn("subjectType", "varchar(64)", (c) => c.notNull())
      .addColumn("reason", "varchar(64)", (c) => c.notNull())
      .addColumn("url", "text", (c) => c.notNull())
      .addColumn("ruleId", id)
      .addColumn("ruleName", "varchar(200)", (c) => c.notNull())
      .addColumn("processedAt", "bigint", (c) => c.notNull())
      .execute();
    await db.schema
      .createIndex("history_processed_at")
      .on("history")
      .column("processedAt")
      .execute();
    await db.schema
      .createIndex("history_account_processed_at")
      .on("history")
      .columns(["accountId", "processedAt"])
      .execute();

    await db.schema
      .createTable("runLogs")
      .addColumn("id", id, (c) => c.primaryKey())
      .addColumn("accountId", id, (c) => c.notNull())
      .addColumn("accountLogin", "varchar(100)", (c) => c.notNull())
      .addColumn("triggerType", "varchar(16)", (c) => c.notNull())
      .addColumn("status", "varchar(16)", (c) => c.notNull())
      .addColumn("fetched", "integer", (c) => c.notNull())
      .addColumn("matched", "integer", (c) => c.notNull())
      .addColumn("processed", "integer", (c) => c.notNull())
      .addColumn("errors", "text", (c) => c.notNull())
      .addColumn("startedAt", "bigint", (c) => c.notNull())
      .addColumn("finishedAt", "bigint", (c) => c.notNull())
      .execute();
    await db.schema.createIndex("run_logs_started_at").on("runLogs").column("startedAt").execute();

    await db.schema
      .createTable("settings")
      .addColumn("name", "varchar(64)", (c) => c.primaryKey())
      .addColumn("value", "text", (c) => c.notNull())
      .execute();

    await db.schema
      .createTable("subjectCache")
      .addColumn("cacheKey", "varchar(64)", (c) => c.primaryKey())
      .addColumn("payload", "text", (c) => c.notNull())
      .addColumn("expiresAt", "bigint", (c) => c.notNull())
      .execute();
    await db.schema
      .createIndex("subject_cache_expires_at")
      .on("subjectCache")
      .column("expiresAt")
      .execute();
  },

  async down(db: Kysely<unknown>) {
    for (const table of [
      "subjectCache",
      "settings",
      "runLogs",
      "history",
      "rules",
      "githubAccounts",
      "loginAttempts",
      "recoveryCodes",
      "totp",
      "sessions",
      "users",
    ]) {
      await db.schema.dropTable(table).ifExists().execute();
    }
  },
};

export const migrations: Record<string, Migration> = {
  "0001_init": init,
};

const provider: MigrationProvider = {
  getMigrations: async () => migrations,
};

/** Applies pending migrations. Safe to call from several instances at once. */
export async function migrateToLatest(conn: Conn): Promise<string[]> {
  const migrator = new Migrator({ db: conn.db, provider });
  const { error, results } = await migrator.migrateToLatest();
  if (error) throw error instanceof Error ? error : new Error(String(error));
  return (results ?? []).filter((r) => r.status === "Success").map((r) => r.migrationName);
}

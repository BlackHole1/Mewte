import { createDb, migrateToLatest } from "@mewte/db";
import { getConnInfo } from "hono/bun";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { type Deps, consoleLogger } from "./deps";
import { createCipher, newId } from "./services/crypto";
import { argon2Hasher } from "./services/password";
import { createScheduler } from "./services/scheduler";
import { resolveSecretKey } from "./services/secret-key";
import { findWebDist, serveWeb } from "./static";

const logger = consoleLogger;

async function main() {
  const config = loadConfig(process.env);
  const database = createDb(config.databaseUrl);

  const applied = await migrateToLatest(database);
  if (applied.length > 0) logger.info(`Applied migrations: ${applied.join(", ")}`);

  const secret = resolveSecretKey({
    secretKey: config.secretKey,
    kind: database.kind,
    dataDir: config.dataDir,
  });
  if (secret.source === "generated") {
    logger.warn(
      `SECRET_KEY is not set. Generated one in ${config.dataDir}/secret.key; back it up with the database, tokens cannot be decrypted without it.`,
    );
  }

  const deps: Deps = {
    conn: database,
    config,
    cipher: await createCipher(secret.secret),
    hasher: argon2Hasher,
    now: Date.now,
    sleep: (ms) => Bun.sleep(ms),
    fetch,
    instanceId: newId(),
    remoteAddress: (c) => {
      try {
        return getConnInfo(c).remote.address;
      } catch {
        return undefined;
      }
    },
    logger,
  };

  const app = createApp(deps);
  const webDist = findWebDist(config.webDist, import.meta.dir);
  if (webDist) serveWeb(app, webDist);
  else logger.warn("Web build not found; serving the API only. Run `bun run build` first.");

  const stopScheduler = createScheduler(deps).start();
  const server = Bun.serve({
    hostname: config.host,
    port: config.port,
    fetch: app.fetch,
    // "Run now" and dry-run answer only after talking to GitHub, which can take a while.
    idleTimeout: 255,
  });
  logger.info(`Listening on http://${server.hostname}:${server.port} (${database.kind})`);

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    logger.info("Shutting down");
    stopScheduler();
    await server.stop();
    await database.destroy();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error) => {
  logger.error("Failed to start", error);
  process.exit(1);
});

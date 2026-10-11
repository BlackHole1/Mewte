import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DbKind } from "@mewte/db";
import { randomToken } from "./crypto";

export const SECRET_KEY_FILE = "secret.key";

export interface ResolvedSecret {
  secret: string;
  source: "env" | "file" | "generated";
}

/**
 * Picks the key that encrypts stored tokens. SECRET_KEY always wins. Without it, a
 * SQLite install keeps a generated key beside the database so `docker compose up` works
 * out of the box. A networked database has no such place, so the key must be explicit.
 */
export function resolveSecretKey(input: {
  secretKey: string | undefined;
  kind: DbKind;
  dataDir: string;
}): ResolvedSecret {
  if (input.secretKey) return { secret: input.secretKey, source: "env" };

  if (input.kind !== "sqlite") {
    throw new Error(
      "SECRET_KEY is required when using PostgreSQL or MySQL. Generate one with: openssl rand -base64 32",
    );
  }

  const path = join(input.dataDir, SECRET_KEY_FILE);
  if (existsSync(path)) {
    const secret = readFileSync(path, "utf8").trim();
    if (secret.length < 32) throw new Error(`${path} does not contain a usable key`);
    return { secret, source: "file" };
  }

  mkdirSync(input.dataDir, { recursive: true });
  const secret = randomToken(48);
  writeFileSync(path, `${secret}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
  return { secret, source: "generated" };
}

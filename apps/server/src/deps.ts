import type { Conn } from "@mewte/db";
import type { Context } from "hono";
import type { Config } from "./config";
import type { Cipher } from "./services/crypto";
import type { PasswordHasher } from "./services/password";

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

/** Everything the application needs from the outside world. Tests swap any of it. */
export interface Deps {
  conn: Conn;
  config: Config;
  cipher: Cipher;
  hasher: PasswordHasher;
  now: () => number;
  /** Waits before answering a failed sign-in. Tests replace it so they do not wait. */
  sleep: (ms: number) => Promise<void>;
  fetch: typeof fetch;
  /** Identifies this process when it takes a run lease. */
  instanceId: string;
  /** Address of the peer that opened the connection, before any proxy headers. */
  remoteAddress: (c: Context) => string | undefined;
  logger: Logger;
}

export const consoleLogger: Logger = {
  info: (message) => console.log(`[mewte] ${message}`),
  warn: (message) => console.warn(`[mewte] ${message}`),
  error: (message, error) =>
    console.error(`[mewte] ${message}`, error instanceof Error ? error.message : (error ?? "")),
};

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };

import type { DbKind } from "@mewte/db";
import { type TestDatabase, createTestDb } from "@mewte/db/testing";
import { type App, createApp } from "../app";
import type { Config } from "../config";
import { type Deps, silentLogger } from "../deps";
import { SESSION_COOKIE } from "../services/auth";
import { createCipher } from "../services/crypto";
import type { PasswordHasher } from "../services/password";
import { FakeGitHub } from "./fake-github";

/** Stands in for Argon2 where a test is not about hashing, to keep the suite fast. */
export const fastHasher: PasswordHasher = {
  hash: async (password) => `plain:${password}`,
  verify: async (password, hash) => hash === `plain:${password}`,
};

export interface Harness {
  app: App;
  deps: Deps;
  github: FakeGitHub;
  clock: { now: number; advance(ms: number): void };
  /** Every delay the app asked for, in order. Nothing actually waits. */
  sleeps: number[];
  /** Calls the API, sending and remembering the session cookie like a browser would. */
  request(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<Response>;
  /** Forgets the stored cookie. */
  signOutLocally(): void;
  cookie(): string | undefined;
  cleanup(): Promise<void>;
}

export async function createHarness(
  kind: DbKind = "sqlite",
  overrides: Partial<Config> & { hasher?: PasswordHasher } = {},
): Promise<Harness> {
  const database: TestDatabase = await createTestDb(kind);
  const github = new FakeGitHub();
  const clock = {
    now: Date.parse("2026-10-05T12:00:00Z"),
    advance(ms: number) {
      this.now += ms;
    },
  };
  const { hasher, ...configOverrides } = overrides;
  const config: Config = {
    databaseUrl: ":memory:",
    dataDir: "./data",
    host: "127.0.0.1",
    port: 0,
    secretKey: undefined,
    setupToken: undefined,
    trustProxy: false,
    cookieSecure: "auto",
    githubApiUrl: github.apiUrl,
    webDist: undefined,
    ...configOverrides,
  };
  const sleeps: number[] = [];
  const deps: Deps = {
    conn: database,
    config,
    cipher: await createCipher("test-secret-key-that-is-long-enough-123"),
    hasher: hasher ?? fastHasher,
    now: () => clock.now,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    fetch: github.fetch,
    instanceId: "test-instance",
    remoteAddress: () => "198.51.100.7",
    logger: silentLogger,
  };
  const app = createApp(deps);
  let cookie: string | undefined;

  return {
    app,
    deps,
    github,
    clock,
    sleeps,
    async request(method, path, payload, headers = {}) {
      const response = await app.request(`http://mewte.test${path}`, {
        method,
        headers: {
          ...(payload === undefined ? {} : { "content-type": "application/json" }),
          ...(cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {}),
          ...headers,
        },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
      for (const value of response.headers.getSetCookie()) {
        const match = new RegExp(`^${SESSION_COOKIE}=([^;]*)`).exec(value);
        if (match) cookie = match[1] || undefined;
      }
      return response;
    },
    signOutLocally() {
      cookie = undefined;
    },
    cookie: () => cookie,
    cleanup: () => database.cleanup(),
  };
}

export const OWNER = { username: "admin", password: "correct horse battery" };
export const VALID_TOKEN = "ghp_valid_token_0000000000";

/** Creates the owner (which also signs in). */
export async function setUp(harness: Harness): Promise<void> {
  const response = await harness.request("POST", "/api/setup", OWNER);
  if (response.status !== 200) throw new Error(`setup failed: ${await response.text()}`);
}

export async function body<T = any>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

import { DEFAULT_DATABASE_URL } from "@mewte/db";
import { z } from "zod";

const flag = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((value) => value === "true" || value === "1");

const blankAsUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const configSchema = z.object({
  DATABASE_URL: z.preprocess(blankAsUndefined, z.string().default(DEFAULT_DATABASE_URL)),
  DATA_DIR: z.preprocess(blankAsUndefined, z.string().default("./data")),
  HOST: z.preprocess(blankAsUndefined, z.string().default("0.0.0.0")),
  PORT: z.preprocess(blankAsUndefined, z.coerce.number().int().min(1).max(65535).default(3000)),
  SECRET_KEY: z.preprocess(blankAsUndefined, z.string().min(32).optional()),
  SETUP_TOKEN: z.preprocess(blankAsUndefined, z.string().min(1).optional()),
  TRUST_PROXY: flag,
  COOKIE_SECURE: z.preprocess(blankAsUndefined, z.enum(["auto", "true", "false"]).default("auto")),
  GITHUB_API_URL: z.preprocess(blankAsUndefined, z.url().default("https://api.github.com")),
  WEB_DIST: z.preprocess(blankAsUndefined, z.string().optional()),
});

export interface Config {
  databaseUrl: string;
  dataDir: string;
  host: string;
  port: number;
  secretKey: string | undefined;
  setupToken: string | undefined;
  trustProxy: boolean;
  cookieSecure: "auto" | "true" | "false";
  githubApiUrl: string;
  webDist: string | undefined;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid configuration:\n  ${problems.join("\n  ")}`);
  }
  const value = parsed.data;
  return {
    databaseUrl: value.DATABASE_URL,
    dataDir: value.DATA_DIR,
    host: value.HOST,
    port: value.PORT,
    secretKey: value.SECRET_KEY,
    setupToken: value.SETUP_TOKEN,
    trustProxy: value.TRUST_PROXY,
    cookieSecure: value.COOKIE_SECURE,
    githubApiUrl: value.GITHUB_API_URL.replace(/\/+$/, ""),
    webDist: value.WEB_DIST,
  };
}

import type { Kysely } from "kysely";

export type DbKind = "sqlite" | "postgres" | "mysql";

/**
 * Column conventions that keep the three dialects interchangeable:
 * ids are app-generated strings, timestamps are epoch milliseconds, booleans are 0/1,
 * JSON is stored as text, and every key or indexed string is a bounded varchar.
 * Columns are snake_case in the database; CamelCasePlugin maps them.
 */
export interface UsersTable {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: number;
  updatedAt: number;
}

export interface SessionsTable {
  id: string;
  userId: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
}

export interface TotpTable {
  userId: string;
  secretEnc: string;
  enabled: number;
  lastUsedStep: number | null;
  createdAt: number;
}

export interface RecoveryCodesTable {
  id: string;
  userId: string;
  codeHash: string;
  usedAt: number | null;
}

export interface LoginAttemptsTable {
  bucket: string;
  windowStart: number;
  attempts: number;
}

export interface GithubAccountsTable {
  id: string;
  githubId: number;
  login: string;
  avatarUrl: string;
  tokenEnc: string;
  scopes: string;
  intervalSec: number;
  enabled: number;
  status: string;
  lastError: string | null;
  lastModified: string | null;
  pollIntervalSec: number | null;
  nextRunAt: number;
  lastRunAt: number | null;
  lockUntil: number | null;
  lockOwner: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface RulesTable {
  id: string;
  name: string;
  enabled: number;
  priority: number;
  accountScope: string;
  conditionJson: string;
  action: string;
  createdAt: number;
  updatedAt: number;
}

export interface HistoryTable {
  id: string;
  accountId: string;
  accountLogin: string;
  threadId: string;
  title: string;
  repo: string;
  subjectType: string;
  reason: string;
  url: string;
  ruleId: string | null;
  ruleName: string;
  processedAt: number;
}

export interface RunLogsTable {
  id: string;
  accountId: string;
  accountLogin: string;
  triggerType: string;
  status: string;
  fetched: number;
  matched: number;
  processed: number;
  errors: string;
  startedAt: number;
  finishedAt: number;
}

export interface SettingsTable {
  name: string;
  value: string;
}

export interface SubjectCacheTable {
  cacheKey: string;
  payload: string;
  expiresAt: number;
}

export interface DB {
  users: UsersTable;
  sessions: SessionsTable;
  totp: TotpTable;
  recoveryCodes: RecoveryCodesTable;
  loginAttempts: LoginAttemptsTable;
  githubAccounts: GithubAccountsTable;
  rules: RulesTable;
  history: HistoryTable;
  runLogs: RunLogsTable;
  settings: SettingsTable;
  subjectCache: SubjectCacheTable;
}

/** A database handle plus the dialect it talks to. Transactions use the same shape. */
export interface Conn {
  db: Kysely<DB>;
  kind: DbKind;
}

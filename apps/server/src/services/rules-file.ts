import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  type Conn,
  type DbKind,
  deleteRule,
  insertRule,
  listAccounts,
  listRules,
  resetPollMarkers,
  transaction,
  updateRule,
} from "@mewte/db";
import type { Rule, RuleInput, RulesSource, RulesSourceProblem } from "@mewte/shared";
import type { Logger } from "../deps";
import { newId } from "./crypto";
import type { Document } from "yaml";
import { parseRulesFile, serializeRules, withAssignedIds } from "./rules-format";

/** Keeps a YAML file and the stored rules in step, in both directions. */
export interface RulesFile {
  status(): RulesSource;
  /**
   * Applies the file if its content is new, and creates it from the stored rules if it is
   * missing. `force` re-reads content that was already rejected, for when what made it
   * invalid (a missing account) may have changed.
   */
  sync(options?: { force?: boolean }): Promise<void>;
  /** Rewrites the file from the stored rules, after one of them changed through the API. */
  save(): Promise<void>;
  /** Syncs once, then keeps watching the file. Returns a function that stops watching. */
  start(): Promise<() => void>;
}

interface Options {
  conn: Conn;
  now: () => number;
  logger: Logger;
  /** Absolute path of the file, or undefined to turn the feature off. */
  path: string | undefined;
  pollMs?: number;
}

/** Where the rules file lives: RULES_FILE if set, otherwise next to a SQLite database. */
export function resolveRulesFilePath(
  configured: string | undefined,
  kind: DbKind,
  dataDir: string,
): string | undefined {
  if (configured?.toLowerCase() === "off") return undefined;
  if (configured) return resolve(configured);
  // A shared PostgreSQL or MySQL database may serve several instances, each with its own disk.
  return kind === "sqlite" ? resolve(join(dataDir, "rules.yaml")) : undefined;
}

const hashOf = (text: string) => createHash("sha256").update(text).digest("hex");

/** Flags the file leaves out when they are off, so `false` and absent mean the same rule. */
const OPTIONAL_FLAGS = new Set(["negate", "caseSensitive"]);

/** Stable text for comparing two rules regardless of key order and of flags that are off. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key, item]) => item !== undefined && !(item === false && OPTIONAL_FLAGS.has(key)))
      .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function inputOf(rule: Rule): RuleInput {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = rule;
  return input;
}

/** What loading a file would do to the stored rules. */
export interface RulesPlan {
  added: { index: number; id: string | undefined; input: RuleInput }[];
  updated: { id: string; input: RuleInput; previous: Rule }[];
  removed: Rule[];
  unchanged: Rule[];
}

export type RulesCheck =
  | { ok: true; plan: RulesPlan; document: Document.Parsed }
  | { ok: false; problems: RulesSourceProblem[] };

/**
 * Validates the text of a rules file against the stored rules and connected accounts, and
 * works out what applying it would change. Reads the database; changes nothing.
 */
export async function checkRulesText(conn: Conn, text: string): Promise<RulesCheck> {
  const [stored, accounts] = await Promise.all([listRules(conn), listAccounts(conn)]);
  const known = new Set(accounts.map((account) => account.id));
  // Accounts that were disconnected but are still named by a rule.
  const stale = new Set(
    stored.flatMap((rule) =>
      rule.accountScope.type === "accounts"
        ? rule.accountScope.accountIds.filter((id) => !known.has(id))
        : [],
    ),
  );

  const parsed = parseRulesFile(
    text,
    accounts.map((account) => ({ id: account.id, login: account.login })),
    stale,
  );
  if (!parsed.ok) return parsed;

  const byId = new Map(stored.map((rule) => [rule.id, rule]));
  const plan: RulesPlan = { added: [], updated: [], removed: [], unchanged: [] };
  const kept = new Set<string>();
  for (const rule of parsed.rules) {
    const existing = rule.id === undefined ? undefined : byId.get(rule.id);
    if (!existing) {
      plan.added.push(rule);
      continue;
    }
    kept.add(existing.id);
    if (canonical(inputOf(existing)) === canonical(rule.input)) plan.unchanged.push(existing);
    else plan.updated.push({ id: existing.id, input: rule.input, previous: existing });
  }
  plan.removed = stored.filter((rule) => !kept.has(rule.id));
  return { ok: true, plan, document: parsed.document };
}

async function readText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function writeText(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  try {
    // Replace the file in one step so a reader never sees half of it.
    await writeFile(temporary, text);
    await rename(temporary, path);
  } catch {
    // A file mounted on its own into a container cannot be replaced, only written in place.
    await unlink(temporary).catch(() => {});
    await writeFile(path, text);
  }
}

export function createRulesFile({ conn, now, logger, path, pollMs = 1000 }: Options): RulesFile {
  /** Hash of the file content that was last applied, written or rejected. */
  let handled: string | undefined;
  let syncedAt: number | null = null;
  let problems: RulesSourceProblem[] = [];
  /** One operation at a time: a save must not interleave with a load. */
  let queue: Promise<void> = Promise.resolve();

  const enqueue = (task: () => Promise<void>): Promise<void> => {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  };

  const accountsForFile = async () =>
    (await listAccounts(conn)).map((account) => ({ id: account.id, login: account.login }));

  async function writeFromDatabase(file: string): Promise<void> {
    const text = serializeRules(await listRules(conn), await accountsForFile());
    await writeText(file, text);
    handled = hashOf(text);
    syncedAt = now();
    problems = [];
  }

  async function apply(file: string, text: string): Promise<void> {
    const checked = await checkRulesText(conn, text);
    if (!checked.ok) {
      problems = checked.problems;
      handled = hashOf(text);
      logger.warn(
        `Rules file ${file} was not applied: ${checked.problems
          .map((problem) => (problem.line ? `line ${problem.line}: ` : "") + problem.message)
          .join("; ")}`,
      );
      return;
    }

    const { plan } = checked;
    const assigned = new Map<number, string>();
    const changes = plan.added.length + plan.updated.length + plan.removed.length;
    const timestamp = now();

    await transaction(conn, async (trx) => {
      for (const rule of plan.added) {
        const id = rule.id ?? newId();
        if (rule.id === undefined) assigned.set(rule.index, id);
        await insertRule(trx, id, rule.input, timestamp);
      }
      for (const rule of plan.updated) await updateRule(trx, rule.id, rule.input, timestamp);
      for (const rule of plan.removed) await deleteRule(trx, rule.id);
      // Rules decide what a poll does, so the next poll must look at every notification again.
      if (changes > 0) await resetPollMarkers(trx);
    });

    problems = [];
    syncedAt = timestamp;
    handled = hashOf(text);
    if (assigned.size > 0) {
      // New rules need their id in the file, or the next load would create them again.
      const withIds = withAssignedIds(checked.document, assigned);
      await writeText(file, withIds);
      handled = hashOf(withIds);
    }
    if (changes > 0) logger.info(`Applied ${changes} rule change(s) from ${file}`);
  }

  async function sync(force: boolean): Promise<void> {
    if (!path) return;
    try {
      const text = await readText(path);
      if (text === undefined) {
        await writeFromDatabase(path);
        return;
      }
      if (!force && hashOf(text) === handled) return;
      await apply(path, text);
    } catch (error) {
      problems = [{ message: `Could not sync the rules file: ${String(error)}`, line: null }];
      logger.error(`Could not sync the rules file ${path}`, error);
    }
  }

  async function save(): Promise<void> {
    if (!path) return;
    try {
      const current = await readText(path);
      if (current !== undefined && (hashOf(current) !== handled || problems.length > 0)) {
        // Edits that were never applied are about to be replaced; keep a copy of them.
        await writeFile(`${path}.bak`, current);
        logger.warn(`Rules file ${path} had unapplied edits; they were saved to ${path}.bak`);
      }
      await writeFromDatabase(path);
    } catch (error) {
      problems = [{ message: `Could not write the rules file: ${String(error)}`, line: null }];
      logger.error(`Could not write the rules file ${path}`, error);
    }
  }

  return {
    status: () => ({ enabled: path !== undefined, path: path ?? null, syncedAt, problems }),
    sync: (options) => enqueue(() => sync(options?.force ?? false)),
    save: () => enqueue(save),
    async start() {
      if (!path) return () => {};
      await enqueue(() => sync(false));
      logger.info(`Rules are synced with ${path}`);

      // Polling instead of file events: events do not arrive reliably for mounted directories.
      let seen: string | undefined;
      let settled = true;
      const timer = setInterval(() => {
        void (async () => {
          let signature: string | undefined;
          try {
            const info = await stat(path);
            signature = `${info.mtimeMs}:${info.size}`;
          } catch {
            signature = undefined;
          }
          if (signature !== seen) {
            // Wait until an editor has finished writing: act once the file stops changing.
            seen = signature;
            settled = false;
            return;
          }
          if (settled) return;
          settled = true;
          await enqueue(() => sync(false));
        })();
      }, pollMs);
      return () => clearInterval(timer);
    },
  };
}

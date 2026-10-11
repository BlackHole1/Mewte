// Must come first: it teaches zod the `.openapi()` method, which the shared schemas need to
// have by the time the routes use them, whichever module happens to load them.
import "@hono/zod-openapi";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { type Conn, createDb, parseDatabaseUrl } from "@mewte/db";
import { loadConfig } from "./config";
import { checkRulesText } from "./services/rules-file";

const USAGE = `Usage: mewte <command>

Commands:
  validate-rules <file>   Check a rules file and show what replacing the live one with it would
                          change. Reads the database, changes nothing. Exits with 0 when the
                          file is valid, 1 when it is not.

Without a command, Mewte starts the server.`;

type Write = (line: string) => void;

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** Prints the verdict on a rules file. Returns the exit code. */
export async function validateRules(conn: Conn, file: string, write: Write): Promise<number> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    write(`Cannot read ${file}: ${(error as Error).message}`);
    return 2;
  }

  const checked = await checkRulesText(conn, text);
  if (!checked.ok) {
    write(`${file} is NOT valid: ${plural(checked.problems.length, "problem")}.`);
    for (const problem of checked.problems) {
      write(`  ${problem.line === null ? "" : `line ${problem.line}: `}${problem.message}`);
    }
    write("Nothing was changed. Fix the problems and run the command again.");
    return 1;
  }

  const { added, updated, removed, unchanged } = checked.plan;
  const total = added.length + updated.length + unchanged.length;
  write(`${file} is valid: ${plural(total, "rule")}.`);
  if (added.length + updated.length + removed.length === 0) {
    write("It describes the rules exactly as they are stored now.");
    return 0;
  }
  write("Replacing the live rules file with it would:");
  for (const rule of added) write(`  add     ${rule.input.name}`);
  for (const rule of updated) {
    const renamed = rule.previous.name === rule.input.name ? "" : ` (was: ${rule.previous.name})`;
    write(`  change  ${rule.input.name}${renamed}`);
  }
  for (const rule of removed) write(`  remove  ${rule.name}`);
  if (unchanged.length > 0) write(`  keep    ${plural(unchanged.length, "rule")} unchanged`);
  return 0;
}

/**
 * Runs a command given on the command line. Returns its exit code, or undefined when there
 * is no command and the server should start.
 */
export async function runCli(
  args: readonly string[],
  env: Record<string, string | undefined>,
  write: Write = (line) => console.log(line),
): Promise<number | undefined> {
  const [command, ...rest] = args;
  if (command === undefined) return undefined;
  if (command === "--help" || command === "-h" || command === "help") {
    write(USAGE);
    return 0;
  }
  if (command !== "validate-rules" || rest.length !== 1) {
    write(USAGE);
    return 2;
  }

  const config = loadConfig(env);
  const target = parseDatabaseUrl(config.databaseUrl);
  if (target.kind === "sqlite" && target.target !== ":memory:" && !existsSync(target.target)) {
    // Opening it would create an empty database, and there is nothing to compare with anyway.
    write(
      `No database at ${target.target}. Run this command where Mewte runs, with the same environment.`,
    );
    return 2;
  }
  const database = createDb(config.databaseUrl);
  try {
    return await validateRules(database, rest[0]!, write);
  } catch (error) {
    write(`Could not read the database: ${(error as Error).message}`);
    return 2;
  } finally {
    await database.destroy();
  }
}

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listRules } from "@mewte/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli, validateRules } from "./cli";
import { type Harness, createHarness, setUp } from "./testing/harness";

const rule = (name: string, extra = "") => `  - name: ${name}
${extra}    condition:
      type: group
      op: and
      children:
        - type: leaf
          field: repo
          operator: matches
          value: [acme/*]
`;

describe("validate-rules", () => {
  let h: Harness;
  let dir: string;
  let live: string;
  let copy: string;
  let output: string[];

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "mewte-cli-"));
    live = join(dir, "rules.yaml");
    copy = join(dir, "rules.new.yaml");
    output = [];
    h = await createHarness("sqlite", { rulesFilePath: live });
    await setUp(h);
    writeFileSync(live, `rules:\n${rule("Keep")}${rule("Rename me")}${rule("Drop me")}`);
    await h.deps.rulesFile.sync();
  });

  afterEach(async () => {
    await h.cleanup();
    rmSync(dir, { recursive: true, force: true });
  });

  const validate = () => validateRules(h.deps.conn, copy, (line) => output.push(line));
  const idOf = async (name: string) =>
    (await listRules(h.deps.conn)).find((stored) => stored.name === name)!.id;

  it("accepts a copy that changes nothing", async () => {
    writeFileSync(copy, readFileSync(live, "utf8"));
    expect(await validate()).toBe(0);
    expect(output.join("\n")).toContain("exactly as they are stored now");
  });

  it("lists what replacing the live file would add, change and remove", async () => {
    const before = await listRules(h.deps.conn);
    writeFileSync(
      copy,
      `rules:\n${rule("Keep", `    id: ${await idOf("Keep")}\n`)}${rule("Renamed", `    id: ${await idOf("Rename me")}\n`)}${rule("Brand new")}`,
    );

    expect(await validate()).toBe(0);
    expect(output).toEqual([
      `${copy} is valid: 3 rules.`,
      "Replacing the live rules file with it would:",
      "  add     Brand new",
      "  change  Renamed (was: Rename me)",
      "  remove  Drop me",
      "  keep    1 rule unchanged",
    ]);
    // Looking is all it does.
    expect(await listRules(h.deps.conn)).toEqual(before);
  });

  it("reports every problem with its line and fails", async () => {
    writeFileSync(copy, `rules:\n${rule("Broken").replace("operator: matches", "operator: in")}`);
    expect(await validate()).toBe(1);
    expect(output[0]).toBe(`${copy} is NOT valid: 1 problem.`);
    expect(output[1]).toBe(
      "  line 9: rules[0].condition.children[0].operator: Field repo takes one of these operators: matches, not_matches",
    );
  });

  it("fails on a file it cannot read", async () => {
    expect(await validate()).toBe(2);
    expect(output[0]).toContain("Cannot read");
  });
});

describe("command line", () => {
  const run = async (args: string[], env: Record<string, string> = {}) => {
    const output: string[] = [];
    const code = await runCli(args, env, (line) => output.push(line));
    return { code, text: output.join("\n") };
  };

  it("starts the server when there is no command", async () => {
    expect((await run([])).code).toBeUndefined();
  });

  it("explains itself", async () => {
    expect(await run(["--help"])).toMatchObject({
      code: 0,
      text: expect.stringContaining("validate-rules <file>"),
    });
    expect((await run(["frobnicate"])).code).toBe(2);
    expect((await run(["validate-rules"])).code).toBe(2);
  });

  it("does not create a database that is not there", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mewte-cli-"));
    const database = join(dir, "missing.db");
    const result = await run(["validate-rules", join(dir, "rules.yaml")], {
      DATABASE_URL: `sqlite://${database}`,
    });
    expect(result.code).toBe(2);
    expect(result.text).toContain("No database at");
    expect(existsSync(database)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });
});

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { listRules } from "@mewte/db";
import { testDialects } from "@mewte/db/testing";
import type { Rule, RulesSource } from "@mewte/shared";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type Harness, VALID_TOKEN, body, createHarness, setUp } from "../testing/harness";
import { resolveRulesFilePath } from "./rules-file";
import { parseRulesFile, serializeRules } from "./rules-format";

const ACCOUNTS = [{ id: "acc-1", login: "octocat" }];

const leaf = (field: string, operator: string, value: unknown) => ({
  type: "leaf",
  field,
  operator,
  value,
});

const RULE_INPUT = {
  name: "Merged pull requests",
  enabled: true,
  priority: 10,
  accountScope: { type: "all" },
  condition: { type: "group", op: "and", children: [leaf("state", "in", ["merged"])] },
  action: "mark_done",
};

const BOTS = `
rules:
  # Dependency bots are noise.
  - name: Bots
    condition:
      type: group
      op: or
      children:
        - type: leaf
          field: author_is_bot
          operator: is
          value: true
`;

describe("rules file format", () => {
  it("fills in the optional keys", () => {
    const parsed = parseRulesFile(BOTS, ACCOUNTS);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rules).toHaveLength(1);
    expect(parsed.rules[0]!.id).toBeUndefined();
    expect(parsed.rules[0]!.input).toMatchObject({
      name: "Bots",
      enabled: true,
      priority: 100,
      accountScope: { type: "all" },
      action: "mark_done",
    });
  });

  it("writes what it can read back unchanged", () => {
    const rule: Rule = {
      id: "0198c0de-0000-7000-8000-000000000001",
      name: "Nested: with a colon",
      enabled: false,
      priority: 20,
      accountScope: { type: "accounts", accountIds: ["acc-1"] },
      condition: {
        type: "group",
        op: "and",
        children: [
          { type: "leaf", field: "repo", operator: "matches", value: ["acme/*", "octo/docs"] },
          {
            type: "group",
            op: "or",
            negate: true,
            children: [
              { type: "leaf", field: "label", operator: "any", value: ["security"] },
              {
                type: "leaf",
                field: "title",
                operator: "regex",
                value: "^chore\\(deps\\): #\\d+",
                caseSensitive: true,
              },
            ],
          },
        ],
      },
      action: "mark_done",
      createdAt: 1,
      updatedAt: 2,
    };
    const text = serializeRules([rule], ACCOUNTS);
    expect(text).toContain("accounts: [octocat]");
    expect(text).toContain("value: [acme/*, octo/docs]");

    const parsed = parseRulesFile(text, ACCOUNTS);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { id, createdAt: _c, updatedAt: _u, ...input } = rule;
    expect(parsed.rules[0]!.id).toBe(id);
    expect(parsed.rules[0]!.input).toEqual(input);
  });

  it("keeps the scope of a rule whose account was disconnected", () => {
    const text = serializeRules(
      [
        {
          ...(RULE_INPUT as unknown as Rule),
          id: "r1",
          accountScope: { type: "accounts", accountIds: ["gone"] },
        },
      ],
      ACCOUNTS,
    );
    expect(parseRulesFile(text, ACCOUNTS).ok).toBe(false);
    const parsed = parseRulesFile(text, ACCOUNTS, new Set(["gone"]));
    expect(parsed.ok && parsed.rules[0]!.input.accountScope).toEqual({
      type: "accounts",
      accountIds: ["gone"],
    });
  });

  const problemsOf = (text: string) => {
    const parsed = parseRulesFile(text, ACCOUNTS);
    return parsed.ok ? [] : parsed.problems;
  };

  it.each([
    ["broken YAML", "rules:\n  - name: [unclosed\n", 3, /flow/i],
    ["an empty file", "# nothing yet\n", null, /empty/],
    ["a missing rules list", "rule: []\n", 1, /^rule: Unknown key/],
    [
      "an unknown key",
      BOTS.replace("  - name: Bots", "  - name: Bots\n    enable: false"),
      5,
      /^rules\[0\]\.enable: Unknown key/,
    ],
    [
      "an unknown field",
      BOTS.replace("field: author_is_bot", "field: bot"),
      10,
      /rules\[0\]\.condition\.children\[0\]\.field: Unknown field/,
    ],
    [
      "an operator of another field",
      BOTS.replace("operator: is", "operator: matches"),
      11,
      /Field author_is_bot takes one of these operators: is/,
    ],
    ["a value of the wrong kind", BOTS.replace("value: true", "value: [yes]"), 12, /true or false/],
    [
      "a group without children",
      BOTS.replace(/children:[\s\S]*$/, "children: []\n"),
      8,
      /at least 1/,
    ],
    [
      "an account that is not connected",
      BOTS.replace("  - name: Bots", "  - name: Bots\n    accounts: [hubot]"),
      5,
      /No connected GitHub account is named hubot/,
    ],
    [
      "a repeated id",
      `${BOTS.replace("  - name: Bots", "  - id: same\n    name: Bots")}${BOTS.replace("rules:", "").replace("  - name: Bots", "  - id: same\n    name: Bots again")}`,
      17,
      /used by an earlier rule/,
    ],
  ])("rejects %s and says where", (_name, text, line, message) => {
    const problem = problemsOf(text).find((candidate) => message.test(candidate.message));
    expect(problem).toBeDefined();
    expect(problem!.line).toBe(line);
  });
});

describe("llms.txt", () => {
  const text = readFileSync(
    fileURLToPath(new URL("../../../web/public/llms.txt", import.meta.url)),
    "utf8",
  );

  // Loaded late: the schemas of the shared package must be created after the app has
  // extended zod, which the static import of the harness takes care of.
  let shared: typeof import("@mewte/shared");
  beforeAll(async () => {
    shared = await import("@mewte/shared");
  });

  it("names every field, operator and known value", () => {
    const {
      CONDITION_FIELDS,
      FIELD_OPERATORS,
      KNOWN_REASONS,
      KNOWN_SUBJECT_TYPES,
      SUBJECT_STATES,
    } = shared;
    const words = [
      ...CONDITION_FIELDS,
      ...Object.values(FIELD_OPERATORS).flat(),
      ...KNOWN_REASONS,
      ...KNOWN_SUBJECT_TYPES,
      ...SUBJECT_STATES,
    ];
    expect(words.filter((word) => !text.includes(`\`${word}\``))).toEqual([]);
  });

  it("lists the operators of each field as the schema defines them", () => {
    const { CONDITION_FIELDS, FIELD_OPERATORS } = shared;
    for (const field of CONDITION_FIELDS) {
      const row = text.split("\n").find((line) => line.startsWith(`| \`${field}\` |`));
      expect(row, field).toBeDefined();
      const operators = row!
        .split("|")[3]!
        .match(/`([a-z_]+)`/g)!
        .map((cell) => cell.slice(1, -1));
      expect(operators, field).toEqual([...FIELD_OPERATORS[field]]);
    }
  });

  it("tells the reader to validate a copy before replacing the live file", () => {
    expect(text).toContain("rules.new.yaml");
    expect(text).toContain("mewte validate-rules /config/rules.new.yaml");
    expect(text).toContain("mv rules.new.yaml rules.yaml");
  });

  it("shows examples that load", () => {
    const blocks = [...text.matchAll(/```yaml\n([\s\S]*?)```/g)].map((match) => match[1]!);
    const files = blocks.filter((block) => block.startsWith("rules:"));
    const fragments = blocks.filter((block) => block.startsWith("  - name:"));
    expect(files.length).toBeGreaterThanOrEqual(2);
    expect(fragments.length).toBeGreaterThanOrEqual(1);
    for (const example of [...files, ...fragments.map((block) => `rules:\n${block}`)]) {
      const parsed = parseRulesFile(example, ACCOUNTS);
      expect(parsed.ok ? [] : parsed.problems).toEqual([]);
    }
  });
});

describe("resolveRulesFilePath", () => {
  it("defaults to the data directory with SQLite only", () => {
    expect(resolveRulesFilePath(undefined, "sqlite", "/data")).toBe("/data/rules.yaml");
    expect(resolveRulesFilePath(undefined, "postgres", "/data")).toBeUndefined();
    expect(resolveRulesFilePath(undefined, "mysql", "/data")).toBeUndefined();
  });

  it("follows RULES_FILE on every database and can be turned off", () => {
    expect(resolveRulesFilePath("/config/rules.yaml", "postgres", "/data")).toBe(
      "/config/rules.yaml",
    );
    expect(resolveRulesFilePath("off", "sqlite", "/data")).toBeUndefined();
  });
});

describe.each(testDialects())("rules file sync on %s", (kind) => {
  let h: Harness;
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "mewte-rules-"));
    file = join(dir, "rules.yaml");
    h = await createHarness(kind, { rulesFilePath: file });
    await setUp(h);
  });

  afterEach(async () => {
    await h.cleanup();
    rmSync(dir, { recursive: true, force: true });
  });

  const source = async () => body<RulesSource>(await h.request("GET", "/api/rules/source"));
  const stored = () => listRules(h.deps.conn);
  const read = () => readFileSync(file, "utf8");

  it("creates the file from the stored rules when it is missing", async () => {
    const created = await body<Rule>(await h.request("POST", "/api/rules", RULE_INPUT));
    rmSync(file);
    await h.deps.rulesFile.sync();

    expect(read()).toContain(`id: ${created.id}`);
    expect(read()).toContain("name: Merged pull requests");
    expect(await source()).toMatchObject({ enabled: true, path: file, problems: [] });
  });

  it("adds, changes and removes rules edited in the file", async () => {
    writeFileSync(file, BOTS);
    await h.deps.rulesFile.sync();
    let rules = await stored();
    expect(rules.map((rule) => rule.name)).toEqual(["Bots"]);
    const id = rules[0]!.id;

    // The id was written back without disturbing the comment.
    expect(read()).toContain(`id: ${id}`);
    expect(read()).toContain("# Dependency bots are noise.");

    writeFileSync(file, read().replace("name: Bots", "name: All bots\n    priority: 5"));
    await h.deps.rulesFile.sync();
    rules = await stored();
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ id, name: "All bots", priority: 5 });

    writeFileSync(file, "rules: []\n");
    await h.deps.rulesFile.sync();
    expect(await stored()).toEqual([]);
  });

  it("leaves the stored rules alone when the file is invalid", async () => {
    await h.request("POST", "/api/rules", RULE_INPUT);
    const before = await stored();

    writeFileSync(file, read().replace("field: state", "field: status"));
    await h.deps.rulesFile.sync();

    expect(await stored()).toEqual(before);
    const state = await source();
    expect(state.problems).toHaveLength(1);
    expect(state.problems[0]!.message).toContain("Unknown field");
    expect(state.problems[0]!.line).toBeGreaterThan(1);

    // Fixing the file clears the problem.
    writeFileSync(file, read().replace("field: status", "field: state"));
    await h.deps.rulesFile.sync();
    expect((await source()).problems).toEqual([]);
  });

  it("does not treat an emptied file as a request to delete every rule", async () => {
    await h.request("POST", "/api/rules", RULE_INPUT);
    writeFileSync(file, "");
    await h.deps.rulesFile.sync();

    expect(await stored()).toHaveLength(1);
    expect((await source()).problems[0]!.message).toContain("empty");
  });

  it("rewrites the file when a rule changes through the API", async () => {
    const created = await body<Rule>(await h.request("POST", "/api/rules", RULE_INPUT));
    expect(read()).toContain("name: Merged pull requests");

    await h.request("PUT", `/api/rules/${created.id}`, { ...RULE_INPUT, name: "Renamed" });
    expect(read()).toContain("name: Renamed");

    // Its own write is not loaded again as if someone had edited the file.
    const before = await stored();
    await h.deps.rulesFile.sync();
    expect(await stored()).toEqual(before);

    await h.request("DELETE", `/api/rules/${created.id}`);
    expect(read()).toContain("rules: []");
  });

  it("does not see a change in a rule the file merely writes more briefly", async () => {
    // The editor sends these flags as false; the file leaves them out.
    const created = await body<Rule>(
      await h.request("POST", "/api/rules", {
        ...RULE_INPUT,
        condition: {
          type: "group",
          op: "and",
          negate: false,
          children: [
            { ...leaf("title", "contains", "wip"), caseSensitive: false },
            { type: "group", op: "or", negate: false, children: [leaf("state", "in", ["open"])] },
          ],
        },
      }),
    );
    expect(read()).not.toContain("negate");
    expect(read()).not.toContain("caseSensitive");

    h.clock.advance(60_000);
    writeFileSync(file, `${read()}\n# a comment, nothing else\n`);
    await h.deps.rulesFile.sync();

    const [rule] = await stored();
    expect(rule!.updatedAt).toBe(created.updatedAt);
  });

  it("keeps a copy of unapplied edits before the API overwrites them", async () => {
    await h.request("POST", "/api/rules", RULE_INPUT);
    writeFileSync(file, "rules: [oops\n");
    await h.deps.rulesFile.sync();
    expect((await source()).problems).toHaveLength(1);

    await h.request("POST", "/api/rules", { ...RULE_INPUT, name: "Second" });
    expect(readFileSync(`${file}.bak`, "utf8")).toBe("rules: [oops\n");
    expect(read()).toContain("name: Second");
    expect((await source()).problems).toEqual([]);
  });

  it("names accounts by login and applies a waiting file once the account is connected", async () => {
    writeFileSync(file, BOTS.replace("  - name: Bots", "  - name: Bots\n    accounts: [octocat]"));
    await h.deps.rulesFile.sync();
    expect(await stored()).toEqual([]);
    expect((await source()).problems[0]!.message).toContain("octocat");

    const account = await body<{ id: string }>(
      await h.request("POST", "/api/accounts", { token: VALID_TOKEN }),
    );

    const rules = await stored();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.accountScope).toEqual({ type: "accounts", accountIds: [account.id] });
    expect((await source()).problems).toEqual([]);

    // Disconnecting the account keeps the rule, and the file stays loadable.
    await h.request("DELETE", `/api/accounts/${account.id}`);
    expect(read()).toContain(account.id);
    await h.deps.rulesFile.sync({ force: true });
    expect(await stored()).toHaveLength(1);
    expect((await source()).problems).toEqual([]);
  });

  it("makes the next poll look at every notification again", async () => {
    const account = await body<{ id: string }>(
      await h.request("POST", "/api/accounts", { token: VALID_TOKEN }),
    );
    await h.deps.conn.db
      .updateTable("githubAccounts")
      .set({ lastModified: "Mon, 05 Oct 2026 12:00:00 GMT" })
      .where("id", "=", account.id)
      .execute();

    writeFileSync(file, BOTS);
    await h.deps.rulesFile.sync();

    const row = await h.deps.conn.db
      .selectFrom("githubAccounts")
      .select("lastModified")
      .where("id", "=", account.id)
      .executeTakeFirstOrThrow();
    expect(row.lastModified).toBeNull();
  });
});

describe("rules file turned off", () => {
  it("reports that no file is in use and writes nothing", async () => {
    const h = await createHarness();
    await setUp(h);
    await h.request("POST", "/api/rules", RULE_INPUT);
    expect(await body(await h.request("GET", "/api/rules/source"))).toEqual({
      enabled: false,
      path: null,
      syncedAt: null,
      problems: [],
    });
    expect(existsSync("./data/rules.yaml")).toBe(false);
    await h.cleanup();
  });
});

import {
  CONDITION_FIELDS,
  FIELD_OPERATORS,
  MAX_CONDITION_DEPTH,
  RULE_ACTIONS,
  type Rule,
  type RuleInput,
  type RulesSourceProblem,
  conditionLeafSchema,
  conditionSchema,
  ruleInputSchema,
} from "@mewte/shared";
import {
  Document,
  LineCounter,
  type ParsedNode,
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  visit,
} from "yaml";
import { z } from "zod";

/** A connected GitHub account, as far as the rules file is concerned. */
export interface FileAccount {
  id: string;
  login: string;
}

/** A rule as written in the file: accounts by login, and an id only once Mewte has assigned one. */
export interface FileRule {
  id: string | undefined;
  /** Position in the `rules` list, to find the entry again when its id is written back. */
  index: number;
  input: RuleInput;
}

export type ParseResult =
  | { ok: true; rules: FileRule[]; document: Document.Parsed }
  | { ok: false; problems: RulesSourceProblem[] };

const DEFAULT_PRIORITY = 100;
const MAX_PROBLEMS = 20;

const fileRuleSchema = z.strictObject({
  id: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/, "Use letters, digits, - and _ only")
    .optional(),
  name: ruleInputSchema.shape.name,
  enabled: z.boolean().default(true),
  priority: ruleInputSchema.shape.priority.default(DEFAULT_PRIORITY),
  accounts: z
    .union([z.literal("all"), z.array(z.string().trim().min(1).max(100)).min(1).max(100)])
    .default("all"),
  condition: conditionSchema,
  action: z.enum(RULE_ACTIONS).default("mark_done"),
});

const rulesFileSchema = z.strictObject({ rules: z.array(fileRuleSchema).max(1000) });

type Path = (string | number)[];

function pathText(path: Path): string {
  return path.reduce<string>(
    (text, part) =>
      typeof part === "number" ? `${text}[${part}]` : text ? `${text}.${part}` : part,
    "",
  );
}

const oneOf = (values: readonly string[]) => values.join(", ");

/**
 * Explains what is wrong with a condition tree in the words of someone editing the file.
 * The schema alone only says "invalid input" at the outermost node, which does not help.
 */
function conditionProblems(
  node: unknown,
  path: Path,
  depth: number,
): { path: Path; message: string }[] {
  if (typeof node !== "object" || node === null || Array.isArray(node)) {
    return [{ path, message: "Expected a condition: a group or a leaf" }];
  }
  const record = node as Record<string, unknown>;

  if (record.type === "group") {
    const problems: { path: Path; message: string }[] = [];
    if (depth > MAX_CONDITION_DEPTH) {
      return [{ path, message: `Groups are nested deeper than ${MAX_CONDITION_DEPTH} levels` }];
    }
    if (record.op !== "and" && record.op !== "or") {
      problems.push({ path: [...path, "op"], message: "`op` must be `and` or `or`" });
    }
    if (record.negate !== undefined && typeof record.negate !== "boolean") {
      problems.push({ path: [...path, "negate"], message: "`negate` must be true or false" });
    }
    if (!Array.isArray(record.children) || record.children.length === 0) {
      problems.push({
        path: [...path, "children"],
        message: "`children` must list at least 1 condition",
      });
    } else {
      record.children.forEach((child, index) => {
        problems.push(...conditionProblems(child, [...path, "children", index], depth + 1));
      });
    }
    return problems;
  }

  if (record.type === "leaf") {
    const field = record.field;
    if (typeof field !== "string" || !(CONDITION_FIELDS as readonly string[]).includes(field)) {
      return [
        {
          path: [...path, "field"],
          message: `Unknown field. Use one of: ${oneOf(CONDITION_FIELDS)}`,
        },
      ];
    }
    const operators: readonly string[] = FIELD_OPERATORS[field as keyof typeof FIELD_OPERATORS];
    if (typeof record.operator !== "string" || !operators.includes(record.operator)) {
      return [
        {
          path: [...path, "operator"],
          message: `Field ${field} takes one of these operators: ${oneOf(operators)}`,
        },
      ];
    }
    const parsed = conditionLeafSchema.safeParse(record);
    if (parsed.success) return [];
    // Every variant of the union failed; the one for this field and operator fails on `value`.
    return [{ path: [...path, "value"], message: valueHint(field) }];
  }

  return [{ path: [...path, "type"], message: "`type` must be `group` or `leaf`" }];
}

function valueHint(field: string): string {
  switch (field) {
    case "title":
      return "`value` must be a non-empty string; with a regex operator it must be a valid regular expression";
    case "actor_is_bot":
    case "author_is_bot":
      return "`value` must be true or false";
    case "state":
      return "`value` must be a list with at least 1 of: open, closed, merged, draft, answered";
    default:
      return "`value` must be a list with at least 1 non-empty string";
  }
}

/** Finds the line of the node at `path`, or of its closest ancestor that exists in the file. */
function lineOf(document: Document.Parsed, counter: LineCounter, path: Path): number | null {
  for (let length = path.length; length >= 0; length--) {
    const node = document.getIn(path.slice(0, length), true) as ParsedNode | undefined;
    const start = node?.range?.[0];
    if (start !== undefined) return counter.linePos(start).line;
  }
  return null;
}

/**
 * Reads a rules file. Accounts are written as GitHub logins and resolved against `accounts`;
 * `staleAccountIds` lets a rule keep pointing at an account that has since been disconnected.
 */
export function parseRulesFile(
  text: string,
  accounts: readonly FileAccount[],
  staleAccountIds: ReadonlySet<string> = new Set(),
): ParseResult {
  const counter = new LineCounter();
  const document = parseDocument(text, { lineCounter: counter, uniqueKeys: true });

  if (document.errors.length > 0) {
    return {
      ok: false,
      problems: document.errors.slice(0, MAX_PROBLEMS).map((error) => ({
        // The library appends a code frame after the first line; the line number says enough.
        message: error.message.split("\n")[0]!.replace(/ at line \d+, column \d+:?$/, ""),
        line: error.linePos?.[0].line ?? null,
      })),
    };
  }

  const data: unknown = document.toJS();
  if (data === null || data === undefined) {
    return {
      ok: false,
      problems: [
        {
          message: "The file is empty. To remove every rule, write `rules: []`",
          line: null,
        },
      ],
    };
  }

  const found: { path: Path; message: string }[] = [];
  const rawRules =
    typeof data === "object" && Array.isArray((data as { rules?: unknown }).rules)
      ? (data as { rules: unknown[] }).rules
      : [];
  rawRules.forEach((rule, index) => {
    if (typeof rule !== "object" || rule === null || !("condition" in rule)) return;
    const condition = (rule as { condition: unknown }).condition;
    const problems = conditionProblems(condition, ["rules", index, "condition"], 1);
    if (problems.length === 0 && (condition as { type?: unknown }).type !== "group") {
      problems.push({
        path: ["rules", index, "condition"],
        message: "The top-level condition must be a group",
      });
    }
    found.push(...problems);
  });

  const parsed = rulesFileSchema.safeParse(data);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path as Path;
      // Conditions were already explained above, in more useful words.
      if (path[0] === "rules" && path[2] === "condition") continue;
      if (issue.code === "unrecognized_keys") {
        // One problem per key, so each points at its own line.
        for (const key of issue.keys) found.push({ path: [...path, key], message: "Unknown key" });
        continue;
      }
      found.push({ path, message: issue.message });
    }
  }

  const rules: FileRule[] = [];
  if (parsed.success && found.length === 0) {
    const byLogin = new Map(accounts.map((account) => [account.login.toLowerCase(), account.id]));
    const seenIds = new Set<string>();
    parsed.data.rules.forEach((rule, index) => {
      if (rule.id !== undefined) {
        if (seenIds.has(rule.id)) {
          found.push({
            path: ["rules", index, "id"],
            message: "This id is used by an earlier rule. Remove the line to create a new rule",
          });
        }
        seenIds.add(rule.id);
      }

      let accountScope: RuleInput["accountScope"] = { type: "all" };
      if (rule.accounts !== "all") {
        const accountIds: string[] = [];
        rule.accounts.forEach((entry, entryIndex) => {
          const id =
            byLogin.get(entry.toLowerCase()) ?? (staleAccountIds.has(entry) ? entry : null);
          if (id === null) {
            found.push({
              path: ["rules", index, "accounts", entryIndex],
              message: `No connected GitHub account is named ${entry}`,
            });
          } else if (!accountIds.includes(id)) {
            accountIds.push(id);
          }
        });
        accountScope = { type: "accounts", accountIds };
      }

      rules.push({
        id: rule.id,
        index,
        input: {
          name: rule.name,
          enabled: rule.enabled,
          priority: rule.priority,
          accountScope,
          condition: rule.condition,
          action: rule.action,
        },
      });
    });
  }

  if (found.length > 0) {
    return {
      ok: false,
      problems: found.slice(0, MAX_PROBLEMS).map(({ path, message }) => ({
        message: path.length > 0 ? `${pathText(path)}: ${message}` : message,
        line: lineOf(document, counter, path),
      })),
    };
  }
  return { ok: true, rules, document };
}

/** Writes ids Mewte assigned into a parsed file, keeping the comments and layout around them. */
export function withAssignedIds(
  document: Document.Parsed,
  ids: ReadonlyMap<number, string>,
): string {
  const list = document.get("rules", true);
  if (isSeq(list)) {
    for (const [index, id] of ids) {
      const item = list.items[index];
      if (!isMap(item)) continue;
      // After the first key, so a comment written above the rule stays above it.
      item.items.splice(Math.min(1, item.items.length), 0, document.createPair("id", id));
    }
  }
  return document.toString({ lineWidth: 0, flowCollectionPadding: false });
}

const HEADER = `Mewte rules. Mewte loads this file when it changes, and rewrites it when a rule
is saved in the web interface (comments are lost then).
The format is described at /llms.txt on your Mewte instance.`;

type Plain = Record<string, unknown>;

/** Lays a condition out with its keys in a fixed, readable order. */
function conditionForFile(
  condition: Rule["condition"] | Rule["condition"]["children"][number],
): Plain {
  if (condition.type === "group") {
    return {
      type: "group",
      op: condition.op,
      ...(condition.negate ? { negate: true } : {}),
      children: condition.children.map(conditionForFile),
    };
  }
  return {
    type: "leaf",
    field: condition.field,
    operator: condition.operator,
    value: condition.value,
    ...("caseSensitive" in condition && condition.caseSensitive ? { caseSensitive: true } : {}),
  };
}

/** Renders rules as the file Mewte writes. Rules must already be in evaluation order. */
export function serializeRules(rules: readonly Rule[], accounts: readonly FileAccount[]): string {
  const logins = new Map(accounts.map((account) => [account.id, account.login]));
  const document = new Document({
    rules: rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      priority: rule.priority,
      accounts:
        rule.accountScope.type === "all"
          ? "all"
          : // A disconnected account has no login any more; its id keeps the rule's scope intact.
            rule.accountScope.accountIds.map((id) => logins.get(id) ?? id),
      condition: conditionForFile(rule.condition),
    })),
  });
  document.commentBefore = HEADER.split("\n")
    .map((line) => ` ${line}`)
    .join("\n");
  // A blank line between rules keeps a long file readable.
  const list = document.get("rules", true);
  if (isSeq(list)) {
    for (const item of list.items.slice(1)) if (isMap(item)) item.spaceBefore = true;
  }
  // Short lists of plain values read better on one line: `value: [closed, merged]`.
  visit(document, {
    Seq(_key, node) {
      if (node.items.length > 0 && node.items.every((item) => isScalar(item))) node.flow = true;
    },
  });
  return document.toString({ lineWidth: 0, flowCollectionPadding: false });
}

import type { SubjectState } from "../constants";
import type { Condition, ConditionLeaf } from "./schema";

export interface RuleUser {
  login: string;
  isBot: boolean;
}

/**
 * Everything a condition can look at. Optional fields are `undefined` when the data
 * has not been loaded or does not apply to the subject type.
 */
export interface RuleContext {
  repo: string;
  owner: string;
  reason: string;
  subjectType: string;
  title: string;
  actor?: RuleUser | undefined;
  author?: RuleUser | undefined;
  reviewers?: string[] | undefined;
  assignees?: string[] | undefined;
  commenters?: string[] | undefined;
  labels?: string[] | undefined;
  state?: SubjectState | undefined;
}

/** Three-valued result: `null` means the data needed to decide is missing. */
export type Tri = boolean | null;

/** Extra GitHub data a condition may need beyond the notification itself. */
export type DataNeed = "subject" | "actor" | "reviews" | "comments";

const globCache = new Map<string, RegExp>();

export function globToRegExp(pattern: string): RegExp {
  const cached = globCache.get(pattern);
  if (cached) return cached;
  const source = pattern
    .trim()
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  const regex = new RegExp(`^${source}$`, "i");
  if (globCache.size > 2000) globCache.clear();
  globCache.set(pattern, regex);
  return regex;
}

/** Case-insensitive match where `*` matches any run of characters. */
export function matchGlob(pattern: string, value: string): boolean {
  return globToRegExp(pattern).test(value);
}

function matchAny(patterns: readonly string[], value: string): boolean {
  return patterns.some((pattern) => matchGlob(pattern, value));
}

function not(value: Tri): Tri {
  return value === null ? null : !value;
}

function evaluateSet(
  operator: "any" | "all" | "none",
  patterns: readonly string[],
  members: readonly string[] | undefined,
): Tri {
  if (members === undefined) return null;
  switch (operator) {
    case "any":
      return members.some((member) => matchAny(patterns, member));
    case "all":
      return members.length > 0 && members.every((member) => matchAny(patterns, member));
    case "none":
      return !members.some((member) => matchAny(patterns, member));
  }
}

function evaluateTitle(leaf: Extract<ConditionLeaf, { field: "title" }>, title: string): Tri {
  const negate = leaf.operator === "not_contains" || leaf.operator === "not_regex";
  let result: boolean;
  if (leaf.operator === "contains" || leaf.operator === "not_contains") {
    result = leaf.caseSensitive
      ? title.includes(leaf.value)
      : title.toLowerCase().includes(leaf.value.toLowerCase());
  } else {
    try {
      result = new RegExp(leaf.value, leaf.caseSensitive ? "" : "i").test(title);
    } catch {
      return null;
    }
  }
  return negate ? !result : result;
}

export function evaluateLeaf(leaf: ConditionLeaf, ctx: RuleContext): Tri {
  switch (leaf.field) {
    case "repo": {
      const hit = matchAny(leaf.value, ctx.repo);
      return leaf.operator === "matches" ? hit : !hit;
    }
    case "owner": {
      const hit = matchAny(leaf.value, ctx.owner);
      return leaf.operator === "matches" ? hit : !hit;
    }
    case "reason": {
      const hit = matchAny(leaf.value, ctx.reason);
      return leaf.operator === "in" ? hit : !hit;
    }
    case "subject_type": {
      const hit = matchAny(leaf.value, ctx.subjectType);
      return leaf.operator === "in" ? hit : !hit;
    }
    case "actor":
    case "author": {
      const user = leaf.field === "actor" ? ctx.actor : ctx.author;
      if (user === undefined) return null;
      const hit = matchAny(leaf.value, user.login);
      return leaf.operator === "matches" ? hit : !hit;
    }
    case "reviewer":
      return evaluateSet(leaf.operator, leaf.value, ctx.reviewers);
    case "assignee":
      return evaluateSet(leaf.operator, leaf.value, ctx.assignees);
    case "commenter":
      return evaluateSet(leaf.operator, leaf.value, ctx.commenters);
    case "label":
      return evaluateSet(leaf.operator, leaf.value, ctx.labels);
    case "state": {
      if (ctx.state === undefined) return null;
      const hit = leaf.value.includes(ctx.state);
      return leaf.operator === "in" ? hit : !hit;
    }
    case "title":
      return evaluateTitle(leaf, ctx.title);
    case "actor_is_bot":
      return ctx.actor === undefined ? null : ctx.actor.isBot === leaf.value;
    case "author_is_bot":
      return ctx.author === undefined ? null : ctx.author.isBot === leaf.value;
  }
}

/**
 * Evaluates a condition tree with Kleene three-valued logic, so a branch whose data is
 * missing can never turn into a match by being negated. An empty group is undecided.
 */
export function evaluateCondition(condition: Condition, ctx: RuleContext): Tri {
  if (condition.type === "leaf") return evaluateLeaf(condition, ctx);
  if (condition.children.length === 0) return null;

  let sawUnknown = false;
  let result: Tri = condition.op === "and";
  for (const child of condition.children) {
    const value = evaluateCondition(child, ctx);
    if (value === null) {
      sawUnknown = true;
    } else if (condition.op === "and" && !value) {
      result = false;
      sawUnknown = false;
      break;
    } else if (condition.op === "or" && value) {
      result = true;
      sawUnknown = false;
      break;
    }
  }
  if (sawUnknown) result = null;
  return condition.negate ? not(result) : result;
}

/** A notification matches only when the condition is definitely true. */
export function matchesCondition(condition: Condition, ctx: RuleContext): boolean {
  return evaluateCondition(condition, ctx) === true;
}

const FIELD_NEEDS: Partial<Record<ConditionLeaf["field"], DataNeed[]>> = {
  actor: ["actor"],
  actor_is_bot: ["actor"],
  author: ["subject"],
  author_is_bot: ["subject"],
  assignee: ["subject"],
  label: ["subject"],
  state: ["subject"],
  reviewer: ["subject", "reviews"],
  commenter: ["comments"],
};

/** Lists the extra GitHub data a condition tree reads. */
export function requiredData(condition: Condition, into = new Set<DataNeed>()): Set<DataNeed> {
  if (condition.type === "leaf") {
    for (const need of FIELD_NEEDS[condition.field] ?? []) into.add(need);
  } else {
    for (const child of condition.children) requiredData(child, into);
  }
  return into;
}

export interface EvaluableRule {
  id: string;
  enabled: boolean;
  priority: number;
  condition: Condition;
}

/** Orders rules the way the runner applies them: lower priority number first. */
export function sortRules<T extends { priority: number; createdAt?: number; id: string }>(
  rules: readonly T[],
): T[] {
  return rules.toSorted(
    (a, b) =>
      a.priority - b.priority ||
      (a.createdAt ?? 0) - (b.createdAt ?? 0) ||
      a.id.localeCompare(b.id),
  );
}

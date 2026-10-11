import { describe, expect, it } from "vitest";
import {
  type RuleContext,
  evaluateCondition,
  evaluateLeaf,
  globToRegExp,
  matchGlob,
  matchesCondition,
  requiredData,
  sortRules,
} from "./engine";
import type { Condition, ConditionLeaf } from "./schema";

const base: RuleContext = {
  repo: "acme/widgets",
  owner: "acme",
  reason: "subscribed",
  subjectType: "PullRequest",
  title: "chore(deps): Bump lodash from 4.17.20 to 4.17.21",
};

const full: RuleContext = {
  ...base,
  actor: { login: "dependabot[bot]", isBot: true },
  author: { login: "octocat", isBot: false },
  reviewers: ["alice", "bob"],
  assignees: [],
  commenters: ["renovate[bot]", "github-actions[bot]"],
  labels: ["dependencies", "javascript"],
  state: "merged",
};

type LeafInput = ConditionLeaf extends infer L
  ? L extends unknown
    ? Omit<L, "type">
    : never
  : never;
const leaf = (l: LeafInput) => ({ type: "leaf", ...l }) as ConditionLeaf;
const and = (...children: Condition[]): Condition => ({ type: "group", op: "and", children });
const or = (...children: Condition[]): Condition => ({ type: "group", op: "or", children });
const negated = (group: Condition): Condition => ({ ...group, negate: true }) as Condition;

const T = leaf({ field: "repo", operator: "matches", value: ["acme/*"] });
const F = leaf({ field: "repo", operator: "matches", value: ["other/*"] });
/** Unknown against `base`, because the state has not been loaded. */
const U = leaf({ field: "state", operator: "in", value: ["open"] });

describe("glob", () => {
  it("matches exact values case-insensitively", () => {
    expect(matchGlob("Acme/Widgets", "acme/widgets")).toBe(true);
    expect(matchGlob("acme/widget", "acme/widgets")).toBe(false);
  });

  it("supports wildcards anywhere", () => {
    expect(matchGlob("acme/*", "acme/widgets")).toBe(true);
    expect(matchGlob("*/widgets", "acme/widgets")).toBe(true);
    expect(matchGlob("a*e/w*s", "acme/widgets")).toBe(true);
    expect(matchGlob("*", "anything/at-all")).toBe(true);
    expect(matchGlob("acme/*", "acme-corp/widgets")).toBe(false);
  });

  it("treats regex metacharacters literally", () => {
    expect(matchGlob("dependabot[bot]", "dependabot[bot]")).toBe(true);
    expect(matchGlob("dependabot[bot]", "dependabotb")).toBe(false);
    expect(matchGlob("a.b", "axb")).toBe(false);
    expect(matchGlob("a+b", "a+b")).toBe(true);
    expect(matchGlob("(x)|y", "(x)|y")).toBe(true);
    expect(matchGlob("$money^", "$money^")).toBe(true);
  });

  it("trims the pattern and caches the compiled regex", () => {
    expect(matchGlob("  acme/*  ", "acme/widgets")).toBe(true);
    expect(globToRegExp("cache/me")).toBe(globToRegExp("cache/me"));
  });

  it("survives a cache flush", () => {
    for (let i = 0; i < 2100; i++) globToRegExp(`flush-${i}`);
    expect(matchGlob("acme/*", "acme/widgets")).toBe(true);
  });
});

describe("leaf: repo and owner", () => {
  it("matches any of the patterns", () => {
    expect(
      evaluateLeaf(leaf({ field: "repo", operator: "matches", value: ["x/y", "acme/*"] }), base),
    ).toBe(true);
    expect(evaluateLeaf(leaf({ field: "repo", operator: "matches", value: ["x/y"] }), base)).toBe(
      false,
    );
  });

  it("negates with not_matches", () => {
    expect(
      evaluateLeaf(leaf({ field: "repo", operator: "not_matches", value: ["acme/*"] }), base),
    ).toBe(false);
    expect(
      evaluateLeaf(leaf({ field: "repo", operator: "not_matches", value: ["x/*"] }), base),
    ).toBe(true);
  });

  it("matches the owner", () => {
    expect(evaluateLeaf(leaf({ field: "owner", operator: "matches", value: ["ACME"] }), base)).toBe(
      true,
    );
    expect(evaluateLeaf(leaf({ field: "owner", operator: "matches", value: ["ac*"] }), base)).toBe(
      true,
    );
    expect(
      evaluateLeaf(leaf({ field: "owner", operator: "not_matches", value: ["acme"] }), base),
    ).toBe(false);
    expect(
      evaluateLeaf(leaf({ field: "owner", operator: "not_matches", value: ["x"] }), base),
    ).toBe(true);
  });
});

describe("leaf: reason and subject type", () => {
  it("checks membership", () => {
    expect(
      evaluateLeaf(
        leaf({ field: "reason", operator: "in", value: ["mention", "subscribed"] }),
        base,
      ),
    ).toBe(true);
    expect(evaluateLeaf(leaf({ field: "reason", operator: "in", value: ["mention"] }), base)).toBe(
      false,
    );
    expect(
      evaluateLeaf(leaf({ field: "reason", operator: "not_in", value: ["mention"] }), base),
    ).toBe(true);
    expect(
      evaluateLeaf(leaf({ field: "reason", operator: "not_in", value: ["subscribed"] }), base),
    ).toBe(false);
  });

  it("accepts reasons GitHub has not documented yet", () => {
    const ctx = { ...base, reason: "brand_new_reason" };
    expect(
      evaluateLeaf(leaf({ field: "reason", operator: "in", value: ["brand_new_reason"] }), ctx),
    ).toBe(true);
  });

  it("checks the subject type", () => {
    expect(
      evaluateLeaf(leaf({ field: "subject_type", operator: "in", value: ["pullrequest"] }), base),
    ).toBe(true);
    expect(
      evaluateLeaf(leaf({ field: "subject_type", operator: "in", value: ["Issue"] }), base),
    ).toBe(false);
    expect(
      evaluateLeaf(leaf({ field: "subject_type", operator: "not_in", value: ["Issue"] }), base),
    ).toBe(true);
    expect(
      evaluateLeaf(
        leaf({ field: "subject_type", operator: "not_in", value: ["PullRequest"] }),
        base,
      ),
    ).toBe(false);
  });
});

describe("leaf: actor and author", () => {
  it("is unknown when the user was not loaded", () => {
    expect(
      evaluateLeaf(leaf({ field: "actor", operator: "matches", value: ["*"] }), base),
    ).toBeNull();
    expect(
      evaluateLeaf(leaf({ field: "actor", operator: "not_matches", value: ["*"] }), base),
    ).toBeNull();
    expect(
      evaluateLeaf(leaf({ field: "author", operator: "matches", value: ["*"] }), base),
    ).toBeNull();
  });

  it("matches logins with globs", () => {
    expect(
      evaluateLeaf(leaf({ field: "actor", operator: "matches", value: ["*[bot]"] }), full),
    ).toBe(true);
    expect(
      evaluateLeaf(leaf({ field: "actor", operator: "not_matches", value: ["*[bot]"] }), full),
    ).toBe(false);
    expect(
      evaluateLeaf(leaf({ field: "author", operator: "matches", value: ["OctoCat"] }), full),
    ).toBe(true);
    expect(
      evaluateLeaf(leaf({ field: "author", operator: "matches", value: ["hubot"] }), full),
    ).toBe(false);
    expect(
      evaluateLeaf(leaf({ field: "author", operator: "not_matches", value: ["hubot"] }), full),
    ).toBe(true);
  });
});

describe("leaf: bot flags", () => {
  it("is unknown when the user was not loaded", () => {
    expect(
      evaluateLeaf(leaf({ field: "actor_is_bot", operator: "is", value: true }), base),
    ).toBeNull();
    expect(
      evaluateLeaf(leaf({ field: "author_is_bot", operator: "is", value: false }), base),
    ).toBeNull();
  });

  it("compares the flag", () => {
    expect(evaluateLeaf(leaf({ field: "actor_is_bot", operator: "is", value: true }), full)).toBe(
      true,
    );
    expect(evaluateLeaf(leaf({ field: "actor_is_bot", operator: "is", value: false }), full)).toBe(
      false,
    );
    expect(evaluateLeaf(leaf({ field: "author_is_bot", operator: "is", value: false }), full)).toBe(
      true,
    );
    expect(evaluateLeaf(leaf({ field: "author_is_bot", operator: "is", value: true }), full)).toBe(
      false,
    );
  });
});

describe("leaf: set fields", () => {
  const fields = [
    ["reviewer", "reviewers"],
    ["assignee", "assignees"],
    ["commenter", "commenters"],
    ["label", "labels"],
  ] as const;

  it.each(fields)("%s is unknown when the set was not loaded", (field) => {
    for (const operator of ["any", "all", "none"] as const) {
      expect(evaluateLeaf(leaf({ field, operator, value: ["*"] }), base)).toBeNull();
    }
  });

  it.each(fields)("%s supports any / all / none", (field, key) => {
    const ctx = { ...base, [key]: ["alice", "bob[bot]"] };
    expect(evaluateLeaf(leaf({ field, operator: "any", value: ["alice"] }), ctx)).toBe(true);
    expect(evaluateLeaf(leaf({ field, operator: "any", value: ["carol"] }), ctx)).toBe(false);
    expect(evaluateLeaf(leaf({ field, operator: "all", value: ["alice", "*[bot]"] }), ctx)).toBe(
      true,
    );
    expect(evaluateLeaf(leaf({ field, operator: "all", value: ["alice"] }), ctx)).toBe(false);
    expect(evaluateLeaf(leaf({ field, operator: "none", value: ["carol"] }), ctx)).toBe(true);
    expect(evaluateLeaf(leaf({ field, operator: "none", value: ["ALICE"] }), ctx)).toBe(false);
  });

  it.each(fields)("%s handles an empty set", (field, key) => {
    const ctx = { ...base, [key]: [] };
    expect(evaluateLeaf(leaf({ field, operator: "any", value: ["*"] }), ctx)).toBe(false);
    expect(evaluateLeaf(leaf({ field, operator: "all", value: ["*"] }), ctx)).toBe(false);
    expect(evaluateLeaf(leaf({ field, operator: "none", value: ["*"] }), ctx)).toBe(true);
  });

  it("can express 'only bots commented'", () => {
    const onlyBots = leaf({ field: "commenter", operator: "all", value: ["*[bot]"] });
    expect(evaluateLeaf(onlyBots, full)).toBe(true);
    expect(evaluateLeaf(onlyBots, { ...full, commenters: ["renovate[bot]", "alice"] })).toBe(false);
  });
});

describe("leaf: state", () => {
  it("is unknown when the state was not loaded", () => {
    expect(
      evaluateLeaf(leaf({ field: "state", operator: "in", value: ["open"] }), base),
    ).toBeNull();
    expect(
      evaluateLeaf(leaf({ field: "state", operator: "not_in", value: ["open"] }), base),
    ).toBeNull();
  });

  it("checks membership", () => {
    expect(
      evaluateLeaf(leaf({ field: "state", operator: "in", value: ["closed", "merged"] }), full),
    ).toBe(true);
    expect(
      evaluateLeaf(leaf({ field: "state", operator: "in", value: ["open", "draft"] }), full),
    ).toBe(false);
    expect(evaluateLeaf(leaf({ field: "state", operator: "not_in", value: ["open"] }), full)).toBe(
      true,
    );
    expect(
      evaluateLeaf(leaf({ field: "state", operator: "not_in", value: ["merged"] }), full),
    ).toBe(false);
  });
});

describe("leaf: title", () => {
  it("contains is case-insensitive by default", () => {
    expect(
      evaluateLeaf(leaf({ field: "title", operator: "contains", value: "bump LODASH" }), base),
    ).toBe(true);
    expect(evaluateLeaf(leaf({ field: "title", operator: "contains", value: "axios" }), base)).toBe(
      false,
    );
    expect(
      evaluateLeaf(leaf({ field: "title", operator: "not_contains", value: "axios" }), base),
    ).toBe(true);
    expect(
      evaluateLeaf(leaf({ field: "title", operator: "not_contains", value: "lodash" }), base),
    ).toBe(false);
  });

  it("contains can be case-sensitive", () => {
    const sensitive = { field: "title", operator: "contains", caseSensitive: true } as const;
    expect(evaluateLeaf(leaf({ ...sensitive, value: "Bump" }), base)).toBe(true);
    expect(evaluateLeaf(leaf({ ...sensitive, value: "bump" }), base)).toBe(false);
  });

  it("supports regular expressions", () => {
    expect(
      evaluateLeaf(leaf({ field: "title", operator: "regex", value: "^chore\\(deps\\):" }), base),
    ).toBe(true);
    expect(evaluateLeaf(leaf({ field: "title", operator: "regex", value: "^CHORE" }), base)).toBe(
      true,
    );
    expect(evaluateLeaf(leaf({ field: "title", operator: "regex", value: "^feat" }), base)).toBe(
      false,
    );
    expect(
      evaluateLeaf(leaf({ field: "title", operator: "not_regex", value: "^feat" }), base),
    ).toBe(true);
    expect(
      evaluateLeaf(leaf({ field: "title", operator: "not_regex", value: "\\d+\\.\\d+" }), base),
    ).toBe(false);
  });

  it("regex can be case-sensitive", () => {
    expect(
      evaluateLeaf(
        leaf({ field: "title", operator: "regex", value: "^CHORE", caseSensitive: true }),
        base,
      ),
    ).toBe(false);
  });

  it("is unknown for an invalid regex, even when negated", () => {
    expect(evaluateLeaf(leaf({ field: "title", operator: "regex", value: "(" }), base)).toBeNull();
    expect(
      evaluateLeaf(leaf({ field: "title", operator: "not_regex", value: "(" }), base),
    ).toBeNull();
  });
});

describe("groups", () => {
  it("AND truth table", () => {
    expect(evaluateCondition(and(T, T), base)).toBe(true);
    expect(evaluateCondition(and(T, F), base)).toBe(false);
    expect(evaluateCondition(and(F, T), base)).toBe(false);
    expect(evaluateCondition(and(T, U), base)).toBeNull();
    expect(evaluateCondition(and(U, T), base)).toBeNull();
    expect(evaluateCondition(and(U, F), base)).toBe(false);
    expect(evaluateCondition(and(F, U), base)).toBe(false);
    expect(evaluateCondition(and(U, U), base)).toBeNull();
  });

  it("OR truth table", () => {
    expect(evaluateCondition(or(F, F), base)).toBe(false);
    expect(evaluateCondition(or(T, F), base)).toBe(true);
    expect(evaluateCondition(or(F, T), base)).toBe(true);
    expect(evaluateCondition(or(F, U), base)).toBeNull();
    expect(evaluateCondition(or(U, F), base)).toBeNull();
    expect(evaluateCondition(or(U, T), base)).toBe(true);
    expect(evaluateCondition(or(T, U), base)).toBe(true);
    expect(evaluateCondition(or(U, U), base)).toBeNull();
  });

  it("negation keeps unknown unknown", () => {
    expect(evaluateCondition(negated(and(T)), base)).toBe(false);
    expect(evaluateCondition(negated(and(F)), base)).toBe(true);
    expect(evaluateCondition(negated(and(U)), base)).toBeNull();
    expect(evaluateCondition(negated(or(F, U)), base)).toBeNull();
    expect(evaluateCondition(negated(or(T, U)), base)).toBe(false);
  });

  it("an empty group is undecided and never matches", () => {
    expect(evaluateCondition(and(), base)).toBeNull();
    expect(evaluateCondition(or(), base)).toBeNull();
    expect(evaluateCondition(negated(and()), base)).toBeNull();
    expect(matchesCondition(and(), base)).toBe(false);
  });

  it("evaluates nested groups", () => {
    const tree = and(T, or(F, and(T, negated(or(F)))));
    expect(evaluateCondition(tree, base)).toBe(true);
    expect(evaluateCondition(and(T, or(F, and(T, negated(or(T))))), base)).toBe(false);
  });

  it("evaluates a bare leaf", () => {
    expect(evaluateCondition(T, base)).toBe(true);
    expect(evaluateCondition(U, base)).toBeNull();
  });

  it("matchesCondition is true only for a definite match", () => {
    expect(matchesCondition(and(T), base)).toBe(true);
    expect(matchesCondition(and(F), base)).toBe(false);
    expect(matchesCondition(and(U), base)).toBe(false);
    expect(matchesCondition(negated(and(U)), base)).toBe(false);
  });

  it("resolves once the missing data is loaded", () => {
    const rule = and(
      leaf({ field: "owner", operator: "matches", value: ["acme"] }),
      leaf({ field: "state", operator: "in", value: ["merged", "closed"] }),
      leaf({ field: "actor_is_bot", operator: "is", value: true }),
    );
    expect(evaluateCondition(rule, base)).toBeNull();
    expect(evaluateCondition(rule, full)).toBe(true);
    expect(evaluateCondition(rule, { ...full, state: "open" })).toBe(false);
  });

  it("short-circuits without the missing data when the answer is already decided", () => {
    const rule = and(leaf({ field: "owner", operator: "matches", value: ["other"] }), U);
    expect(evaluateCondition(rule, base)).toBe(false);
  });
});

describe("requiredData", () => {
  it("needs nothing for notification-only fields", () => {
    const tree = and(
      T,
      leaf({ field: "owner", operator: "matches", value: ["a"] }),
      leaf({ field: "reason", operator: "in", value: ["a"] }),
      leaf({ field: "subject_type", operator: "in", value: ["a"] }),
      leaf({ field: "title", operator: "contains", value: "a" }),
    );
    expect([...requiredData(tree)]).toEqual([]);
  });

  it("maps fields to the data they read", () => {
    const need = (field: ConditionLeaf["field"]) =>
      [...requiredData(leaf({ field, operator: "any", value: ["x"] } as never))].toSorted();
    expect(need("actor")).toEqual(["actor"]);
    expect(need("actor_is_bot")).toEqual(["actor"]);
    expect(need("author")).toEqual(["subject"]);
    expect(need("author_is_bot")).toEqual(["subject"]);
    expect(need("assignee")).toEqual(["subject"]);
    expect(need("label")).toEqual(["subject"]);
    expect(need("state")).toEqual(["subject"]);
    expect(need("reviewer")).toEqual(["reviews", "subject"]);
    expect(need("commenter")).toEqual(["comments"]);
  });

  it("collects needs across nested groups without duplicates", () => {
    const tree = and(
      U,
      or(
        leaf({ field: "label", operator: "any", value: ["x"] }),
        and(leaf({ field: "commenter", operator: "all", value: ["*[bot]"] })),
      ),
    );
    expect([...requiredData(tree)].toSorted()).toEqual(["comments", "subject"]);
  });
});

describe("sortRules", () => {
  it("orders by priority, then creation time, then id", () => {
    const rules = [
      { id: "d", priority: 2, createdAt: 1 },
      { id: "c", priority: 1, createdAt: 5 },
      { id: "b", priority: 1, createdAt: 3 },
      { id: "a", priority: 1, createdAt: 3 },
      { id: "e", priority: 0 },
    ];
    expect(sortRules(rules).map((r) => r.id)).toEqual(["e", "a", "b", "c", "d"]);
  });

  it("does not mutate its input", () => {
    const rules = [
      { id: "b", priority: 2 },
      { id: "a", priority: 1 },
    ];
    sortRules(rules);
    expect(rules.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

import { z } from "zod";
import { MAX_CONDITION_DEPTH, SUBJECT_STATES } from "../constants";

const patterns = z.array(z.string().trim().min(1).max(200)).min(1).max(100);

const leafBase = { type: z.literal("leaf") };

const globLeaf = <F extends string>(field: F) =>
  z.object({
    ...leafBase,
    field: z.literal(field),
    operator: z.enum(["matches", "not_matches"]),
    value: patterns,
  });

const enumLeaf = <F extends string>(field: F) =>
  z.object({
    ...leafBase,
    field: z.literal(field),
    operator: z.enum(["in", "not_in"]),
    value: patterns,
  });

const setLeaf = <F extends string>(field: F) =>
  z.object({
    ...leafBase,
    field: z.literal(field),
    operator: z.enum(["any", "all", "none"]),
    value: patterns,
  });

const boolLeaf = <F extends string>(field: F) =>
  z.object({
    ...leafBase,
    field: z.literal(field),
    operator: z.literal("is"),
    value: z.boolean(),
  });

const stateLeaf = z.object({
  ...leafBase,
  field: z.literal("state"),
  operator: z.enum(["in", "not_in"]),
  value: z.array(z.enum(SUBJECT_STATES)).min(1),
});

const titleLeaf = z
  .object({
    ...leafBase,
    field: z.literal("title"),
    operator: z.enum(["contains", "not_contains", "regex", "not_regex"]),
    value: z.string().min(1).max(500),
    caseSensitive: z.boolean().optional(),
  })
  .superRefine((leaf, ctx) => {
    if (leaf.operator !== "regex" && leaf.operator !== "not_regex") return;
    try {
      RegExp(leaf.value);
    } catch {
      ctx.addIssue({ code: "custom", path: ["value"], message: "Invalid regular expression" });
    }
  });

export const conditionLeafSchema = z.union([
  globLeaf("repo"),
  globLeaf("owner"),
  enumLeaf("reason"),
  enumLeaf("subject_type"),
  globLeaf("actor"),
  globLeaf("author"),
  setLeaf("reviewer"),
  setLeaf("assignee"),
  setLeaf("commenter"),
  setLeaf("label"),
  stateLeaf,
  titleLeaf,
  boolLeaf("actor_is_bot"),
  boolLeaf("author_is_bot"),
]);

export type ConditionLeaf = z.infer<typeof conditionLeafSchema>;
export type ConditionField = ConditionLeaf["field"];

export interface ConditionGroup {
  type: "group";
  op: "and" | "or";
  negate?: boolean | undefined;
  children: Condition[];
}

export type Condition = ConditionGroup | ConditionLeaf;

const conditionGroupSchema: z.ZodType<ConditionGroup> = z.object({
  type: z.literal("group"),
  op: z.enum(["and", "or"]),
  negate: z.boolean().optional(),
  get children() {
    return z.array(conditionNodeSchema).min(1).max(50);
  },
});

const conditionNodeSchema: z.ZodType<Condition> = z.union([
  conditionGroupSchema,
  conditionLeafSchema,
]);

export function conditionDepth(condition: Condition): number {
  if (condition.type === "leaf") return 0;
  return 1 + Math.max(0, ...condition.children.map(conditionDepth));
}

/** A rule condition. The root is always a group so the editor has a stable shape. */
export const conditionSchema = conditionGroupSchema.refine(
  (root) => conditionDepth(root) <= MAX_CONDITION_DEPTH,
  { message: `Condition tree is nested deeper than ${MAX_CONDITION_DEPTH} levels` },
);

export const CONDITION_FIELDS = [
  "repo",
  "owner",
  "reason",
  "subject_type",
  "actor",
  "author",
  "reviewer",
  "assignee",
  "commenter",
  "label",
  "state",
  "title",
  "actor_is_bot",
  "author_is_bot",
] as const satisfies readonly ConditionField[];

export const FIELD_OPERATORS = {
  repo: ["matches", "not_matches"],
  owner: ["matches", "not_matches"],
  reason: ["in", "not_in"],
  subject_type: ["in", "not_in"],
  actor: ["matches", "not_matches"],
  author: ["matches", "not_matches"],
  reviewer: ["any", "all", "none"],
  assignee: ["any", "all", "none"],
  commenter: ["any", "all", "none"],
  label: ["any", "all", "none"],
  state: ["in", "not_in"],
  title: ["contains", "not_contains", "regex", "not_regex"],
  actor_is_bot: ["is"],
  author_is_bot: ["is"],
} as const satisfies Record<ConditionField, readonly string[]>;

/** Builds a valid leaf with an empty-ish default value for the given field. */
export function defaultLeaf(field: ConditionField): ConditionLeaf {
  switch (field) {
    case "repo":
    case "owner":
    case "actor":
    case "author":
      return { type: "leaf", field, operator: "matches", value: [] };
    case "reason":
    case "subject_type":
      return { type: "leaf", field, operator: "in", value: [] };
    case "reviewer":
    case "assignee":
    case "commenter":
    case "label":
      return { type: "leaf", field, operator: "any", value: [] };
    case "state":
      return { type: "leaf", field, operator: "in", value: [] };
    case "title":
      return { type: "leaf", field, operator: "contains", value: "" };
    case "actor_is_bot":
    case "author_is_bot":
      return { type: "leaf", field, operator: "is", value: true };
  }
}

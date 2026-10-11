import { describe, expect, it } from "vitest";
import { MAX_CONDITION_DEPTH } from "../constants";
import {
  CONDITION_FIELDS,
  type Condition,
  type ConditionGroup,
  FIELD_OPERATORS,
  conditionDepth,
  conditionLeafSchema,
  conditionSchema,
  defaultLeaf,
} from "./schema";

const group = (children: Condition[], op: "and" | "or" = "and"): ConditionGroup => ({
  type: "group",
  op,
  children,
});

describe("conditionSchema", () => {
  it("accepts a nested tree", () => {
    const tree = group([
      { type: "leaf", field: "repo", operator: "matches", value: ["acme/*"] },
      {
        type: "group",
        op: "or",
        negate: true,
        children: [
          { type: "leaf", field: "state", operator: "in", value: ["merged"] },
          { type: "leaf", field: "title", operator: "regex", value: "^chore" },
          { type: "leaf", field: "actor_is_bot", operator: "is", value: true },
        ],
      },
    ]);
    expect(conditionSchema.parse(tree)).toEqual(tree);
  });

  it("requires the root to be a group", () => {
    const leaf = { type: "leaf", field: "repo", operator: "matches", value: ["a"] };
    expect(conditionSchema.safeParse(leaf).success).toBe(false);
  });

  it("rejects empty groups, which would otherwise be ambiguous", () => {
    expect(conditionSchema.safeParse(group([])).success).toBe(false);
    expect(conditionSchema.safeParse(group([group([])])).success).toBe(false);
  });

  it("rejects unknown fields and operators", () => {
    expect(
      conditionSchema.safeParse(
        group([{ type: "leaf", field: "nope", operator: "in", value: ["a"] } as never]),
      ).success,
    ).toBe(false);
    expect(
      conditionSchema.safeParse(
        group([{ type: "leaf", field: "repo", operator: "in", value: ["a"] } as never]),
      ).success,
    ).toBe(false);
  });

  it("rejects empty value lists and unknown states", () => {
    expect(
      conditionSchema.safeParse(
        group([{ type: "leaf", field: "label", operator: "any", value: [] }]),
      ).success,
    ).toBe(false);
    expect(
      conditionSchema.safeParse(
        group([{ type: "leaf", field: "state", operator: "in", value: ["reopened"] } as never]),
      ).success,
    ).toBe(false);
  });

  it("rejects an invalid regular expression but not an odd substring", () => {
    expect(
      conditionSchema.safeParse(
        group([{ type: "leaf", field: "title", operator: "regex", value: "(" }]),
      ).success,
    ).toBe(false);
    expect(
      conditionSchema.safeParse(
        group([{ type: "leaf", field: "title", operator: "contains", value: "(" }]),
      ).success,
    ).toBe(true);
  });

  it("limits nesting depth", () => {
    const nest = (depth: number): ConditionGroup =>
      depth === 1
        ? group([{ type: "leaf", field: "repo", operator: "matches", value: ["a"] }])
        : group([nest(depth - 1)]);
    expect(conditionDepth(nest(3))).toBe(3);
    expect(conditionSchema.safeParse(nest(MAX_CONDITION_DEPTH)).success).toBe(true);
    expect(conditionSchema.safeParse(nest(MAX_CONDITION_DEPTH + 1)).success).toBe(false);
  });

  it("trims patterns", () => {
    const parsed = conditionSchema.parse(
      group([{ type: "leaf", field: "owner", operator: "matches", value: ["  acme  "] }]),
    );
    expect(parsed.children[0]).toMatchObject({ value: ["acme"] });
  });
});

describe("field metadata", () => {
  it("lists operators for every field", () => {
    expect(Object.keys(FIELD_OPERATORS).toSorted()).toEqual([...CONDITION_FIELDS].toSorted());
  });

  it.each(CONDITION_FIELDS)("default leaf for %s uses a listed operator", (field) => {
    const leaf = defaultLeaf(field);
    expect(leaf.field).toBe(field);
    expect(FIELD_OPERATORS[field] as readonly string[]).toContain(leaf.operator);
  });

  it.each(CONDITION_FIELDS)("every operator of %s validates with a sample value", (field) => {
    for (const operator of FIELD_OPERATORS[field]) {
      const sample = defaultLeaf(field);
      const value =
        field === "state"
          ? ["open"]
          : field === "title"
            ? "text"
            : typeof sample.value === "boolean"
              ? true
              : ["x"];
      expect(conditionLeafSchema.safeParse({ type: "leaf", field, operator, value }).success).toBe(
        true,
      );
    }
  });
});

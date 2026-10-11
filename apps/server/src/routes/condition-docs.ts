import { conditionLeafSchema, conditionSchema, MAX_CONDITION_DEPTH } from "@mewte/shared";

/**
 * The condition tree is recursive, which the OpenAPI generator cannot walk. Validation
 * still uses the real schema; only the published description is written by hand here.
 */
export const ConditionLeafSchema = conditionLeafSchema.openapi("ConditionLeaf", {
  description:
    "One comparison. `field` selects what is compared and determines which `operator` and `value` are allowed. Text patterns are case-insensitive and may use `*` as a wildcard. A leaf whose data cannot be loaded for a notification is undecided.",
});

export const ConditionSchema = conditionSchema.openapi("Condition", {
  type: "object",
  description: `A group of conditions joined by AND or OR, optionally negated. Groups may be nested up to ${MAX_CONDITION_DEPTH} levels deep. The root of a rule's condition is always a group.`,
  required: ["type", "op", "children"],
  properties: {
    type: { type: "string", enum: ["group"] },
    op: { type: "string", enum: ["and", "or"] },
    negate: { type: "boolean", description: "Inverts the result of the group." },
    children: {
      type: "array",
      minItems: 1,
      maxItems: 50,
      items: {
        oneOf: [
          { $ref: "#/components/schemas/Condition" },
          { $ref: "#/components/schemas/ConditionLeaf" },
        ],
      },
    },
  },
  example: {
    type: "group",
    op: "and",
    children: [
      { type: "leaf", field: "repo", operator: "matches", value: ["my-org/*"] },
      { type: "leaf", field: "state", operator: "in", value: ["merged", "closed"] },
      { type: "leaf", field: "actor_is_bot", operator: "is", value: true },
    ],
  },
});

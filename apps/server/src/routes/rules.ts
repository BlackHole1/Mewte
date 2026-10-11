import { createRoute } from "@hono/zod-openapi";
import {
  deleteRule,
  getRule,
  insertRule,
  listRules,
  resetPollMarkers,
  updateRule,
} from "@mewte/db";
import {
  dryRunInputSchema,
  dryRunResultSchema,
  okSchema,
  ruleInputSchema,
  ruleSchema,
} from "@mewte/shared";
import { z } from "zod";
import type { Deps } from "../deps";
import { notFound } from "../errors";
import { dryRun } from "../services/runner";
import { ConditionSchema } from "./condition-docs";
import { createRouter, json, jsonBody, pick, sessionSecurity } from "./helpers";
import { newId } from "../services/crypto";

const RuleSchema = ruleSchema.extend({ condition: ConditionSchema }).openapi("Rule");
const RuleInputSchema = ruleInputSchema.extend({ condition: ConditionSchema }).openapi("RuleInput");
const DryRunInputSchema = dryRunInputSchema
  .extend({ condition: ConditionSchema })
  .openapi("DryRunInput");
const idParam = z.object({ id: z.string().openapi({ param: { name: "id", in: "path" } }) });

export function ruleRoutes(deps: Deps) {
  const app = createRouter();
  const tags = ["Rules"];
  const security = sessionSecurity;

  app.openapi(
    createRoute({
      method: "get",
      path: "/rules",
      tags,
      security,
      summary: "List rules",
      description:
        "Rules are returned in evaluation order: lowest `priority` first. For each notification the first matching rule wins and later rules are not evaluated.",
      responses: { 200: json(z.array(RuleSchema), "All rules."), ...pick(401) },
    }),
    async (c) => c.json(await listRules(deps.conn), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/rules",
      tags,
      security,
      summary: "Create a rule",
      description:
        "`condition` is a tree of AND/OR groups (optionally negated) over leaf comparisons. A leaf whose data is unavailable for a notification is treated as undecided and never produces a match, even under negation.",
      request: { body: jsonBody(RuleInputSchema) },
      responses: { 201: json(RuleSchema, "The created rule."), ...pick(400, 401) },
    }),
    async (c) => {
      const rule = await insertRule(deps.conn, newId(), c.req.valid("json"), deps.now());
      await resetPollMarkers(deps.conn);
      return c.json(rule, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/rules/dry-run",
      tags,
      security,
      summary: "Preview a condition",
      description:
        "Fetches the current unread notifications of every account in scope and reports which ones the condition would match. Nothing is marked as done and nothing is written to history.",
      request: { body: jsonBody(DryRunInputSchema) },
      responses: {
        200: json(dryRunResultSchema.openapi("DryRunResult"), "Matches per account."),
        ...pick(400, 401),
      },
    }),
    async (c) => c.json(await dryRun(deps, c.req.valid("json")), 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/rules/{id}",
      tags,
      security,
      summary: "Get a rule",
      request: { params: idParam },
      responses: { 200: json(RuleSchema, "The rule."), ...pick(401, 404) },
    }),
    async (c) => {
      const rule = await getRule(deps.conn, c.req.valid("param").id);
      if (!rule) throw notFound("Rule");
      return c.json(rule, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/rules/{id}",
      tags,
      security,
      summary: "Replace a rule",
      request: { params: idParam, body: jsonBody(RuleInputSchema) },
      responses: { 200: json(RuleSchema, "The updated rule."), ...pick(400, 401, 404) },
    }),
    async (c) => {
      const rule = await updateRule(
        deps.conn,
        c.req.valid("param").id,
        c.req.valid("json"),
        deps.now(),
      );
      if (!rule) throw notFound("Rule");
      await resetPollMarkers(deps.conn);
      return c.json(rule, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/rules/{id}",
      tags,
      security,
      summary: "Delete a rule",
      description: "History entries created by the rule are kept.",
      request: { params: idParam },
      responses: { 200: json(okSchema, "The rule was deleted."), ...pick(401, 404) },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      if (!(await getRule(deps.conn, id))) throw notFound("Rule");
      await deleteRule(deps.conn, id);
      return c.json({ ok: true as const }, 200);
    },
  );

  return app;
}

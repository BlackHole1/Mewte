import { createRoute } from "@hono/zod-openapi";
import { deleteAccount, getAccount, listAccounts, listRules } from "@mewte/db";
import {
  accountSchema,
  createAccountInputSchema,
  okSchema,
  runLogSchema,
  updateAccountInputSchema,
} from "@mewte/shared";
import { z } from "zod";
import type { Deps } from "../deps";
import { ApiError, notFound } from "../errors";
import { bindAccount, editAccount, toAccount } from "../services/accounts";
import { runAccount } from "../services/runner";
import { createRouter, json, jsonBody, pick, sessionSecurity } from "./helpers";

const AccountSchema = accountSchema.openapi("Account");
const RunLogSchema = runLogSchema.openapi("RunLog");
const idParam = z.object({ id: z.string().openapi({ param: { name: "id", in: "path" } }) });

export function accountRoutes(deps: Deps) {
  const app = createRouter();
  const tags = ["GitHub accounts"];
  const security = sessionSecurity;

  app.openapi(
    createRoute({
      method: "get",
      path: "/accounts",
      tags,
      security,
      summary: "List connected GitHub accounts",
      description: "Tokens are never returned.",
      responses: { 200: json(z.array(AccountSchema), "All connected accounts."), ...pick(401) },
    }),
    async (c) => {
      const now = deps.now();
      return c.json(
        (await listAccounts(deps.conn)).map((a) => toAccount(a, now)),
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/accounts",
      tags,
      security,
      summary: "Connect a GitHub account",
      description:
        "Takes a classic personal access token with the `notifications` scope (add `repo` to match on details of private repositories). The token is checked against `GET /user`, then stored encrypted. Fine-grained tokens and GitHub App tokens cannot read notifications and are rejected.",
      request: { body: jsonBody(createAccountInputSchema.openapi("CreateAccountInput")) },
      responses: {
        201: json(AccountSchema, "The account was connected."),
        ...pick(400, 401, 409, 502),
      },
    }),
    async (c) => {
      const input = c.req.valid("json");
      const record = await bindAccount(deps, input);
      // A rules file that named this account before it was connected can be applied now.
      await deps.rulesFile.sync({ force: true });
      return c.json(toAccount(record, deps.now()), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/accounts/{id}",
      tags,
      security,
      summary: "Update a GitHub account",
      description:
        "Changes the polling interval, the enabled flag, or replaces the token. A replacement token must belong to the same GitHub user; it also clears an `unauthorized` status.",
      request: {
        params: idParam,
        body: jsonBody(updateAccountInputSchema.openapi("UpdateAccountInput")),
      },
      responses: { 200: json(AccountSchema, "The updated account."), ...pick(400, 401, 404, 502) },
    }),
    async (c) => {
      const record = await editAccount(deps, c.req.valid("param").id, c.req.valid("json"));
      return c.json(toAccount(record, deps.now()), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/accounts/{id}",
      tags,
      security,
      summary: "Disconnect a GitHub account",
      description: "Deletes the account and its stored token. History and run logs are kept.",
      request: { params: idParam },
      responses: { 200: json(okSchema, "The account was removed."), ...pick(401, 404) },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      if (!(await getAccount(deps.conn, id))) throw notFound("Account");
      const scoped = (await listRules(deps.conn)).some(
        (rule) =>
          rule.accountScope.type === "accounts" && rule.accountScope.accountIds.includes(id),
      );
      await deleteAccount(deps.conn, id);
      // The rules file names accounts by login, which this account no longer has.
      if (scoped) await deps.rulesFile.save();
      return c.json({ ok: true as const }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/accounts/{id}/run",
      tags,
      security,
      summary: "Run an account now",
      description:
        "Polls the account immediately, applies the rules, and returns the resulting run log once finished. Responds with 409 while another run of the same account is in progress.",
      request: { params: idParam },
      responses: { 200: json(RunLogSchema, "The finished run."), ...pick(401, 404, 409) },
    }),
    async (c) => {
      const outcome = await runAccount(deps, c.req.valid("param").id, "manual");
      if (outcome.kind === "not_found") throw notFound("Account");
      if (outcome.kind === "busy") {
        throw new ApiError(409, "account_busy", "This account is already running");
      }
      return c.json(outcome.run, 200);
    },
  );

  return app;
}

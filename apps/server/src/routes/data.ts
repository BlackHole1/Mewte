import { createRoute } from "@hono/zod-openapi";
import {
  countHistory,
  countHistoryBuckets,
  listAccounts,
  listRules,
  queryHistory,
  queryRunLogs,
} from "@mewte/db";
import {
  dashboardQuerySchema,
  dashboardSchema,
  historyPageSchema,
  historyQuerySchema,
  runPageSchema,
  runQuerySchema,
  settingsSchema,
} from "@mewte/shared";
import type { Deps } from "../deps";
import { loadSettings, saveSettings } from "../services/settings";
import { createRouter, json, jsonBody, pick, sessionSecurity } from "./helpers";

const DAY_MS = 24 * 60 * 60 * 1000;
const DASHBOARD_DAYS = 14;
const SettingsSchema = settingsSchema.openapi("Settings");

export function dataRoutes(deps: Deps) {
  const app = createRouter();
  const security = sessionSecurity;

  app.openapi(
    createRoute({
      method: "get",
      path: "/history",
      tags: ["History"],
      security,
      summary: "Search processed notifications",
      description:
        "Each entry is a snapshot of a notification taken when a rule marked it as done. GitHub offers no way to undo that, so entries only link back to the subject. Newest first.",
      request: { query: historyQuerySchema },
      responses: {
        200: json(historyPageSchema.openapi("HistoryPage"), "One page of history."),
        ...pick(400, 401),
      },
    }),
    async (c) => c.json(await queryHistory(deps.conn, c.req.valid("query")), 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/runs",
      tags: ["Run logs"],
      security,
      summary: "List run logs",
      description:
        "One entry per poll of an account: how many notifications were fetched, how many matched a rule, how many were marked as done, and any errors. Newest first.",
      request: { query: runQuerySchema },
      responses: {
        200: json(runPageSchema.openapi("RunLogPage"), "One page of run logs."),
        ...pick(400, 401),
      },
    }),
    async (c) => c.json(await queryRunLogs(deps.conn, c.req.valid("query")), 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/settings",
      tags: ["Settings"],
      security,
      summary: "Get settings",
      responses: { 200: json(SettingsSchema, "Current settings."), ...pick(401) },
    }),
    async (c) => c.json(await loadSettings(deps.conn), 200),
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/settings",
      tags: ["Settings"],
      security,
      summary: "Update settings",
      description:
        "`retentionDays` is how long history and run logs are kept. Older rows are deleted by an hourly job. Use 0 to keep everything.",
      request: { body: jsonBody(SettingsSchema) },
      responses: { 200: json(SettingsSchema, "The saved settings."), ...pick(400, 401) },
    }),
    async (c) => {
      const settings = c.req.valid("json");
      await saveSettings(deps.conn, settings);
      return c.json(settings, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/dashboard",
      tags: ["Dashboard"],
      security,
      summary: "Get dashboard figures",
      description: `Totals plus a per-day count of processed notifications for the last ${DASHBOARD_DAYS} days, bucketed in the viewer's time zone.`,
      request: { query: dashboardQuerySchema },
      responses: {
        200: json(dashboardSchema.openapi("Dashboard"), "Dashboard figures."),
        ...pick(400, 401),
      },
    }),
    async (c) => {
      const { tzOffset } = c.req.valid("query");
      const now = deps.now();
      const offsetMs = tzOffset * 60_000;
      // Midnight today in the viewer's zone, expressed as a UTC instant.
      const today = Math.floor((now + offsetMs) / DAY_MS) * DAY_MS - offsetMs;
      const start = today - (DASHBOARD_DAYS - 1) * DAY_MS;

      const [accounts, rules, total, last24h, last7d, buckets, runs] = await Promise.all([
        listAccounts(deps.conn),
        listRules(deps.conn),
        countHistory(deps.conn),
        countHistory(deps.conn, now - DAY_MS),
        countHistory(deps.conn, now - 7 * DAY_MS),
        countHistoryBuckets(deps.conn, { start, size: DAY_MS, buckets: DASHBOARD_DAYS }),
        queryRunLogs(deps.conn, { page: 1, pageSize: 5 }),
      ]);

      return c.json(
        {
          accounts: {
            total: accounts.length,
            enabled: accounts.filter((a) => a.enabled === 1).length,
            unhealthy: accounts.filter((a) => a.status !== "ok").length,
          },
          rules: { total: rules.length, enabled: rules.filter((r) => r.enabled).length },
          processed: { last24h, last7d, total },
          daily: buckets.map((count, index) => ({
            date: new Date(start + index * DAY_MS + offsetMs).toISOString().slice(0, 10),
            count,
          })),
          recentRuns: runs.items,
        },
        200,
      );
    },
  );

  return app;
}

import { Scalar } from "@scalar/hono-api-reference";
import { secureHeaders } from "hono/secure-headers";
import { HTTPException } from "hono/http-exception";
import type { Deps } from "./deps";
import { ApiError, unauthorized } from "./errors";
import { accountRoutes } from "./routes/accounts";
import { authRoutes } from "./routes/auth";
import { dataRoutes } from "./routes/data";
import { ConditionLeafSchema } from "./routes/condition-docs";
import { createRouter } from "./routes/helpers";
import { ruleRoutes } from "./routes/rules";
import { SESSION_COOKIE, currentSession } from "./services/auth";

const PUBLIC_ROUTES = new Set([
  "GET /api/health",
  "GET /api/status",
  "POST /api/setup",
  "POST /api/auth/login",
  "POST /api/auth/logout",
  "GET /api/openapi.json",
  "GET /api/docs",
]);

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const API_DESCRIPTION = `Mewte polls the notifications of one or more GitHub accounts and marks the ones that match your rules as done.

All endpoints live under \`/api\`. Apart from the few marked public, they require the \`${SESSION_COOKIE}\` session cookie set by \`POST /api/auth/login\`.

Errors share one shape: \`{ "error": { "code": "...", "message": "..." } }\`. \`code\` is stable and meant for programs; \`message\` is English text meant for logs.

Timestamps are Unix epoch milliseconds.`;

export function createApp(deps: Deps) {
  const app = createRouter();

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json(
        { error: { code: error.code, message: error.message } },
        error.status,
        error.headers,
      );
    }
    if (error instanceof HTTPException) {
      // Raised by the framework itself, e.g. for a body that is not valid JSON.
      const code = error.status === 404 ? "not_found" : "validation_error";
      return c.json({ error: { code, message: error.message || "Bad request" } }, error.status);
    }
    deps.logger.error(`${c.req.method} ${c.req.path} failed`, error);
    return c.json({ error: { code: "internal_error", message: "Internal server error" } }, 500);
  });

  app.notFound((c) => c.json({ error: { code: "not_found", message: "No such endpoint" } }, 404));

  // The API reference loads its viewer from a CDN, so it is the one page without the CSP.
  app.use("*", async (c, next) => {
    const docs = c.req.path === "/api/docs";
    return secureHeaders({
      contentSecurityPolicy: docs
        ? undefined
        : {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
          },
      crossOriginEmbedderPolicy: false,
    })(c, next);
  });

  // The session cookie is SameSite=Lax; this also refuses cross-site writes outright.
  app.use("/api/*", async (c, next) => {
    if (!SAFE_METHODS.has(c.req.method)) {
      const site = c.req.header("sec-fetch-site");
      const origin = c.req.header("origin");
      const host =
        (deps.config.trustProxy && c.req.header("x-forwarded-host")) || c.req.header("host");
      const foreignOrigin = origin !== undefined && URL.parse(origin)?.host !== host;
      if (site === "cross-site" || foreignOrigin) {
        throw new ApiError(403, "forbidden", "Cross-site requests are not allowed");
      }
    }
    await next();
  });

  app.use("/api/*", async (c, next) => {
    if (!PUBLIC_ROUTES.has(`${c.req.method} ${c.req.path}`)) {
      const current = await currentSession(deps, c);
      if (!current) throw unauthorized();
      c.set("user", current.user);
      c.set("session", current.session);
    }
    await next();
  });

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.route("/api", authRoutes(deps));
  app.route("/api", accountRoutes(deps));
  app.route("/api", ruleRoutes(deps));
  app.route("/api", dataRoutes(deps));

  app.openAPIRegistry.register("ConditionLeaf", ConditionLeafSchema);
  app.openAPIRegistry.registerComponent("securitySchemes", "sessionCookie", {
    type: "apiKey",
    in: "cookie",
    name: SESSION_COOKIE,
    description: "Session cookie set by `POST /api/auth/login`.",
  });

  app.doc31("/api/openapi.json", {
    openapi: "3.1.0",
    info: { title: "Mewte API", version: "1.0.0", description: API_DESCRIPTION },
    tags: [
      { name: "Auth", description: "First-run setup, sign-in and password." },
      { name: "Two-factor authentication", description: "Optional TOTP with recovery codes." },
      { name: "GitHub accounts", description: "Accounts whose notifications are polled." },
      {
        name: "Rules",
        description: "Conditions that decide which notifications are marked as done.",
      },
      { name: "History", description: "Snapshots of processed notifications." },
      { name: "Run logs", description: "One record per poll." },
      { name: "Settings", description: "Instance-wide settings." },
      { name: "Dashboard", description: "Summary figures." },
    ],
  });

  app.get("/api/docs", Scalar({ url: "/api/openapi.json", pageTitle: "Mewte API" }));

  return app;
}

export type App = ReturnType<typeof createApp>;

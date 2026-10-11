import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Hono } from "hono";
import { serveStatic } from "hono/bun";

/** Finds the built web app: WEB_DIST if set, otherwise the sibling workspace's output. */
export function findWebDist(configured: string | undefined, entryDir: string): string | undefined {
  const candidates = configured
    ? [resolve(configured)]
    : [join(entryDir, "../../web/dist"), join(entryDir, "../public")];
  return candidates.find((dir) => existsSync(join(dir, "index.html")));
}

/** Serves the single-page app, falling back to index.html for client-side routes. */
// oxlint-disable-next-line typescript/no-explicit-any -- accepts any Hono app regardless of its Env
export function serveWeb(app: Hono<any>, root: string): void {
  app.use(
    "*",
    serveStatic({
      root,
      onFound: (path, c) => {
        // Vite fingerprints everything under /assets, so those files never change.
        c.header(
          "Cache-Control",
          path.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
        );
      },
    }),
  );
  app.get("*", async (c, next) => {
    if (c.req.path.startsWith("/api/")) return next();
    c.header("Cache-Control", "no-cache");
    return c.html(await Bun.file(join(root, "index.html")).text());
  });
}

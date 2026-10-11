import { listDueAccounts } from "@mewte/db";
import type { Deps } from "../deps";
import { cleanup } from "./retention";
import { runAccount } from "./runner";

const TICK_MS = 60_000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const CONCURRENCY = 3;

async function inParallel<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item);
  });
  await Promise.all(workers);
}

export interface Scheduler {
  /** Runs every due account once, then housekeeping. Overlapping calls are ignored. */
  tick(): Promise<void>;
  /** Starts ticking once a minute. Returns a function that stops it. */
  start(): () => void;
}

export function createScheduler(deps: Deps): Scheduler {
  let ticking = false;
  let lastCleanupAt: number | undefined;

  async function tick() {
    if (ticking) return;
    ticking = true;
    try {
      const due = await listDueAccounts(deps.conn, deps.now());
      await inParallel(due, CONCURRENCY, async (account) => {
        try {
          await runAccount(deps, account.id, "schedule");
        } catch (error) {
          deps.logger.error(`Scheduled run crashed for ${account.login}`, error);
        }
      });

      const now = deps.now();
      if (lastCleanupAt === undefined || now - lastCleanupAt >= CLEANUP_INTERVAL_MS) {
        lastCleanupAt = now;
        await cleanup(deps);
      }
    } catch (error) {
      deps.logger.error("Scheduler tick failed", error);
    } finally {
      ticking = false;
    }
  }

  return {
    tick,
    start() {
      const timer = setInterval(() => void tick(), TICK_MS);
      void tick();
      return () => clearInterval(timer);
    },
  };
}

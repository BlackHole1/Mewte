import {
  deleteExpiredAttempts,
  deleteExpiredCache,
  deleteExpiredSessions,
  deleteHistoryBefore,
  deleteRunLogsBefore,
} from "@mewte/db";
import type { Deps } from "../deps";
import { LOGIN_WINDOW_MS } from "./auth";
import { loadSettings } from "./settings";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CleanupResult {
  history: number;
  runLogs: number;
}

/** Deletes data past its retention period. Idempotent, so any instance may run it. */
export async function cleanup(deps: Pick<Deps, "conn" | "now">): Promise<CleanupResult> {
  const now = deps.now();
  const { retentionDays } = await loadSettings(deps.conn);
  const result: CleanupResult = { history: 0, runLogs: 0 };
  if (retentionDays > 0) {
    const cutoff = now - retentionDays * DAY_MS;
    result.history = await deleteHistoryBefore(deps.conn, cutoff);
    result.runLogs = await deleteRunLogsBefore(deps.conn, cutoff);
  }
  await deleteExpiredSessions(deps.conn, now);
  await deleteExpiredCache(deps.conn, now);
  await deleteExpiredAttempts(deps.conn, now, LOGIN_WINDOW_MS);
  return result;
}

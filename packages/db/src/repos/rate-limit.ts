import type { Conn } from "../types";

export interface AttemptWindow {
  attempts: number;
  /** When the window ends and the count starts again. */
  resetAt: number;
}

/** Attempts recorded for `bucket` inside the current window. */
export async function getAttempts(
  conn: Conn,
  bucket: string,
  now: number,
  windowMs: number,
): Promise<AttemptWindow> {
  const row = await conn.db
    .selectFrom("loginAttempts")
    .selectAll()
    .where("bucket", "=", bucket)
    .executeTakeFirst();
  if (!row || row.windowStart + windowMs <= now) return { attempts: 0, resetAt: now + windowMs };
  return { attempts: row.attempts, resetAt: row.windowStart + windowMs };
}

/**
 * Counts one more attempt, starting a new window if the old one has passed.
 * The increment is a single statement, so attempts made at the same moment, on this
 * instance or another, are all counted and none can slip in under a limit.
 */
export async function recordAttempt(
  conn: Conn,
  bucket: string,
  now: number,
  windowMs: number,
): Promise<AttemptWindow> {
  const expired = now - windowMs;
  const insert = conn.db
    .insertInto("loginAttempts")
    .values({ bucket, attempts: 1, windowStart: now });
  // `attempts` is listed first: MySQL applies the assignments in order, and it has to
  // see the old window start.
  if (conn.kind === "mysql") {
    await insert
      .onDuplicateKeyUpdate((eb) => ({
        attempts: eb
          .case()
          .when("windowStart", "<=", expired)
          .then(1)
          .else(eb("attempts", "+", 1))
          .end(),
        windowStart: eb
          .case()
          .when("windowStart", "<=", expired)
          .then(now)
          .else(eb.ref("windowStart"))
          .end(),
      }))
      .execute();
  } else {
    await insert
      .onConflict((oc) =>
        oc.column("bucket").doUpdateSet((eb) => ({
          attempts: eb
            .case()
            .when("loginAttempts.windowStart", "<=", expired)
            .then(1)
            .else(eb("loginAttempts.attempts", "+", 1))
            .end(),
          windowStart: eb
            .case()
            .when("loginAttempts.windowStart", "<=", expired)
            .then(now)
            .else(eb.ref("loginAttempts.windowStart"))
            .end(),
        })),
      )
      .execute();
  }
  return getAttempts(conn, bucket, now, windowMs);
}

/** Takes back one attempt that turned out not to be a failure. */
export async function refundAttempt(conn: Conn, bucket: string): Promise<void> {
  await conn.db
    .updateTable("loginAttempts")
    .set((eb) => ({ attempts: eb("attempts", "-", 1) }))
    .where("bucket", "=", bucket)
    .where("attempts", ">", 0)
    .execute();
}

export async function clearAttempts(conn: Conn, bucket: string): Promise<void> {
  await conn.db.deleteFrom("loginAttempts").where("bucket", "=", bucket).execute();
}

export async function deleteExpiredAttempts(
  conn: Conn,
  now: number,
  windowMs: number,
): Promise<void> {
  await conn.db
    .deleteFrom("loginAttempts")
    .where("windowStart", "<=", now - windowMs)
    .execute();
}

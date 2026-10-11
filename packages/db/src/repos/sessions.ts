import type { Selectable } from "kysely";
import type { Conn, SessionsTable } from "../types";

export type SessionRecord = Selectable<SessionsTable>;

export async function createSession(conn: Conn, session: SessionRecord): Promise<void> {
  await conn.db.insertInto("sessions").values(session).execute();
}

export async function getSession(
  conn: Conn,
  id: string,
  now: number,
): Promise<SessionRecord | undefined> {
  return conn.db
    .selectFrom("sessions")
    .selectAll()
    .where("id", "=", id)
    .where("expiresAt", ">", now)
    .executeTakeFirst();
}

export async function touchSession(
  conn: Conn,
  id: string,
  now: number,
  expiresAt: number,
): Promise<void> {
  await conn.db
    .updateTable("sessions")
    .set({ lastSeenAt: now, expiresAt })
    .where("id", "=", id)
    .execute();
}

export async function deleteSession(conn: Conn, id: string): Promise<void> {
  await conn.db.deleteFrom("sessions").where("id", "=", id).execute();
}

/** Signs the user out everywhere, optionally keeping the session that made the request. */
export async function deleteUserSessions(
  conn: Conn,
  userId: string,
  exceptId?: string,
): Promise<void> {
  let query = conn.db.deleteFrom("sessions").where("userId", "=", userId);
  if (exceptId) query = query.where("id", "!=", exceptId);
  await query.execute();
}

export async function deleteExpiredSessions(conn: Conn, now: number): Promise<void> {
  await conn.db.deleteFrom("sessions").where("expiresAt", "<=", now).execute();
}

import type { Selectable } from "kysely";
import type { Conn, UsersTable } from "../types";

export type UserRecord = Selectable<UsersTable>;

/** Mewte is single-user: a fixed id makes a second owner row impossible, even under a race. */
export const OWNER_ID = "owner";

export async function getOwner(conn: Conn): Promise<UserRecord | undefined> {
  return conn.db.selectFrom("users").selectAll().where("id", "=", OWNER_ID).executeTakeFirst();
}

/** Returns false when an owner already exists. */
export async function createOwner(
  conn: Conn,
  input: { username: string; passwordHash: string; now: number },
): Promise<boolean> {
  if (await getOwner(conn)) return false;
  try {
    await conn.db
      .insertInto("users")
      .values({
        id: OWNER_ID,
        username: input.username,
        passwordHash: input.passwordHash,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .execute();
    return true;
  } catch (error) {
    if (await getOwner(conn)) return false;
    throw error;
  }
}

export async function updatePasswordHash(
  conn: Conn,
  passwordHash: string,
  now: number,
): Promise<void> {
  await conn.db
    .updateTable("users")
    .set({ passwordHash, updatedAt: now })
    .where("id", "=", OWNER_ID)
    .execute();
}

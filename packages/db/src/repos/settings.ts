import type { Conn } from "../types";
import { upsert } from "../upsert";

export async function getSetting(conn: Conn, name: string): Promise<string | undefined> {
  const row = await conn.db
    .selectFrom("settings")
    .select("value")
    .where("name", "=", name)
    .executeTakeFirst();
  return row?.value;
}

export async function setSetting(conn: Conn, name: string, value: string): Promise<void> {
  await upsert(conn, "settings", { name, value }, ["name"]);
}

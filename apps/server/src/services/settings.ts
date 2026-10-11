import { type Conn, getSetting, setSetting } from "@mewte/db";
import { DEFAULT_RETENTION_DAYS, type Settings, settingsSchema } from "@mewte/shared";

const RETENTION_DAYS = "retention_days";

export async function loadSettings(conn: Conn): Promise<Settings> {
  const raw = await getSetting(conn, RETENTION_DAYS);
  const parsed = settingsSchema.safeParse({ retentionDays: raw === undefined ? NaN : Number(raw) });
  return parsed.success ? parsed.data : { retentionDays: DEFAULT_RETENTION_DAYS };
}

export async function saveSettings(conn: Conn, settings: Settings): Promise<void> {
  await setSetting(conn, RETENTION_DAYS, String(settings.retentionDays));
}

import { DEFAULT_LOCALE, LOCALES, type Locale } from "@mewte/shared";

/** Maps a BCP 47 tag such as `zh-Hant-HK` or `fr-CA` to a locale Mewte ships. */
export function matchLocale(tag: string): Locale | undefined {
  const lower = tag.trim().toLowerCase();
  if (!lower) return undefined;

  const exact = LOCALES.find((locale) => locale.toLowerCase() === lower);
  if (exact) return exact;

  const parts = lower.split(/[-_]/);
  if (parts[0] === "zh") {
    const traditional = parts.includes("hant") || ["tw", "hk", "mo"].some((r) => parts.includes(r));
    return traditional ? "zh-TW" : "zh-CN";
  }
  return LOCALES.find((locale) => locale.toLowerCase() === parts[0]);
}

/** The user's saved choice wins; otherwise the first browser language Mewte supports. */
export function resolveLocale(stored: string | null, preferred: readonly string[]): Locale {
  const saved = stored ? matchLocale(stored) : undefined;
  if (saved) return saved;
  for (const tag of preferred) {
    const match = matchLocale(tag);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

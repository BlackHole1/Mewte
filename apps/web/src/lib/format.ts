import { useMemo } from "react";
import { useTranslation } from "react-i18next";

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

export interface Formatters {
  /** e.g. "Oct 5, 2026, 12:00". */
  dateTime(timestamp: number): string;
  /** e.g. "5 minutes ago" or "in 2 hours". */
  relative(timestamp: number): string;
  /** Like `relative`, but a moment that is already due reads as "now". */
  upcoming(timestamp: number): string;
  /** A calendar day given as YYYY-MM-DD, e.g. "Oct 5". */
  day(isoDate: string): string;
  number(value: number): string;
}

export function useFormat(): Formatters {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;

  return useMemo(() => {
    const dateTime = new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" });
    const day = new Intl.DateTimeFormat(language, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    const relative = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
    const number = new Intl.NumberFormat(language);

    const fromNow = (delta: number) => {
      for (const [unit, size] of UNITS) {
        if (Math.abs(delta) >= size) return relative.format(Math.round(delta / size), unit);
      }
      return t("common.now");
    };

    return {
      dateTime: (timestamp) => dateTime.format(timestamp),
      day: (isoDate) => day.format(new Date(`${isoDate}T00:00:00Z`)),
      number: (value) => number.format(value),
      relative: (timestamp) => fromNow(timestamp - Date.now()),
      upcoming: (timestamp) => fromNow(Math.max(0, timestamp - Date.now())),
    };
  }, [language, t]);
}

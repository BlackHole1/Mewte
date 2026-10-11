import { LOCALES, type Locale } from "@mewte/shared";
import { useTranslation } from "react-i18next";
import { LOCALE_NAMES, setLanguage } from "@/i18n";
import { THEMES, type Theme, setTheme, useTheme } from "@/lib/theme";
import { SimpleSelect } from "./simple-select";

const LANGUAGE_OPTIONS = LOCALES.map((locale) => ({ value: locale, label: LOCALE_NAMES[locale] }));

export function LanguageSelect({ className, id }: { className?: string; id?: string }) {
  const { t, i18n } = useTranslation();
  const current = (LOCALES as readonly string[]).includes(i18n.language)
    ? (i18n.language as Locale)
    : "en";
  return (
    <SimpleSelect
      ariaLabel={t("language.label")}
      className={className}
      id={id}
      onChange={(locale) => void setLanguage(locale)}
      options={LANGUAGE_OPTIONS}
      value={current}
    />
  );
}

export function ThemeSelect({ className, id }: { className?: string; id?: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const options = THEMES.map((value) => ({ value, label: t(`theme.${value}`) }));
  return (
    <SimpleSelect<Theme>
      ariaLabel={t("theme.label")}
      className={className}
      id={id}
      onChange={setTheme}
      options={options}
      value={theme}
    />
  );
}

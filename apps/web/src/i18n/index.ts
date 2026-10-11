import { DEFAULT_LOCALE, type Locale } from "@mewte/shared";
import i18n, { type BackendModule, type ResourceKey } from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import { resolveLocale } from "./resolve";

export const LANGUAGE_STORAGE_KEY = "mewte-lang";

/** Each language is named in itself, so it is recognisable whatever the current one is. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  ja: "日本語",
  ko: "한국어",
  ru: "Русский",
  fr: "Français",
  es: "Español",
};

// English ships in the main bundle as the fallback; the others load on demand.
const loaders = import.meta.glob<{ default: ResourceKey }>([
  "./locales/*.json",
  "!./locales/en.json",
]);

const lazyLocales: BackendModule = {
  type: "backend",
  init() {},
  read(language, _namespace, callback) {
    const load = loaders[`./locales/${language}.json`];
    if (!load) {
      callback(new Error(`No translations for ${language}`), null);
      return;
    }
    load().then(
      (module) => callback(null, module.default),
      (error: unknown) => callback(error instanceof Error ? error : new Error(String(error)), null),
    );
  },
};

function storedLanguage(): string | null {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

const initial = resolveLocale(storedLanguage(), navigator.languages ?? [navigator.language]);

void i18n
  .use(lazyLocales)
  .use(initReactI18next)
  .init({
    lng: initial,
    fallbackLng: DEFAULT_LOCALE,
    resources: { en: { translation: en } },
    partialBundledLanguages: true,
    interpolation: { escapeValue: false },
    returnNull: false,
  });

document.documentElement.lang = initial;
i18n.on("languageChanged", (language) => {
  // Drives the :lang() selectors that order the CJK fallback fonts.
  document.documentElement.lang = language;
});

/** Switches language and remembers the choice in this browser. */
export async function setLanguage(locale: Locale): Promise<void> {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, locale);
  } catch {
    // Private mode: the choice still applies for this visit.
  }
  await i18n.changeLanguage(locale);
}

export default i18n;

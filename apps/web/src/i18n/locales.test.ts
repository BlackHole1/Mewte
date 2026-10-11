import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONDITION_FIELDS,
  ERROR_CODES,
  FIELD_OPERATORS,
  KNOWN_REASONS,
  KNOWN_SUBJECT_TYPES,
  LOCALES,
  RUN_STATUSES,
  RUN_TRIGGERS,
  SUBJECT_STATES,
} from "@mewte/shared";
import { describe, expect, it } from "vitest";
import { matchLocale, resolveLocale } from "./resolve";

const srcDir = fileURLToPath(new URL("..", import.meta.url));
const localesDir = fileURLToPath(new URL("./locales", import.meta.url));

type Messages = { [key: string]: string | Messages };

function load(locale: string): Map<string, string> {
  const flat = new Map<string, string>();
  const walk = (node: Messages, prefix: string) => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "string") flat.set(path, value);
      else walk(value, path);
    }
  };
  walk(JSON.parse(readFileSync(join(localesDir, `${locale}.json`), "utf8")) as Messages, "");
  return flat;
}

const placeholders = (text: string) =>
  [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).toSorted();

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "ui" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

const en = load("en");
const sources = sourceFiles(srcDir).map((path) => ({
  name: relative(srcDir, path),
  text: readFileSync(path, "utf8"),
}));

describe("locale files", () => {
  it("ships one file per supported locale", () => {
    const files = readdirSync(localesDir).map((name) => name.replace(/\.json$/, ""));
    expect(files.toSorted()).toEqual(LOCALES.toSorted());
  });

  for (const locale of LOCALES) {
    describe(locale, () => {
      const messages = load(locale);

      it("has exactly the keys of the English file", () => {
        expect([...messages.keys()].toSorted()).toEqual([...en.keys()].toSorted());
      });

      it("has no empty messages", () => {
        const empty = [...messages].filter(([, text]) => text.trim() === "").map(([key]) => key);
        expect(empty).toEqual([]);
      });

      it("keeps the placeholders of the English file", () => {
        const mismatched = [...en]
          .filter(
            ([key, text]) =>
              placeholders(messages.get(key) ?? "").join() !== placeholders(text).join(),
          )
          .map(([key]) => key);
        expect(mismatched).toEqual([]);
      });
    });
  }
});

describe("keys used by the app", () => {
  it("defines every key passed to t() as a literal", () => {
    const missing = new Set<string>();
    for (const { name, text } of sources) {
      for (const match of text.matchAll(/\bt\(\s*"([\w.-]+)"/g)) {
        if (!en.has(match[1]!)) missing.add(`${name}: ${match[1]}`);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it("covers every value interpolated into a key", () => {
    const expected = [
      ...ERROR_CODES.map((code) => `errors.${code}`),
      "errors.network",
      "errors.unknown",
      ...KNOWN_REASONS.map((reason) => `reasons.${reason}`),
      ...KNOWN_SUBJECT_TYPES.map((type) => `subjectTypes.${type}`),
      ...SUBJECT_STATES.map((state) => `states.${state}`),
      ...CONDITION_FIELDS.map((field) => `conditions.fields.${field}`),
      ...Object.values(FIELD_OPERATORS)
        .flat()
        .map((operator) => `conditions.operators.${operator}`),
      ...["all", "any", "none", "notAll"].map((mode) => `conditions.modes.${mode}`),
      ...["and", "or", "not", "andNot", "orNot"].map((word) => `conditions.connectors.${word}`),
      ...["system", "light", "dark"].map((theme) => `theme.${theme}`),
      ...["dashboard", "accounts", "rules", "history", "runs", "settings"].map(
        (item) => `nav.${item}`,
      ),
      ...RUN_STATUSES.map((status) => `runs.statuses.${status}`),
      ...RUN_TRIGGERS.map((trigger) => `runs.triggers.${trigger}`),
      ...["disable", "regenerate"].flatMap((action) => [
        `totp.${action}Title`,
        `totp.${action}Description`,
      ]),
    ];
    expect(expected.filter((key) => !en.has(key))).toEqual([]);
  });

  it("has no unused messages outside the interpolated groups", () => {
    const dynamic =
      /^(errors|reasons|subjectTypes|states|theme|nav|conditions\.(fields|fieldHints|operators|modes|connectors)|runs\.(statuses|triggers)|totp\.(disable|regenerate)(Title|Description))(\.|$)/;
    const all = sources.map((source) => source.text).join("\n");
    const unused = [...en.keys()].filter((key) => !dynamic.test(key) && !all.includes(`"${key}"`));
    expect(unused).toEqual([]);
  });
});

describe("hardcoded copy", () => {
  // Words that are the same in every language and may appear verbatim.
  const allowed = /^(Mewte|GitHub|API|TOTP)$/;

  it("keeps user-facing text out of the components", () => {
    const offenders: string[] = [];
    for (const { name, text } of sources) {
      if (!name.endsWith(".tsx")) continue;
      text.split("\n").forEach((line, index) => {
        const jsxText = line.match(/>\s*([A-Za-z][A-Za-z ,.'!?-]*[A-Za-z.!?])\s*<\//)?.[1];
        const attribute = line.match(
          /\b(?:aria-label|title|placeholder|alt|label)="([^"]*[A-Za-z][^"]*)"/,
        )?.[1];
        for (const found of [jsxText, attribute]) {
          if (found && !allowed.test(found)) offenders.push(`${name}:${index + 1}: ${found}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe("matchLocale", () => {
  it("matches exact tags regardless of case", () => {
    expect(matchLocale("zh-CN")).toBe("zh-CN");
    expect(matchLocale("ZH-tw")).toBe("zh-TW");
    expect(matchLocale("ja")).toBe("ja");
  });

  it("falls back to the base language", () => {
    expect(matchLocale("fr-CA")).toBe("fr");
    expect(matchLocale("en-GB")).toBe("en");
    expect(matchLocale("es_419")).toBe("es");
    expect(matchLocale("ko-KR")).toBe("ko");
  });

  it("picks the right Chinese script", () => {
    expect(matchLocale("zh")).toBe("zh-CN");
    expect(matchLocale("zh-Hans-SG")).toBe("zh-CN");
    expect(matchLocale("zh-HK")).toBe("zh-TW");
    expect(matchLocale("zh-Hant")).toBe("zh-TW");
    expect(matchLocale("zh-Hant-CN")).toBe("zh-TW");
  });

  it("rejects languages Mewte does not ship", () => {
    expect(matchLocale("de-DE")).toBeUndefined();
    expect(matchLocale("")).toBeUndefined();
  });
});

describe("resolveLocale", () => {
  it("prefers the saved choice", () => {
    expect(resolveLocale("ko", ["fr-FR", "en"])).toBe("ko");
  });

  it("uses the first supported browser language", () => {
    expect(resolveLocale(null, ["de-DE", "ru-RU", "en"])).toBe("ru");
  });

  it("ignores a saved value it does not recognise", () => {
    expect(resolveLocale("klingon", ["ja-JP"])).toBe("ja");
  });

  it("defaults to English", () => {
    expect(resolveLocale(null, [])).toBe("en");
    expect(resolveLocale(null, ["de", "it"])).toBe("en");
  });
});

import { create } from "zustand";

import { en, type Dictionary } from "./en";
import { ru } from "./ru";

export type Locale = "en" | "ru";
export type LocalePreference = Locale | "auto";

const DICTIONARIES: Record<Locale, Dictionary> = { en, ru };

const detect = (): Locale => {
  const app = window.Telegram?.WebApp;
  const raw =
    (app?.initDataUnsafe?.user as { language_code?: string } | undefined)?.language_code ??
    navigator.language ??
    "en";
  return raw.toLowerCase().startsWith("ru") || raw.toLowerCase().startsWith("uk") ? "ru" : "en";
};

const walk = (dictionary: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((node, key) => {
    if (node && typeof node === "object" && key in (node as Record<string, unknown>)) {
      return (node as Record<string, unknown>)[key];
    }
    return undefined;
  }, dictionary);

const fill = (template: string, vars?: Record<string, string | number>): string => {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
};

interface I18nState {
  preference: LocalePreference;
  locale: Locale;
  setPreference: (preference: LocalePreference) => void;
}

export const useI18n = create<I18nState>((set) => ({
  preference: "auto",
  locale: detect(),
  setPreference: (preference) =>
    set({ preference, locale: preference === "auto" ? detect() : preference }),
}));

/**
 * Which suffixed key a count wants. English needs one extra form, Russian
 * needs two, and a key that does not declare them simply keeps its base form,
 * so adding a plural anywhere is a matter of writing the key.
 */
const pluralSuffix = (locale: Locale, count: number): string => {
  const n = Math.abs(Math.trunc(count));
  if (locale === "ru") {
    const tens = n % 100;
    const ones = n % 10;
    if (ones === 1 && tens !== 11) return "";
    if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return "Plural";
    return "Many";
  }
  return n === 1 ? "" : "Plural";
};

export function translate(
  path: string,
  vars?: Record<string, string | number>,
  locale?: Locale,
): string {
  const active = locale ?? useI18n.getState().locale;
  let value = walk(DICTIONARIES[active], path) ?? walk(DICTIONARIES.en, path);

  const count = vars?.count;
  if (typeof count === "number") {
    const suffix = pluralSuffix(active, count);
    if (suffix) {
      // Only the active language is consulted for a plural form. Reaching into
      // English for one would print an English sentence inside a Russian
      // screen, which is worse than the wrong ending.
      const form =
        walk(DICTIONARIES[active], path + suffix) ??
        (suffix === "Many" ? walk(DICTIONARIES[active], `${path}Plural`) : undefined);
      if (typeof form === "string") value = form;
    }
  }

  if (typeof value === "string") return fill(value, vars);
  return path;
}

export function translateList(path: string, locale?: Locale): string[] {
  const active = locale ?? useI18n.getState().locale;
  const value = walk(DICTIONARIES[active], path) ?? walk(DICTIONARIES.en, path);
  return Array.isArray(value) ? (value as string[]) : [];
}

/** A rule is a heading and a paragraph, so it cannot come back as a string. */
export interface RuleEntry {
  t: string;
  d: string;
}

export function translateRules(path: string, locale?: Locale): RuleEntry[] {
  const active = locale ?? useI18n.getState().locale;
  const value = walk(DICTIONARIES[active], path) ?? walk(DICTIONARIES.en, path);
  return Array.isArray(value) ? (value as RuleEntry[]) : [];
}

export const useT = () => {
  const locale = useI18n((state) => state.locale);
  return {
    locale,
    t: (path: string, vars?: Record<string, string | number>) => translate(path, vars, locale),
    list: (path: string) => translateList(path, locale),
    rules: (path: string) => translateRules(path, locale),
  };
};

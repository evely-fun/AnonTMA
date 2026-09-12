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

export function translate(
  path: string,
  vars?: Record<string, string | number>,
  locale?: Locale,
): string {
  const active = locale ?? useI18n.getState().locale;
  const value = walk(DICTIONARIES[active], path) ?? walk(DICTIONARIES.en, path);
  if (typeof value === "string") return fill(value, vars);
  return path;
}

export function translateList(path: string, locale?: Locale): string[] {
  const active = locale ?? useI18n.getState().locale;
  const value = walk(DICTIONARIES[active], path) ?? walk(DICTIONARIES.en, path);
  return Array.isArray(value) ? (value as string[]) : [];
}

export const useT = () => {
  const locale = useI18n((state) => state.locale);
  return {
    locale,
    t: (path: string, vars?: Record<string, string | number>) => translate(path, vars, locale),
    list: (path: string) => translateList(path, locale),
  };
};

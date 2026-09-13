import { webApp } from "./telegram";

export const PALETTES = [
  "auto",
  "obsidian",
  "indigo",
  "moss",
  "amethyst",
  "terracotta",
  "dusk",
  "cobalt",
  "garnet",
  "chrome",
  "sepia",
] as const;

export type Palette = (typeof PALETTES)[number];
export type ThemeMode = "auto" | "dark" | "light";

const DARK_GROUND = 0.17;
const LIGHT_GROUND = 0.986;

const channel = (value: number): string => {
  const linear =
    value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
  const byte = Math.round(Math.min(1, Math.max(0, linear)) * 255);
  return byte.toString(16).padStart(2, "0");
};

export const oklchToHex = (lightness: number, chroma: number, hue: number): string => {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const long = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const red = 4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short;
  const green = -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short;
  const blue = -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short;
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
};

export const systemScheme = (): "dark" | "light" => {
  const app = webApp();
  if (app?.colorScheme) return app.colorScheme;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
};

export const resolveScheme = (mode: ThemeMode): "dark" | "light" =>
  mode === "auto" ? systemScheme() : mode;

export const applyAppearance = (mode: ThemeMode, palette: Palette): void => {
  const root = document.documentElement;
  const scheme = resolveScheme(mode);

  root.dataset.theme = scheme;
  if (palette === "auto") {
    delete root.dataset.palette;
  } else {
    root.dataset.palette = palette;
  }

  const computed = getComputedStyle(root);
  const hue = Number.parseFloat(computed.getPropertyValue("--ground-hue")) || 70;
  const rawChroma = Number.parseFloat(computed.getPropertyValue("--ground-chroma"));
  const chroma = Number.isNaN(rawChroma) ? 0.018 : rawChroma;
  const shell = oklchToHex(
    scheme === "dark" ? DARK_GROUND : LIGHT_GROUND,
    scheme === "dark" ? chroma : chroma * 0.35,
    hue,
  );

  const app = webApp();
  app?.setHeaderColor?.(shell);
  app?.setBackgroundColor?.(shell);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", shell);
};

export const watchScheme = (listener: () => void): (() => void) => {
  const app = webApp();
  if (app) {
    app.onEvent("themeChanged", listener);
    return () => app.offEvent("themeChanged", listener);
  }
  const query = window.matchMedia?.("(prefers-color-scheme: light)");
  query?.addEventListener("change", listener);
  return () => query?.removeEventListener("change", listener);
};

interface Geometry {
  groundHue: number;
  groundChroma: number;
  accentHue: number;
  accentChroma: number;
}

export const PALETTE_GEOMETRY: Record<Palette, Geometry> = {
  auto: { groundHue: 70, groundChroma: 0.01, accentHue: 28, accentChroma: 0.17 },
  obsidian: { groundHue: 250, groundChroma: 0.008, accentHue: 172, accentChroma: 0.11 },
  indigo: { groundHue: 278, groundChroma: 0.03, accentHue: 276, accentChroma: 0.14 },
  moss: { groundHue: 155, groundChroma: 0.022, accentHue: 152, accentChroma: 0.13 },
  amethyst: { groundHue: 305, groundChroma: 0.03, accentHue: 300, accentChroma: 0.15 },
  terracotta: { groundHue: 45, groundChroma: 0.028, accentHue: 48, accentChroma: 0.15 },
  dusk: { groundHue: 285, groundChroma: 0.026, accentHue: 268, accentChroma: 0.13 },
  cobalt: { groundHue: 248, groundChroma: 0.026, accentHue: 245, accentChroma: 0.16 },
  garnet: { groundHue: 12, groundChroma: 0.028, accentHue: 18, accentChroma: 0.16 },
  chrome: { groundHue: 250, groundChroma: 0, accentHue: 250, accentChroma: 0.01 },
  sepia: { groundHue: 75, groundChroma: 0.026, accentHue: 62, accentChroma: 0.12 },
};

export const paletteSwatch = (
  palette: Palette,
  scheme: "dark" | "light",
): { ground: string; accent: string } => {
  const geometry = PALETTE_GEOMETRY[palette];
  const dark = scheme === "dark";
  return {
    ground: oklchToHex(
      dark ? 0.19 : 0.96,
      dark ? geometry.groundChroma * 1.1 : geometry.groundChroma * 0.5,
      geometry.groundHue,
    ),
    accent: oklchToHex(
      dark ? 0.72 : 0.55,
      dark ? geometry.accentChroma : geometry.accentChroma * 1.15,
      geometry.accentHue,
    ),
  };
};

interface RoleColours {
  accent: string;
  live: string;
  warn: string;
  danger: string;
  ink: string;
  surface: string;
  line: string;
}

/**
 * Canvas libraries cannot parse the oklch tokens the stylesheet uses, so the
 * same values are resolved to hex from the palette geometry on the root.
 */
export const roleColours = (): RoleColours => {
  const computed = getComputedStyle(document.documentElement);
  const number = (token: string, fallback: number): number => {
    const value = Number.parseFloat(computed.getPropertyValue(token));
    return Number.isNaN(value) ? fallback : value;
  };
  const dark = (document.documentElement.dataset.theme ?? "dark") !== "light";

  const accentHue = number("--accent-hue", 28);
  const accentChroma = number("--accent-chroma", 0.17);
  const groundHue = number("--ground-hue", 70);
  const groundChroma = number("--ground-chroma", 0.01);

  return {
    accent: oklchToHex(dark ? 0.72 : 0.55, accentChroma, accentHue),
    live: dark ? oklchToHex(0.8, 0.15, 150) : oklchToHex(0.56, 0.15, 152),
    warn: dark ? oklchToHex(0.83, 0.17, 78) : oklchToHex(0.62, 0.15, 62),
    danger: dark ? oklchToHex(0.66, 0.19, 26) : oklchToHex(0.55, 0.2, 26),
    ink: dark ? oklchToHex(0.97, 0.005, groundHue) : oklchToHex(0.24, groundChroma * 1.4, groundHue),
    surface: dark
      ? oklchToHex(0.215, groundChroma * 1.1, groundHue)
      : oklchToHex(1, 0, groundHue),
    line: dark ? "#ffffff14" : "#1a1a1f14",
  };
};

/** Appends an 8 bit alpha channel to a #rrggbb value. */
export const withAlpha = (hex: string, alpha: number): string =>
  `${hex}${Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0")}`;

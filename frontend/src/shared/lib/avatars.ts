import { createAvatar } from "@dicebear/core";

import asuka from "@/assets/portraits/asuka.webp";
import kitsune from "@/assets/portraits/kitsune.webp";
import neko from "@/assets/portraits/neko.webp";
import pilot from "@/assets/portraits/pilot.webp";
import ronin from "@/assets/portraits/ronin.webp";
import scholar from "@/assets/portraits/scholar.webp";

/**
 * Every style draws a person. The abstract sets, robots, shapes, thumbs and
 * the flat geometric fallback, are gone: a mask you wear in a conversation
 * should be a face, and a wall of coloured polygons read as filler.
 */
export type AvatarStyle =
  | "adventurer"
  | "notionists"
  | "lorelei"
  | "openPeeps"
  | "micah"
  | "personas"
  | "bigSmile"
  | "avataaars"
  | "pixelArt"
  | PortraitStyle;

/**
 * Drawn characters rather than generated ones. A seeded set can only ever
 * recombine the parts it shipped with, so every account eventually meets its
 * own face on someone else. These are one of a kind: you pick one, and it is
 * yours until you change it.
 */
export type PortraitStyle =
  | "asuka"
  | "neko"
  | "ronin"
  | "kitsune"
  | "pilot"
  | "scholar";

export const PORTRAITS: Record<PortraitStyle, string> = {
  asuka,
  neko,
  ronin,
  kitsune,
  pilot,
  scholar,
};

export const PORTRAIT_STYLES = Object.keys(PORTRAITS) as PortraitStyle[];

export const isPortrait = (style: string): style is PortraitStyle =>
  style in PORTRAITS;

/**
 * One character comes free, the Seeker, and everything else is earned. A
 * handful of free styles meant most people never looked at the shop at all.
 */
export const FREE_AVATAR_STYLES: AvatarStyle[] = ["adventurer"];

export const AVATAR_STYLES: AvatarStyle[] = [
  ...PORTRAIT_STYLES,
  "adventurer",
  "notionists",
  "lorelei",
  "openPeeps",
  "micah",
  "personas",
  "bigSmile",
  "avataaars",
  "pixelArt",
];

type StyleModule = { create: unknown; meta: unknown; schema: unknown };
type Loader = () => Promise<StyleModule>;

const LOADERS: Partial<Record<AvatarStyle, Loader>> = {
  adventurer: () => import("@dicebear/adventurer"),
  notionists: () => import("@dicebear/notionists"),
  lorelei: () => import("@dicebear/lorelei"),
  openPeeps: () => import("@dicebear/open-peeps"),
  micah: () => import("@dicebear/micah"),
  personas: () => import("@dicebear/personas"),
  bigSmile: () => import("@dicebear/big-smile"),
  avataaars: () => import("@dicebear/avataaars"),
  pixelArt: () => import("@dicebear/pixel-art"),
};

/** The Seeker. Everyone starts here and can reroll it as often as they like. */
export const DEFAULT_AVATAR_STYLE: AvatarStyle = "adventurer";

export const defaultStyleFor = (_gender?: string): AvatarStyle => DEFAULT_AVATAR_STYLE;

/**
 * The Seeker is the same character for everyone, so gender is expressed inside
 * it rather than by handing people a different style. Adventurer's hair sets
 * split cleanly along those lines, which is enough to read as one or the other
 * without pretending the seed alone would have done it.
 */
const HAIR: Record<string, string[]> = {
  female: Array.from({ length: 26 }, (_, index) => `long${String(index + 1).padStart(2, "0")}`),
  male: Array.from({ length: 19 }, (_, index) => `short${String(index + 1).padStart(2, "0")}`),
};

const genderOptions = (style: AvatarStyle, gender: string | undefined) =>
  style === "adventurer" && gender && HAIR[gender] ? { hair: HAIR[gender] } : {};

const BASE_OPTIONS = {
  backgroundType: ["gradientLinear"],
  backgroundColor: ["2b4a7d", "1a5f72", "3d4a7a", "265f5a", "1f5a9c", "4a4470"],
  radius: 50,
  scale: 88,
};

let counter = 0;

const namespaceIds = (svg: string, suffix: string): string => {
  const ids = new Set<string>();
  for (const match of svg.matchAll(/\sid="([^"]+)"/g)) {
    ids.add(match[1]);
  }
  let output = svg;
  for (const id of ids) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    output = output
      .replace(new RegExp(`id="${escaped}"`, "g"), `id="${id}-${suffix}"`)
      .replace(new RegExp(`url\\(#${escaped}\\)`, "g"), `url(#${id}-${suffix})`)
      .replace(new RegExp(`href="#${escaped}"`, "g"), `href="#${id}-${suffix}"`);
  }
  return output;
};

const loaded = new Map<AvatarStyle, StyleModule>();
const cache = new Map<string, string>();
const pending = new Map<AvatarStyle, Promise<unknown>>();

export const isStyleReady = (style: AvatarStyle): boolean =>
  isPortrait(style) || loaded.has(style);

export async function loadStyle(style: AvatarStyle): Promise<void> {
  // A portrait is a file, there is nothing to fetch and compile.
  if (isPortrait(style)) return;
  if (loaded.has(style)) return;
  const loader = LOADERS[style];
  if (!loader) return;
  let task = pending.get(style);
  if (!task) {
    task = loader()
      .then((module) => {
        loaded.set(style, module);
        return module;
      })
      .catch(() => undefined)
      .finally(() => pending.delete(style));
    pending.set(style, task);
  }
  await task;
}

export function renderAvatar(style: AvatarStyle, seed: string, gender?: string): string | null {
  const key = `${style}:${seed}:${gender ?? ""}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const collection = loaded.get(style);
  if (!collection) return null;

  let svg: string;
  try {
    svg = createAvatar(collection as never, {
      ...BASE_OPTIONS,
      ...genderOptions(style, gender),
      seed,
    } as never).toString();
  } catch {
    return null;
  }

  // DiceBear emits no width or height, so an inline SVG falls back to 300x150.
  svg = svg.replace(
    "<svg ",
    '<svg width="100%" height="100%" preserveAspectRatio="xMidYMid meet" ',
  );

  // Ids come from the seed alone, so two styles on one seed would collide and
  // the second avatar would resolve url(#id) against the first one's mask.
  svg = namespaceIds(svg, `${style}-${counter++}`);

  if (cache.size > 240) cache.clear();
  cache.set(key, svg);
  return svg;
}

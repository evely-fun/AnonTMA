import { createAvatar } from "@dicebear/core";

export type AvatarStyle =
  | "geometric"
  | "lorelei"
  | "notionists"
  | "openPeeps"
  | "thumbs"
  | "pixelArt"
  | "shapes";

export const AVATAR_STYLES: AvatarStyle[] = [
  "geometric",
  "lorelei",
  "notionists",
  "openPeeps",
  "thumbs",
  "pixelArt",
  "shapes",
];

type StyleModule = { create: unknown; meta: unknown; schema: unknown };
type Loader = () => Promise<StyleModule>;

const LOADERS: Record<Exclude<AvatarStyle, "geometric">, Loader> = {
  lorelei: () => import("@dicebear/lorelei"),
  notionists: () => import("@dicebear/notionists"),
  openPeeps: () => import("@dicebear/open-peeps"),
  thumbs: () => import("@dicebear/thumbs"),
  pixelArt: () => import("@dicebear/pixel-art"),
  shapes: () => import("@dicebear/shapes"),
};

const GENDER_DEFAULTS: Record<string, AvatarStyle> = {
  female: "lorelei",
  male: "notionists",
  unknown: "thumbs",
};

export const defaultStyleFor = (gender: string | undefined): AvatarStyle =>
  GENDER_DEFAULTS[gender ?? "unknown"] ?? "thumbs";

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
  style === "geometric" || loaded.has(style);

export async function loadStyle(style: AvatarStyle): Promise<void> {
  if (style === "geometric" || loaded.has(style)) return;
  let task = pending.get(style);
  if (!task) {
    task = LOADERS[style]()
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

export function renderAvatar(style: AvatarStyle, seed: string): string | null {
  if (style === "geometric") return null;
  const key = `${style}:${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const collection = loaded.get(style);
  if (!collection) return null;

  let svg: string;
  try {
    svg = createAvatar(collection as never, { ...BASE_OPTIONS, seed } as never).toString();
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

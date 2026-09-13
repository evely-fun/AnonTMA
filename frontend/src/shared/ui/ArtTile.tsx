import { m } from "motion/react";

import call from "@/assets/tiles/call.webp";
import friends from "@/assets/tiles/friends.webp";
import invite from "@/assets/tiles/invite.webp";
import leaderboard from "@/assets/tiles/leaderboard.webp";
import levels from "@/assets/tiles/levels.webp";
import premium from "@/assets/tiles/premium.webp";
import rewards from "@/assets/tiles/rewards.webp";
import rooms from "@/assets/tiles/rooms.webp";
import search from "@/assets/tiles/search.webp";
import settings from "@/assets/tiles/settings.webp";
import shop from "@/assets/tiles/shop.webp";
import wardrobe from "@/assets/tiles/wardrobe.webp";
import { spring } from "@/shared/lib/motion";
import { haptic } from "@/shared/lib/telegram";

export type TileArt =
  | "wardrobe"
  | "shop"
  | "rewards"
  | "premium"
  | "leaderboard"
  | "invite"
  | "settings"
  | "rooms"
  | "friends"
  | "search"
  | "call"
  | "levels";

/** Flat ground of each illustration, so a tile holds its colour before the
 *  image decodes and never flashes an empty box. */
const ART: Record<TileArt, { src: string; tint: string }> = {
  wardrobe: { src: wardrobe, tint: "#d38103" },
  shop: { src: shop, tint: "#5823c0" },
  rewards: { src: rewards, tint: "#df322e" },
  premium: { src: premium, tint: "#cf9002" },
  leaderboard: { src: leaderboard, tint: "#016227" },
  invite: { src: invite, tint: "#1173e1" },
  settings: { src: settings, tint: "#83776e" },
  rooms: { src: rooms, tint: "#0252d0" },
  friends: { src: friends, tint: "#45c176" },
  search: { src: search, tint: "#ba035e" },
  call: { src: call, tint: "#047982" },
  levels: { src: levels, tint: "#c53f10" },
};

export const tileArt = (art: TileArt) => ART[art];

/**
 * A destination drawn rather than labelled. The picture carries the meaning and
 * the word confirms it, which is the opposite of a row of identical glyphs.
 */
export const ArtTile = ({
  art,
  title,
  note,
  onClick,
  wide = false,
}: {
  art: TileArt;
  title: string;
  note?: string;
  onClick: () => void;
  wide?: boolean;
}) => {
  const { src, tint } = ART[art];

  if (wide) {
    return (
      <m.button
        type="button"
        onClick={onClick}
        onPointerDown={() => haptic.select()}
        whileTap={{ scale: 0.98 }}
        transition={spring.snappy}
        className="panel flex w-full items-center gap-3.5 overflow-hidden rounded-[20px] p-2.5 text-left"
      >
        <span
          className="size-[52px] shrink-0 overflow-hidden rounded-[15px]"
          style={{ backgroundColor: tint }}
        >
          <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
        </span>
        <span className="min-w-0 flex-1 pr-1">
          <span className="block font-display text-[15px] font-bold leading-tight">{title}</span>
          {note && (
            <span className="mt-0.5 block text-[12.5px] leading-snug text-hint">{note}</span>
          )}
        </span>
      </m.button>
    );
  }

  return (
    <m.button
      type="button"
      onClick={onClick}
      onPointerDown={() => haptic.select()}
      whileTap={{ scale: 0.96 }}
      transition={spring.snappy}
      className="relative flex aspect-square flex-col justify-end overflow-hidden rounded-[22px] text-left"
      style={{ backgroundColor: tint }}
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-0 size-full object-cover"
      />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" />
      <span className="relative p-3">
        <span className="block font-display text-[14.5px] font-extrabold leading-tight text-white">
          {title}
        </span>
        {note && (
          <span className="mt-0.5 block text-[11.5px] leading-tight text-white/80">{note}</span>
        )}
      </span>
    </m.button>
  );
};

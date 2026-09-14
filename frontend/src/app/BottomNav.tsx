import { m } from "motion/react";
import { NavLink, useLocation } from "react-router-dom";

import { useT } from "@/shared/i18n";
import { spring } from "@/shared/lib/motion";
import { haptic } from "@/shared/lib/telegram";
import {
  FindMark,
  FriendsMark,
  PlayMark,
  ProfileMark,
  RoomsMark,
} from "@/shared/ui/navicons";

/**
 * Each tab owns one of the five section hues, so the tab you are on is the
 * only colour in the row and it is always the same colour as the screen it
 * opens. Everything else sits in plain grey.
 */
const TABS = [
  { to: "/", key: "find", Mark: FindMark, hue: "search" },
  { to: "/rooms", key: "rooms", Mark: RoomsMark, hue: "rooms" },
  { to: "/games", key: "play", Mark: PlayMark, hue: "games" },
  { to: "/friends", key: "friends", Mark: FriendsMark, hue: "friends" },
  { to: "/profile", key: "profile", Mark: ProfileMark, hue: "profile" },
];

export const BottomNav = () => {
  const { t } = useT();
  const location = useLocation();
  const current = TABS.find((tab) =>
    tab.to === "/" ? location.pathname === "/" : location.pathname.startsWith(tab.to),
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-[480px]">
      <div className="nav-island relative flex w-full items-stretch gap-0.5 rounded-t-[20px] px-2 pb-[calc(5px+env(safe-area-inset-bottom))] pt-1.5">
        {TABS.map(({ to, key, Mark, hue }) => {
          const active = current?.to === to;
          const tint = `oklch(var(--nav-l) var(--chroma-${hue}) var(--hue-${hue}))`;
          return (
            <NavLink
              key={to}
              to={to}
              onPointerDown={() => haptic.select()}
              className="relative z-10 flex flex-1 flex-col items-center justify-center gap-1 py-1"
              style={active ? { color: tint } : undefined}
            >
              <m.span
                className="flex size-6 items-center justify-center"
                animate={{ scale: active ? 1.06 : 1, y: active ? -1 : 0 }}
                transition={spring.snappy}
              >
                <Mark
                  size={21}
                  filled={active}
                  className={active ? "" : "text-hint/70"}
                />
              </m.span>
              <span
                className={`font-display text-[9.5px] font-bold tracking-tight transition-colors duration-200 ${
                  active ? "" : "text-hint/70"
                }`}
              >
                {t(`nav.${key}`)}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

import { m } from "motion/react";
import { NavLink, useLocation } from "react-router-dom";

import navFind from "@/assets/nav/find.webp";
import navFriends from "@/assets/nav/friends.webp";
import navPlay from "@/assets/nav/play.webp";
import navProfile from "@/assets/nav/profile.webp";
import navRooms from "@/assets/nav/rooms.webp";
import { useT } from "@/shared/i18n";
import { spring } from "@/shared/lib/motion";
import { haptic } from "@/shared/lib/telegram";

/**
 * The marks are drawn objects rather than glyphs, one per tab, each in the
 * colour of the screen it opens. There is one file per tab and not two: the
 * tab you are not on is the same drawing with the colour taken out of it, so
 * the two states can never drift apart or sit at different sizes.
 */
const TABS = [
  { to: "/", key: "find", art: navFind },
  { to: "/rooms", key: "rooms", art: navRooms },
  { to: "/games", key: "play", art: navPlay },
  { to: "/friends", key: "friends", art: navFriends },
  { to: "/profile", key: "profile", art: navProfile },
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
        {TABS.map(({ to, key, art }) => {
          const active = current?.to === to;
          return (
            <NavLink
              key={to}
              to={to}
              onPointerDown={() => haptic.select()}
              className="relative z-10 flex flex-1 flex-col items-center justify-center gap-1 py-1"
            >
              <m.img
                src={art}
                alt=""
                width={28}
                height={28}
                className={`size-7 object-contain ${active ? "" : "nav-mark-dim"}`}
                animate={{ scale: active ? 1.08 : 1, y: active ? -1 : 0 }}
                transition={spring.snappy}
              />
              <span
                className={`font-display text-[9.5px] font-bold tracking-tight transition-colors duration-200 ${
                  active ? "text-label" : "text-hint/70"
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

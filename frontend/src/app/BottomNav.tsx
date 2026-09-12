import { m } from "motion/react";
import { NavLink, useLocation } from "react-router-dom";

import { useT } from "@/shared/i18n";
import { FriendsIcon, GamesIcon, ProfileIcon, RadarIcon, RoomsIcon } from "@/shared/ui/icons";
import { haptic } from "@/shared/lib/telegram";
import { spring } from "@/shared/lib/motion";

const TABS = [
  { to: "/", key: "find", Icon: RadarIcon },
  { to: "/rooms", key: "rooms", Icon: RoomsIcon },
  { to: "/games", key: "play", Icon: GamesIcon },
  { to: "/friends", key: "friends", Icon: FriendsIcon },
  { to: "/profile", key: "profile", Icon: ProfileIcon },
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
        {TABS.map(({ to, key, Icon }) => {
          const active = current?.to === to;
          return (
            <NavLink
              key={to}
              to={to}
              onPointerDown={() => haptic.select()}
              className="relative z-10 flex flex-1 flex-col items-center justify-center gap-0.5 py-1"
            >
              {active && (
                <m.span
                  layoutId="nav-glow"
                  className="absolute inset-x-3 -top-1.5 h-[2px] rounded-full bg-accent"
                  transition={spring.snappy}
                />
              )}
              <m.span
                className="flex size-6 items-center justify-center"
                animate={{ scale: active ? 1.06 : 1 }}
                transition={spring.snappy}
              >
                <Icon
                  size={19}
                  className={`transition-colors duration-200 ${
                    active ? "text-label" : "text-hint"
                  }`}
                />
              </m.span>
              <span
                className={`font-display text-[9.5px] font-bold tracking-tight transition-colors duration-200 ${
                  active ? "text-label" : "text-hint"
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

import { motion } from "framer-motion";
import { NavLink, useLocation } from "react-router-dom";

import { haptics } from "@/shared/lib/telegram";

import styles from "./BottomNav.module.css";

const TABS = [
  { to: "/", label: "Home", icon: "◎" },
  { to: "/rooms", label: "Rooms", icon: "◍" },
  { to: "/games", label: "Games", icon: "◈" },
  { to: "/friends", label: "Friends", icon: "◐" },
  { to: "/profile", label: "Profile", icon: "◉" },
];

export const BottomNav = () => {
  const location = useLocation();
  const active = TABS.find((tab) =>
    tab.to === "/" ? location.pathname === "/" : location.pathname.startsWith(tab.to),
  );

  return (
    <nav className={styles.nav}>
      <div className={styles.inner}>
        {TABS.map((tab) => {
          const selected = active?.to === tab.to;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={[styles.tab, selected ? styles.selected : ""].filter(Boolean).join(" ")}
              onClick={() => haptics.select()}
            >
              {selected ? (
                <motion.span
                  layoutId="nav-indicator"
                  className={styles.indicator}
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              ) : null}
              <span className={styles.icon}>{tab.icon}</span>
              <span className={styles.label}>{tab.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

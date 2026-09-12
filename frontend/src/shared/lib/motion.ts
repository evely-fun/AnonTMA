import type { Transition, Variants } from "motion/react";

export const ease = {
  out: [0.23, 1, 0.32, 1] as const,
  inOut: [0.77, 0, 0.175, 1] as const,
  drawer: [0.32, 0.72, 0, 1] as const,
};

export const spring = {
  snappy: { type: "spring", stiffness: 520, damping: 32, mass: 0.6 } as Transition,
  ui: { type: "spring", stiffness: 320, damping: 30, mass: 0.8 } as Transition,
  soft: { type: "spring", stiffness: 210, damping: 26 } as Transition,
};

export const rise: Variants = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.42, ease: ease.out } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.18 } },
};

export const listStagger: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.05, delayChildren: 0.03 } },
};

export const tabContent: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: ease.out } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.16, ease: ease.out } },
};

export const pushScreen: Variants = {
  initial: { opacity: 0, x: 26 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.36, ease: ease.drawer } },
  exit: { opacity: 0, x: 20, transition: { duration: 0.22, ease: ease.out } },
};

export const sheetPanel: Variants = {
  initial: { y: "100%" },
  animate: { y: 0, transition: { duration: 0.42, ease: ease.drawer } },
  exit: { y: "100%", transition: { duration: 0.26, ease: ease.out } },
};

export const pop: Variants = {
  initial: { opacity: 0, scale: 0.94 },
  animate: { opacity: 1, scale: 1, transition: spring.ui },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.16 } },
};

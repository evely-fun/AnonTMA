import type { Transition, Variants } from "framer-motion";

export const spring: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 34,
  mass: 0.8,
};

export const softSpring: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 28,
};

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 12, scale: 0.99 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { ...spring, mass: 0.7 } },
  exit: { opacity: 0, y: -8, scale: 0.99, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } },
};

export const listVariants: Variants = {
  animate: { transition: { staggerChildren: 0.045, delayChildren: 0.02 } },
};

export const itemVariants: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: softSpring },
  exit: { opacity: 0, y: -10, transition: { duration: 0.14 } },
};

export const sheetVariants: Variants = {
  initial: { y: "100%" },
  animate: { y: 0, transition: { ...spring, damping: 38 } },
  exit: { y: "100%", transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } },
};

export const popVariants: Variants = {
  initial: { opacity: 0, scale: 0.92 },
  animate: { opacity: 1, scale: 1, transition: spring },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.15 } },
};

export const tapScale = { scale: 0.97 };

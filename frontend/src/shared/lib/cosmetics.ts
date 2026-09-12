export type NameEffect = "none" | "gradient" | "glow" | "aurora";

const CLASSES: Record<NameEffect, string> = {
  none: "",
  gradient: "name-gradient",
  glow: "name-glow",
  aurora: "name-aurora",
};

export const nameEffectClass = (effect: string | undefined): string =>
  CLASSES[(effect ?? "none") as NameEffect] ?? "";

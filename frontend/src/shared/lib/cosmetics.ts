export type NameEffect = "none" | "gradient" | "glow" | "aurora";

export type ProfileBackground =
  | "none"
  | "dawn"
  | "tide"
  | "mesh"
  | "nebula"
  | "prism"
  | "aurora";

const CLASSES: Record<NameEffect, string> = {
  none: "",
  gradient: "name-gradient",
  glow: "name-glow",
  aurora: "name-aurora",
};

const BACKGROUNDS: Record<ProfileBackground, string> = {
  none: "",
  dawn: "skin-dawn",
  tide: "skin-tide",
  mesh: "skin-mesh",
  nebula: "skin-nebula",
  prism: "skin-prism",
  aurora: "skin-aurora",
};

export const PROFILE_BACKGROUNDS: ProfileBackground[] = [
  "none",
  "dawn",
  "tide",
  "mesh",
  "nebula",
  "prism",
  "aurora",
];

export const nameEffectClass = (effect: string | undefined): string =>
  CLASSES[(effect ?? "none") as NameEffect] ?? "";

export const backgroundClass = (background: string | undefined): string => {
  const skin = BACKGROUNDS[(background ?? "none") as ProfileBackground];
  return skin ? `skin ${skin}` : "";
};

export type NameEffect =
  | "none"
  | "gradient"
  | "glow"
  | "aurora"
  | "ember"
  | "chrome"
  | "shine"
  | "pulse"
  | "marker"
  | "crimson";

export type ProfileBackground =
  | "none"
  | "dawn"
  | "tide"
  | "mesh"
  | "nebula"
  | "prism"
  | "aurora"
  | "forge";

const CLASSES: Record<NameEffect, string> = {
  none: "",
  gradient: "name-gradient",
  glow: "name-glow",
  aurora: "name-aurora",
  ember: "name-ember",
  chrome: "name-chrome",
  shine: "name-shine",
  pulse: "name-pulse",
  marker: "name-marker",
  crimson: "name-crimson",
};

const BACKGROUNDS: Record<ProfileBackground, string> = {
  none: "",
  dawn: "skin-dawn",
  tide: "skin-tide",
  mesh: "skin-mesh",
  nebula: "skin-nebula",
  prism: "skin-prism",
  aurora: "skin-aurora",
  forge: "skin-forge",
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

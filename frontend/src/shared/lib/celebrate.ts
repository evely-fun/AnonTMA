import confetti from "canvas-confetti";

const tokenColour = (token: string, fallback: string): string => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  if (!value) return fallback;
  // canvas-confetti needs concrete colours, and oklch is not parseable there.
  const probe = document.createElement("span");
  probe.style.color = value;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved || fallback;
};

const palette = (): string[] => [
  tokenColour("--color-accent", "#6aa9ff"),
  tokenColour("--color-live", "#6ee7a8"),
  tokenColour("--color-warn", "#f3c969"),
  tokenColour("--ink-1", "#ffffff"),
];

const reduced = (): boolean =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** A short, restrained burst. Two cones rather than a full screen shower. */
export const celebrate = (intensity: "small" | "big" = "small"): void => {
  if (reduced()) return;
  const colors = palette();
  const count = intensity === "big" ? 90 : 46;

  confetti({
    particleCount: count,
    spread: intensity === "big" ? 78 : 58,
    startVelocity: intensity === "big" ? 42 : 32,
    gravity: 0.9,
    decay: 0.92,
    scalar: 0.85,
    ticks: 180,
    origin: { x: 0.3, y: 0.62 },
    colors,
    disableForReducedMotion: true,
  });
  confetti({
    particleCount: count,
    spread: intensity === "big" ? 78 : 58,
    startVelocity: intensity === "big" ? 42 : 32,
    gravity: 0.9,
    decay: 0.92,
    scalar: 0.85,
    ticks: 180,
    origin: { x: 0.7, y: 0.62 },
    colors,
    disableForReducedMotion: true,
  });
};

/** A slow drift used when a level is gained, so it reads as arrival not noise. */
export const shower = (): void => {
  if (reduced()) return;
  const colors = palette();
  const end = Date.now() + 900;
  const tick = () => {
    confetti({
      particleCount: 4,
      startVelocity: 16,
      spread: 70,
      gravity: 0.5,
      decay: 0.94,
      scalar: 0.7,
      ticks: 220,
      origin: { x: Math.random(), y: -0.1 },
      colors,
      disableForReducedMotion: true,
    });
    if (Date.now() < end) window.requestAnimationFrame(tick);
  };
  tick();
};

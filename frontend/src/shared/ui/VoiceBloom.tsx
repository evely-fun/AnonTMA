import { roleColours } from "@/shared/lib/theme";
import { useEffect, useRef, type ReactNode } from "react";

interface VoiceBloomProps {
  level: number;
  size?: number;
  muted?: boolean;
  tone?: "accent" | "live" | "warn";
  children?: ReactNode;
}

/** Same reason as SignalWave: canvas will not take a calc() bearing oklch. */
const readColor = (tone: string): string => {
  const colours = roleColours();
  if (tone === "accent") return colours.accent;
  if (tone === "warn") return colours.warn;
  if (tone === "danger") return colours.danger;
  return colours.live;
};

/**
 * A soft closed curve whose radius is modulated by a few slow harmonics and
 * driven by the microphone level. It swells and settles like breathing, with
 * no ticks, rings or meters.
 */
export const VoiceBloom = ({
  level,
  size = 236,
  muted = false,
  tone = "live",
  children,
}: VoiceBloomProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levelRef = useRef(level);
  const smoothRef = useRef(0);
  const mutedRef = useRef(muted);

  levelRef.current = level;
  mutedRef.current = muted;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * pixelRatio;
    canvas.height = size * pixelRatio;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const centre = size / 2;
    const base = size * 0.3;
    let colour = readColor(tone);
    let frame = 0;
    const start = performance.now();

    // Each lobe drifts at its own rate so the outline never repeats exactly.
    const lobes = [
      { count: 3, speed: 0.32, weight: 1 },
      { count: 5, speed: -0.21, weight: 0.55 },
      { count: 7, speed: 0.14, weight: 0.3 },
    ];

    const radiusAt = (angle: number, time: number, reach: number): number => {
      let offset = 0;
      for (const lobe of lobes) {
        offset += Math.sin(angle * lobe.count + time * lobe.speed * Math.PI) * lobe.weight;
      }
      return base * (1 + reach * 0.26 * (offset / 1.85));
    };

    const trace = (time: number, reach: number, scale: number) => {
      context.beginPath();
      for (let step = 0; step <= 72; step += 1) {
        const angle = (step / 72) * Math.PI * 2;
        const radius = radiusAt(angle, time, reach) * scale;
        const x = centre + Math.cos(angle) * radius;
        const y = centre + Math.sin(angle) * radius;
        if (step === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
    };

    const draw = (now: number) => {
      const time = reduced ? 0 : (now - start) / 1000;
      const target = mutedRef.current ? 0 : Math.min(1, levelRef.current);
      smoothRef.current += (target - smoothRef.current) * 0.16;
      const reach = 0.25 + smoothRef.current * 1.5;

      context.clearRect(0, 0, size, size);
      colour = readColor(tone);

      // Outer halo, then two nested outlines for depth.
      const halo = context.createRadialGradient(centre, centre, base * 0.5, centre, centre, base * 1.7);
      halo.addColorStop(0, colour);
      halo.addColorStop(1, "transparent");
      context.globalAlpha = muted ? 0.07 : 0.12 + smoothRef.current * 0.2;
      context.fillStyle = halo;
      trace(time, reach, 1.28);
      context.fill();

      context.globalAlpha = muted ? 0.16 : 0.3;
      context.strokeStyle = colour;
      context.lineWidth = 1;
      trace(time * 0.8 + 1.4, reach * 0.7, 1.14);
      context.stroke();

      context.globalAlpha = muted ? 0.35 : 0.9;
      context.lineWidth = 2;
      trace(time, reach, 1);
      context.stroke();

      context.globalAlpha = muted ? 0.04 : 0.1 + smoothRef.current * 0.12;
      context.fillStyle = colour;
      context.fill();

      context.globalAlpha = 1;
      frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [size, tone, muted]);

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <canvas ref={canvasRef} style={{ width: size, height: size }} aria-hidden="true" />
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
};

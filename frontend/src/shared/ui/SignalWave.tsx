import { roleColours } from "@/shared/lib/theme";
import { useEffect, useRef } from "react";

interface SignalWaveProps {
  /** 0 for a calm idle line, 1 for a fully excited wave. */
  energy?: number;
  height?: number;
  lines?: number;
  className?: string;
}

/**
 * Custom properties come back with their calc() intact, and canvas cannot parse
 * that, so the palette is resolved to hex the same way every other canvas in
 * the app does it.
 */
const readColor = (token: "accent" | "live"): string => roleColours()[token];

/**
 * A calm travelling wave. Three phase shifted sine bands drift across the
 * canvas and fade at both edges, so the motion reads as breath rather than
 * a progress indicator.
 */
export const SignalWave = ({
  energy = 0,
  height = 120,
  lines = 3,
  className = "",
}: SignalWaveProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const energyRef = useRef(energy);
  const smoothRef = useRef(energy);

  energyRef.current = energy;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let frame = 0;
    let width = 0;
    let pixelRatio = 1;
    let accent = readColor("accent");
    let live = readColor("live");

    const resize = () => {
      pixelRatio = Math.min(2, window.devicePixelRatio || 1);
      width = canvas.clientWidth;
      canvas.width = Math.floor(width * pixelRatio);
      canvas.height = Math.floor(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      accent = readColor("accent");
      live = readColor("live");
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const middle = height / 2;
    const start = performance.now();

    const draw = (now: number) => {
      const time = (now - start) / 1000;
      smoothRef.current += (energyRef.current - smoothRef.current) * 0.12;
      const level = smoothRef.current;

      context.clearRect(0, 0, width, height);

      const fade = context.createLinearGradient(0, 0, width, 0);
      fade.addColorStop(0, "transparent");
      fade.addColorStop(0.16, accent);
      fade.addColorStop(0.84, accent);
      fade.addColorStop(1, "transparent");

      for (let band = 0; band < lines; band += 1) {
        const depth = band / Math.max(1, lines - 1);
        const amplitude = (height * 0.16) * (0.35 + level * 1.1) * (1 - depth * 0.45);
        const speed = 0.55 + depth * 0.35;
        const phase = reduced ? 0 : time * speed + band * 1.7;
        const frequency = 1.6 + depth * 0.9;

        context.beginPath();
        for (let x = 0; x <= width; x += 3) {
          const t = x / width;
          const envelope = Math.sin(Math.PI * t) ** 1.4;
          const y =
            middle +
            Math.sin(t * Math.PI * 2 * frequency + phase) * amplitude * envelope +
            Math.sin(t * Math.PI * 2 * (frequency * 0.5) - phase * 0.7) * amplitude * 0.4 * envelope;
          if (x === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }

        context.strokeStyle = band === 0 ? fade : accent;
        context.globalAlpha = band === 0 ? 0.95 : 0.28 - depth * 0.1;
        context.lineWidth = band === 0 ? 2 : 1;
        context.lineCap = "round";
        context.stroke();
      }

      // A single travelling highlight keeps the eye moving without a spinner.
      if (!reduced) {
        const position = ((time * 0.22) % 1.4) - 0.2;
        if (position >= 0 && position <= 1) {
          const x = position * width;
          const envelope = Math.sin(Math.PI * position) ** 1.4;
          const y = middle + Math.sin(position * Math.PI * 2 * 1.6 + time * 0.55) * (height * 0.16) * (0.35 + level * 1.1) * envelope;
          const glow = context.createRadialGradient(x, y, 0, x, y, 26);
          glow.addColorStop(0, live);
          glow.addColorStop(1, "transparent");
          context.globalAlpha = 0.5 * envelope;
          context.fillStyle = glow;
          context.beginPath();
          context.arc(x, y, 26, 0, Math.PI * 2);
          context.fill();

          context.globalAlpha = envelope;
          context.fillStyle = live;
          context.beginPath();
          context.arc(x, y, 3, 0, Math.PI * 2);
          context.fill();
        }
      }

      context.globalAlpha = 1;
      frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [height, lines]);

  return (
    <canvas
      ref={canvasRef}
      className={`block w-full ${className}`}
      style={{ height }}
      aria-hidden="true"
    />
  );
};

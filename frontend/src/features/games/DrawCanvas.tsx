import { useCallback, useEffect, useRef, useState } from "react";

import { haptic } from "@/shared/lib/telegram";

export interface Stroke {
  /** Index into the palette, so a drawing carries no colour strings. */
  c: number;
  w: number;
  /** Points as a flat x,y list in a thousand by thousand square. */
  p: number[];
}

const CANVAS = 1000;
const MAX_STROKES = 120;
const MAX_POINTS = 240;

/**
 * The eight colours a sheet can be drawn in. They are indexes rather than
 * values everywhere else, so a drawing stays a few kilobytes and can be
 * recoloured for a theme without touching what anyone drew.
 */
export const INKS = [
  "#2b2b31",
  "#e0514c",
  "#e8913a",
  "#3fbf8f",
  "#1f7ad6",
  "#8a5cf6",
  "#d94f97",
  "#9a8c7a",
];

const WIDTHS = [3, 6, 12];

/** Draws a set of strokes onto a context sized to its own box. */
export const paint = (
  context: CanvasRenderingContext2D,
  strokes: Stroke[],
  size: number,
): void => {
  const scale = size / CANVAS;
  context.clearRect(0, 0, size, size);
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const stroke of strokes) {
    if (stroke.p.length < 4) continue;
    context.strokeStyle = INKS[stroke.c] ?? INKS[0];
    context.lineWidth = Math.max(1, stroke.w * scale);
    context.beginPath();
    context.moveTo(stroke.p[0] * scale, stroke.p[1] * scale);
    for (let index = 2; index < stroke.p.length; index += 2) {
      context.lineTo(stroke.p[index] * scale, stroke.p[index + 1] * scale);
    }
    context.stroke();
  }
};

/** A finished drawing, shown at whatever size it is given. */
export const DrawnSheet = ({
  strokes,
  size = 220,
  className = "",
}: {
  strokes: Stroke[];
  size?: number;
  className?: string;
}) => {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * ratio;
    canvas.height = size * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    paint(context, strokes, size);
  }, [strokes, size]);

  return (
    <canvas
      ref={ref}
      style={{ width: size, height: size }}
      className={`rounded-[16px] bg-white ${className}`}
    />
  );
};

/**
 * The drawing surface. It is deliberately plain: eight inks, three widths, an
 * undo and a clear. Anything more and people spend the minute in the toolbar
 * rather than on the sheet.
 */
export const DrawCanvas = ({
  onChange,
  disabled,
}: {
  onChange: (strokes: Stroke[]) => void;
  disabled?: boolean;
}) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef<Stroke | null>(null);
  const [size, setSize] = useState(280);
  const [ink, setInk] = useState(0);
  const [width, setWidth] = useState(1);
  const [count, setCount] = useState(0);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== size * ratio) {
      canvas.width = size * ratio;
      canvas.height = size * ratio;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const live = drawingRef.current;
    paint(context, live ? [...strokesRef.current, live] : strokesRef.current, size);
  }, [size]);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const measure = () => setSize(Math.min(node.clientWidth, 340));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(redraw, [redraw, count]);

  const pointAt = (event: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return [0, 0];
    const box = canvas.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * CANVAS;
    const y = ((event.clientY - box.top) / box.height) * CANVAS;
    return [
      Math.max(0, Math.min(CANVAS, Math.round(x))),
      Math.max(0, Math.min(CANVAS, Math.round(y))),
    ];
  };

  const start = (event: React.PointerEvent) => {
    if (disabled || strokesRef.current.length >= MAX_STROKES) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const [x, y] = pointAt(event);
    drawingRef.current = { c: ink, w: WIDTHS[width], p: [x, y] };
    redraw();
  };

  const move = (event: React.PointerEvent) => {
    const live = drawingRef.current;
    if (!live) return;
    const [x, y] = pointAt(event);
    const last = live.p.length;
    // Points closer than a couple of units add nothing but weight.
    if (Math.abs(live.p[last - 2] - x) + Math.abs(live.p[last - 1] - y) < 6) return;
    if (live.p.length >= MAX_POINTS * 2) return;
    live.p.push(x, y);
    redraw();
  };

  const end = () => {
    const live = drawingRef.current;
    drawingRef.current = null;
    if (!live) return;
    if (live.p.length < 4) {
      // A tap is a dot, so it gets a second point of its own.
      live.p.push(live.p[0] + 1, live.p[1] + 1);
    }
    strokesRef.current = [...strokesRef.current, live];
    setCount(strokesRef.current.length);
    onChange(strokesRef.current);
  };

  const undo = () => {
    haptic.select();
    strokesRef.current = strokesRef.current.slice(0, -1);
    setCount(strokesRef.current.length);
    onChange(strokesRef.current);
  };

  const clear = () => {
    haptic.select();
    strokesRef.current = [];
    setCount(0);
    onChange([]);
  };

  return (
    <div ref={wrapRef} className="flex flex-col items-center gap-3">
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size, touchAction: "none" }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        className="rounded-[18px] bg-white"
      />

      <div className="flex w-full items-center justify-center gap-1.5">
        {INKS.map((value, index) => (
          <button
            key={value}
            type="button"
            aria-label={value}
            onClick={() => {
              haptic.select();
              setInk(index);
            }}
            style={{ background: value }}
            className={`size-7 rounded-full transition-transform ${
              ink === index ? "scale-110 ring-2 ring-label ring-offset-2 ring-offset-bg" : ""
            }`}
          />
        ))}
      </div>

      <div className="flex w-full items-center justify-center gap-2">
        {WIDTHS.map((value, index) => (
          <button
            key={value}
            type="button"
            onClick={() => setWidth(index)}
            className={`flex size-9 items-center justify-center rounded-full ${
              width === index ? "bg-label text-bg" : "bg-elevated text-secondary"
            }`}
          >
            <span
              className="rounded-full bg-current"
              style={{ width: value + 2, height: value + 2 }}
            />
          </button>
        ))}
        <button
          type="button"
          onClick={undo}
          disabled={count === 0}
          className="h-9 rounded-full bg-elevated px-4 text-[12.5px] font-semibold text-secondary disabled:opacity-40"
        >
          ↺
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={count === 0}
          className="h-9 rounded-full bg-elevated px-4 text-[12.5px] font-semibold text-secondary disabled:opacity-40"
        >
          ×
        </button>
      </div>
    </div>
  );
};

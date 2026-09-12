import { useCallback, useRef } from "react";

import { haptic } from "@/shared/lib/telegram";

const DELAY = 450;
const SLOP = 12;

export const useLongPress = (onLongPress: () => void, onTap?: () => void) => {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      fired.current = false;
      origin.current = { x: event.clientX, y: event.clientY };
      clear();
      timer.current = window.setTimeout(() => {
        fired.current = true;
        haptic.impact("medium");
        onLongPress();
      }, DELAY);
    },
    [clear, onLongPress],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const start = origin.current;
      if (!start) return;
      if (Math.abs(event.clientX - start.x) > SLOP || Math.abs(event.clientY - start.y) > SLOP) {
        clear();
      }
    },
    [clear],
  );

  const onPointerUp = useCallback(() => {
    clear();
    if (!fired.current) onTap?.();
    origin.current = null;
  }, [clear, onTap]);

  const onPointerCancel = useCallback(() => {
    clear();
    origin.current = null;
  }, [clear]);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
  };
};

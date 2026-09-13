import { useEffect, useRef } from "react";

/**
 * Makes a horizontal rail usable with a mouse.
 *
 * A wheel produces deltaY, and no browser applies deltaY to horizontal
 * overflow, so on a desktop these rows could not be scrolled at all: the
 * scrollbar is hidden by design and the wheel did nothing. The wheel is
 * translated here, and the row can also be dragged with the pointer, which is
 * what a trackpadless mouse is left with.
 *
 * Touch is untouched: the listeners only run where the pointer is fine, and
 * native horizontal panning already works there.
 */
export const useRailScroll = <T extends HTMLElement>() => {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!window.matchMedia?.("(pointer: fine)").matches) return;

    const scrollable = () => node.scrollWidth > node.clientWidth + 1;

    const onWheel = (event: WheelEvent) => {
      if (!scrollable()) return;
      // A trackpad already sends deltaX for a sideways swipe; leave it alone.
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const before = node.scrollLeft;
      node.scrollLeft += event.deltaY;
      // Only swallow the event if the row actually moved, so a wheel at either
      // end still scrolls the page instead of sticking.
      if (node.scrollLeft !== before) event.preventDefault();
    };

    let dragging = false;
    let startX = 0;
    let startLeft = 0;
    let moved = false;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !scrollable()) return;
      dragging = true;
      moved = false;
      startX = event.clientX;
      startLeft = node.scrollLeft;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const delta = event.clientX - startX;
      if (Math.abs(delta) > 3) moved = true;
      node.scrollLeft = startLeft - delta;
    };

    const endDrag = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      // A drag must not also count as a tap on whatever sat under the cursor.
      if (moved) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    node.addEventListener("wheel", onWheel, { passive: false });
    node.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag, true);

    return () => {
      node.removeEventListener("wheel", onWheel);
      node.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag, true);
    };
  }, []);

  return ref;
};
